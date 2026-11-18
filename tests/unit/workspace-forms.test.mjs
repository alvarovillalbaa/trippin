// T2: actual editor form callbacks with authored forms and trip state.
// No React mount, DOM, browser, provider, account or network operation runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import vm from 'node:vm';
import { legacyWorkspace } from '../factories/legacy-workspace.mjs';

const ts = createRequire(import.meta.url)(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const lib = new URL('../../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib) && /^\.\/[\w-]+$/.test(specifier)) return next(new URL(specifier + '.ts', context.parentURL).href, context);
  return next(specifier, context);
} });
const { isTrip, getTripCost } = await import('../../lib/trip.ts');
const { createWorkspaceEditor, workspaceReducer } = await import('../../lib/workspace-state.ts');
const ast = ts.createSourceFile('workspace.tsx', readFileSync(new URL('../../components/workspace.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Workspace');
assert.ok(component?.body);
const names = ['submitActivity', 'submitExpense', 'submitBooking'];
const callbacks = component.body.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations)
  .filter(node => names.includes(node.name.getText(ast)));
assert.equal(callbacks.length, 3, 'Use the three actual editor form callbacks.');
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['field', 'safeUrl'].includes(node.name?.text));
assert.equal(helpers.length, 2);
const compiled = ts.transpileModule(helpers.map(node => node.getText(ast)).join('\n') + '\nmodule.exports = {'
  + callbacks.map(node => node.name.getText(ast) + ':' + node.initializer.getText(ast)).join(',') + '};', {
  fileName: 'actual-workspace-forms.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
const script = new vm.Script(compiled.outputText);
const plain = value => JSON.parse(JSON.stringify(value));
function defaults(kind, trip) {
  if (kind === 'submitActivity') return { title: 'Authored museum stop', category: 'culture', description: 'Private authored notes', time: '13:15', duration: '60', cost: '12.50', lat: '0', lng: '0', location: 'Authored meeting place', url: '' };
  if (kind === 'submitExpense') return { title: 'Authored admission receipt', category: 'culture', amount: '18', date: trip.startDate, estimate: '' };
  return { type: 'event', status: 'reserved', title: 'Authored reservation', reference: 'PRIVATE-REFERENCE', date: trip.startDate, cost: '20', activityId: '', url: 'https://example.test/ticket', notes: 'Private authored reservation notes' };
}
function bookingValues(booking) {
  return { type: booking.type, status: booking.status, title: booking.title, reference: booking.reference, date: booking.date,
    cost: String(booking.cost), activityId: booking.activityId || '', url: booking.url || '', notes: booking.notes || '' };
}
function harness({ prepare, editActivity = false, editBooking = false } = {}) {
  const workspace = legacyWorkspace(), trip = workspace.trips[0];
  prepare?.(trip);
  let editor = createWorkspaceEditor(workspace), current = trip, counter = 0, closed = 0, requestId = 0;
  const identity = editor.tripIdentities.get(trip.id);
  const errors = [], notices = [], updates = [];
  const editing = editActivity ? trip.days[0].activities[0] : null;
  const editingBooking = editBooking ? trip.bookings[0] : null;
  const context = vm.createContext({
    Error, URL, isTrip, trip, day: trip.days[0], dayIndex: 0, editing, editingBooking, customAlternativeFor: null,
    FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? null; } },
    makeId: prefix => `${prefix}-authored-form-${++counter}`,
    setError: message => errors.push(message),
    // This scope settles immediately; queued notice/epoch behavior is checked separately.
    commitTripEdit(update, onSuccess) {
      editor = workspaceReducer(editor, { type: 'trip-edit', ticket: { tripId: trip.id, identity, requestId: ++requestId, epoch: 0 }, update });
      current = editor.workspace.trips.find(item => item.id === trip.id);
      if (editor.editNotice.accepted) { updates.push(plain(current)); onSuccess(); }
      else errors.push(editor.editNotice.message);
    },
    close: () => { closed++; }, notify: message => notices.push(message), module: { exports: {} },
    fetch() { throw new Error('Network is forbidden in authored form checks.'); },
  });
  script.runInContext(context);
  return { trip, profile: workspace.profile, errors, notices, updates, editing, editingBooking,
    get current() { return current; }, get closed() { return closed; },
    advance(updater) {
      editor = workspaceReducer(editor, { type: 'update', update: value => ({ ...value, trips: value.trips.map(item => item.id === trip.id ? updater(item) : item) }) });
      current = editor.workspace.trips.find(item => item.id === trip.id);
    },
    submit(kind, values = {}) { context.module.exports[kind]({ preventDefault() {}, currentTarget: { ...defaults(kind, trip), ...values } }); },
  };
}
function assertRefused(h, before, pattern) {
  assert.match(h.errors.at(-1), pattern);
  assert.equal(h.updates.length, 0); assert.equal(h.closed, 0); assert.equal(h.notices.length, 0);
  assert.equal(JSON.stringify(h.current), before, 'Invalid input must leave every saved trip field intact.');
}

test('saving an unchanged sample reservation preserves sample provenance and private fields', () => {
  const h = harness({ editBooking: true }), before = plain(h.editingBooking), costs = getTripCost(h.trip, h.profile);
  h.submit('submitBooking', bookingValues(h.editingBooking));
  assert.equal(h.closed, 1); assert.equal(h.notices.length, 1); assert.equal(isTrip(h.current), true);
  assert.deepEqual(plain(h.current.bookings[0]), before);
  assert.equal(h.current.bookings[0].source, 'demo');
  assert.deepEqual(getTripCost(h.current, h.profile), costs);
});

test('new linked reservations and actual expenses retain stable linkage and count the actual once', () => {
  const h = harness(), activity = h.trip.days[0].activities.find(item => item.category === 'culture') || h.trip.days[0].activities[0];
  h.submit('submitBooking', { activityId: activity.id });
  const booking = h.current.bookings.at(-1);
  assert.equal(booking.source, 'custom'); assert.equal(booking.activityId, activity.id);
  const expenseHarness = harness({ prepare(trip) { trip.bookings.push(plain(booking)); } });
  expenseHarness.submit('submitExpense', { estimate: 'booking:' + booking.id });
  const expense = expenseHarness.current.expenses.at(-1);
  assert.equal(expense.bookingId, booking.id); assert.equal(expense.activityId, undefined);
  assert.equal(expense.amount, 18); assert.equal(isTrip(expenseHarness.current), true);
  assert.equal(getTripCost(expenseHarness.current, expenseHarness.profile).spent, 18 + expenseHarness.trip.expenses.reduce((sum, item) => sum + item.amount, 0));
});

test('editing a stop retains its ID, sample source, image, event and linked private records', () => {
  const h = harness({ editActivity: true, prepare(trip) {
    const activity = trip.days[0].activities[0];
    activity.event = { provider: 'demo', id: 'authored-event', scheduledDate: trip.startDate };
    trip.expenses.push({ id: 'linked-private-expense', title: 'Authored actual', amount: 7, date: trip.startDate, category: activity.category, activityId: activity.id });
  } });
  const before = plain(h.trip), original = h.editing;
  h.submit('submitActivity', { title: 'Edited authored stop', isEvent: 'on' });
  const saved = h.current.days[0].activities.find(item => item.id === original.id);
  assert.equal(saved.title, 'Edited authored stop'); assert.equal(saved.source, 'demo'); assert.equal(saved.image, original.image);
  assert.deepEqual(plain(saved.event), before.days[0].activities[0].event);
  assert.deepEqual(plain(h.current.bookings), before.bookings); assert.deepEqual(plain(h.current.expenses), before.expenses);
});

test('unsupported nonempty activity and reservation URLs show errors without losing the draft', () => {
  for (const kind of ['submitActivity', 'submitBooking']) for (const url of ['ftp://example.test/ticket', 'mailto:travel@example.test', 'not a URL']) {
    const h = harness(), before = JSON.stringify(h.trip); h.submit(kind, { url });
    assertRefused(h, before, /http:\/\/ or https:\/\//);
  }
});

test('HTTP, HTTPS and deliberately blank optional links remain supported', () => {
  for (const kind of ['submitActivity', 'submitBooking']) for (const url of ['http://example.test/ticket', 'https://example.test/ticket', '']) {
    const h = harness(); h.submit(kind, { url });
    assert.equal(h.closed, 1); assert.equal(isTrip(h.current), true);
    const saved = kind === 'submitActivity' ? h.current.days[0].activities.find(item => item.id.startsWith('activity-authored-form')) : h.current.bookings.at(-1);
    assert.equal(kind === 'submitActivity' ? saved.bookingUrl : saved.url, url || undefined);
  }
});

test('unsupported expense and reservation dates cannot enter memory or report success', () => {
  for (const kind of ['submitExpense', 'submitBooking']) for (const date of ['10000-01-01', '2026-02-30', '']) {
    const h = harness(), before = JSON.stringify(h.trip); h.submit(kind, { date });
    assertRefused(h, before, /date/);
  }
});

test('whole-trip validation rejects invalid stop times, categories and reservation enums', () => {
  for (const [kind, value] of [['submitActivity', { time: '25:30' }], ['submitActivity', { category: 'unknown' }], ['submitExpense', { category: 'unknown' }], ['submitBooking', { type: 'unknown' }], ['submitBooking', { status: 'unknown' }]]) {
    const h = harness(), before = JSON.stringify(h.trip); h.submit(kind, value);
    assertRefused(h, before, /Check/);
  }
});

test('amounts and durations retain the existing visible form bounds', () => {
  const cases = [
    ['submitActivity', { cost: '100001' }], ['submitActivity', { cost: '-1' }], ['submitActivity', { cost: '' }],
    ['submitActivity', { duration: '4' }], ['submitActivity', { duration: '1441' }], ['submitActivity', { duration: '5.5' }],
    ['submitExpense', { amount: '0' }], ['submitExpense', { amount: '1000001' }], ['submitExpense', { amount: 'NaN' }],
    ['submitBooking', { cost: '-1' }], ['submitBooking', { cost: '1000001' }], ['submitBooking', { cost: '' }],
  ];
  for (const [kind, value] of cases) {
    const h = harness(), before = JSON.stringify(h.trip); h.submit(kind, value);
    assertRefused(h, before, /between/);
  }
});

test('required names and stop places cannot become blank after trimming', () => {
  for (const [kind, value] of [...names.map(kind => [kind, { title: '   ' }]), ['submitActivity', { location: '   ' }]]) {
    const h = harness(), before = JSON.stringify(h.trip); h.submit(kind, value);
    assertRefused(h, before, /Add/);
  }
});

test('existing record limits refuse additions while edits at the reservation limit remain valid', () => {
  for (const [kind, key, limit] of [['submitActivity', 'activities', 60], ['submitExpense', 'expenses', 1000], ['submitBooking', 'bookings', 100]]) {
    const h = harness({ prepare(trip) {
      const collection = key === 'activities' ? trip.days[0].activities : trip[key];
      const sample = collection[0] || { id: 'expense-base', title: 'Authored actual', amount: 1, date: trip.startDate, category: 'other' };
      collection.splice(0, collection.length, ...Array.from({ length: limit }, (_, index) => ({ ...sample, id: 'authored-record-' + index })));
    } });
    const before = JSON.stringify(h.trip); h.submit(kind); assertRefused(h, before, /Keep up to/);
  }
  const h = harness({ editBooking: true, prepare(trip) {
    const sample = trip.bookings[0]; trip.bookings = Array.from({ length: 100 }, (_, index) => ({ ...sample, id: 'authored-booking-' + index }));
  } });
  h.submit('submitBooking', bookingValues(h.editingBooking));
  assert.equal(h.current.bookings.length, 100); assert.equal(h.closed, 1); assert.equal(isTrip(h.current), true);
});

test('functional form updates retain newer unrelated private data', () => {
  for (const kind of names) {
    const h = harness();
    const latestExpense = { id: 'newer-imported-actual', title: 'Newer authored CSV row', amount: 4.5, date: h.trip.startDate, category: 'food' };
    h.advance(current => ({ ...current, description: 'Newer trip edit', expenses: [...current.expenses, latestExpense] }));
    h.submit(kind);
    assert.equal(h.closed, 1); assert.equal(h.current.description, 'Newer trip edit');
    assert.deepEqual(plain(h.current.expenses.find(item => item.id === latestExpense.id)), latestExpense);
    assert.equal(isTrip(h.current), true);
  }
});

test('an already linked activity keeps its existing reservation and actuals', () => {
  const h = harness({ prepare(trip) { trip.bookings[0].activityId = trip.days[0].activities[0].id; } });
  const before = JSON.stringify(h.trip); h.submit('submitBooking', { activityId: h.trip.days[0].activities[0].id });
  assertRefused(h, before, /already has a linked reservation/);
});
