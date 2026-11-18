// T2: actual custom-alternative, swap, form, cancellation and focus callbacks.
// Authored state/forms/DOM boundaries; no React mount, browser or provider runs.
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
const names = ['beginCustomAlternative', 'submitActivity', 'chooseAlternative', 'close', 'open'];
const callbacks = component.body.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations)
  .filter(node => names.includes(node.name.getText(ast)));
assert.equal(callbacks.length, names.length);
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['field', 'safeUrl'].includes(node.name?.text));
const factorySource = helpers.map(node => node.getText(ast)).join('\n') + '\nmodule.exports = ({trip,day,dayIndex,editing,customAlternativeFor}) => {\n'
  + callbacks.map(node => 'const ' + node.getText(ast) + ';').join('\n') + '\nreturn {' + names.join(',') + '}; };';
function compile(source) {
  const compiled = ts.transpileModule(source, { fileName: 'actual-custom-alternatives.ts', reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  return new vm.Script(compiled.outputText);
}
const script = compile(factorySource);
const plain = value => JSON.parse(JSON.stringify(value));
const controls = new Map(), launchers = [];
const attribute = (node, name) => node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name)?.initializer;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'form'
    && attribute(node.openingElement, 'onSubmit')?.expression?.getText(ast) === 'submitActivity') {
    function fields(child) {
      if (ts.isJsxSelfClosingElement(child) || ts.isJsxOpeningElement(child)) {
        const name = attribute(child, 'name')?.text;
        if (name) controls.set(name, child);
      }
      ts.forEachChild(child, fields);
    }
    fields(node);
  }
  if (ts.isJsxOpeningElement(node) && attribute(node, 'onClick')?.expression?.getText(ast) === 'beginCustomAlternative') launchers.push(node);
  ts.forEachChild(node, visit);
}
visit(component);
assert.equal(launchers.length, 1, 'Use the actual custom-alternative button action.');
const focusEffects = component.body.statements.filter(ts.isExpressionStatement).map(node => node.expression)
  .filter(node => ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('activityForm.current'));
assert.equal(focusEffects.length, 1);
function evaluate(source, scope) {
  const context = vm.createContext({ Error, ...scope, module: { exports: {} } });
  compile('module.exports = (' + source + ');').runInContext(context);
  return context.module.exports;
}
function fixture() {
  const workspace = legacyWorkspace(), trip = workspace.trips[0], base = trip.days[0].activities[0];
  trip.endDate = trip.startDate; trip.days = [trip.days[0]];
  trip.days[0].activities = [
    { ...base, id: 'original-stop', title: 'Original provider stop', category: 'culture', time: '14:30', cost: 5, status: 'planned', source: 'custom',
      bookingUrl: 'https://example.test/original-ticket', event: { provider: 'ticketmaster', id: 'original-provider-id', scheduledDate: trip.startDate, fetchedAt: '2026-11-16T10:00:00.000Z', priceNote: 'Original provider quote' } },
    { ...base, id: 'sibling-option', title: 'Existing sibling option', category: 'culture', time: '14:30', cost: 12, status: 'skipped', alternativeFor: 'original-stop', source: 'demo' },
  ];
  trip.bookings = []; trip.expenses = []; trip.dailyFoodBudget = 0; trip.dailyTransportBudget = 0;
  assert.equal(isTrip(trip), true);
  return { trip, profile: workspace.profile };
}
function harness(prepare) {
  const { trip, profile } = fixture(); prepare?.(trip);
  const ui = { editing: trip.days[0].activities[0], customAlternativeFor: null, modal: 'alternatives' };
  let current = trip, counter = 0, requestId = 0;
  let editor = createWorkspaceEditor({ version: 1, trips: [trip], selectedTripId: trip.id, profile });
  const workspaceRef = { current: editor }, customAlternativeTicket = { current: null };
  const updates = [], errors = [], notices = [], selections = [];
  const context = vm.createContext({
    Error, URL, isTrip, modalEpoch: { current: 0 }, module: { exports: {} }, workspaceEdit: editor, workspaceRef, customAlternativeTicket,
    pendingTripEdit: { current: null }, setTripEditPending() {},
    makeId: prefix => `${prefix}-authored-alternative-${++counter}`,
    FormData: class { constructor(values) { this.values = values; } get(name) { return this.values[name] ?? null; } },
    setEditing: value => { ui.editing = value; }, setCustomAlternativeFor: value => { ui.customAlternativeFor = value; },
    setModal: value => { ui.modal = value; }, setError: value => errors.push(value),
    setEditingBooking() {}, setEventDraft() {}, setShareUrl() {}, setRequests() {}, setShareTripId() {},
    // This scope settles immediately; queued notice/epoch behavior is checked separately.
    commitTripEdit(update, onSuccess) {
      editor = workspaceReducer(editor, { type: 'trip-edit', ticket: { tripId: current.id, identity: editor.tripIdentities.get(current.id), requestId: ++requestId, epoch: 0 }, update });
      current = editor.workspace.trips.find(item => item.id === current.id); workspaceRef.current = editor;
      if (editor.editNotice.accepted) { updates.push(plain(current)); onSuccess(); }
      else errors.push(editor.editNotice.message);
    },
    setSelected: value => selections.push(value), notify: value => notices.push(value),
    fetch() { throw new Error('Network is forbidden in authored alternative checks.'); },
  });
  script.runInContext(context);
  const factory = context.module.exports;
  function render() { context.workspaceEdit = editor; return factory({ trip: current, day: current.days[0], dayIndex: 0, ...ui }); }
  return { ui, profile, updates, errors, notices, selections,
    get trip() { return current; }, get ticket() { return customAlternativeTicket.current; }, render,
    advance(updater) {
      editor = workspaceReducer(editor, { type: 'update', update: workspace => ({ ...workspace, trips: workspace.trips.map(item => item.id === current.id ? updater(item) : item) }) });
      current = editor.workspace.trips.find(item => item.id === current.id); workspaceRef.current = editor;
    },
    replace(updater) {
      current = updater(current); editor = workspaceReducer(editor, { type: 'update', update: { ...editor.workspace, trips: [current] } }); workspaceRef.current = editor;
    },
    select(id) { workspaceRef.current.workspace.selectedTripId = id; },
    start() { render().beginCustomAlternative(); },
    submit(values = {}) { render().submitActivity({ preventDefault() {}, currentTarget: {
      title: 'New authored alternative', category: 'culture', description: 'New authored details', location: 'New meeting place',
      time: '10:00', duration: '60', cost: '9', lat: '0', lng: '0', url: '', ...values,
    } }); },
  };
}
function active(trip) { return trip.days[0].activities.filter(item => !item.alternativeFor); }
function assertDistinct(trip) {
  const activities = trip.days.flatMap(day => day.activities);
  assert.equal(new Set(activities.map(item => item.id)).size, activities.length); assert.equal(isTrip(trip), true);
}

test('custom intent opens a clean new-stop form with only the original time carried over', () => {
  const h = harness(), before = JSON.stringify(h.trip); h.start();
  assert.equal(h.ui.editing, null); assert.equal(h.ui.customAlternativeFor.id, 'original-stop'); assert.equal(h.ui.modal, 'activity');
  assert.equal(h.ticket.tripId, h.trip.id); assert.equal(h.ticket.identity, 1);
  const scope = h.ui;
  for (const name of ['title', 'description', 'location', 'url']) {
    assert.equal(evaluate(attribute(controls.get(name), 'defaultValue').expression.getText(ast), scope), undefined);
  }
  assert.equal(evaluate(attribute(controls.get('isEvent'), 'defaultChecked').expression.getText(ast), scope), false);
  assert.equal(evaluate(attribute(controls.get('time'), 'defaultValue').expression.getText(ast), scope), '14:30');
  assert.equal(evaluate(attribute(controls.get('time'), 'readOnly').expression.getText(ast), scope), true);
  assert.equal(JSON.stringify(h.trip), before); assert.equal(h.updates.length, 0);
});

test('cancelling or switching modal clears intent without mutating the trip', () => {
  for (const exit of [h => h.render().close(), h => h.render().open('booking')]) {
    const h = harness(), before = JSON.stringify(h.trip); h.start(); exit(h);
    assert.equal(h.ui.customAlternativeFor, null); assert.equal(h.ticket, null); assert.equal(h.updates.length, 0); assert.equal(JSON.stringify(h.trip), before);
  }
});

test('custom replacement keeps the original reversible, retains group links, and uses one fresh ID', () => {
  const h = harness(), original = plain(h.trip.days[0].activities[0]); h.start(); h.submit();
  assert.equal(h.updates.length, 1); assert.equal(h.ui.modal, null); assert.equal(h.ui.customAlternativeFor, null);
  const [replacement] = active(h.trip), savedOriginal = h.trip.days[0].activities.find(item => item.id === original.id);
  assert.equal(replacement.id, 'activity-authored-alternative-1'); assert.equal(replacement.time, '14:30'); assert.equal(replacement.status, 'planned');
  assert.equal(replacement.source, 'custom'); assert.equal(replacement.image, undefined); assert.equal(replacement.event, undefined); assert.equal(replacement.bookingUrl, undefined);
  assert.deepEqual(plain(savedOriginal), { ...original, status: 'skipped', alternativeFor: replacement.id });
  assert.equal(h.trip.days[0].activities.find(item => item.id === 'sibling-option').alternativeFor, replacement.id);
  assert.deepEqual(h.selections, [replacement.id]); assert.equal(h.trip.days[0].activities.length, 3); assertDistinct(h.trip);
});

test('a custom event is created only on explicit selection and gets its own manual identity', () => {
  const h = harness(); h.start(); h.submit({ isEvent: 'on', url: 'https://example.test/new-event' });
  const [replacement] = active(h.trip);
  assert.deepEqual(plain(replacement.event), { provider: 'manual', id: 'manual-' + replacement.id, scheduledDate: h.trip.startDate });
  assert.equal(replacement.bookingUrl, 'https://example.test/new-event'); assertDistinct(h.trip);
});

test('invalid custom drafts stay open and preserve all original data', () => {
  for (const values of [{ title: '   ' }, { duration: '4' }, { url: 'ftp://example.test/ticket' }, { category: 'unknown' }]) {
    const h = harness(), before = JSON.stringify(h.trip); h.start(); h.submit(values);
    assert.equal(h.updates.length, 0); assert.equal(h.notices.length, 0); assert.equal(h.ui.modal, 'activity');
    assert.equal(JSON.stringify(h.trip), before); assert.ok(h.errors.at(-1));
  }
});

test('restoring original and sibling options reuses saved IDs and keeps a consistent group', () => {
  const h = harness(); h.start(); h.submit();
  const customId = active(h.trip)[0].id;
  h.ui.editing = active(h.trip)[0]; h.render().chooseAlternative(h.trip.days[0].activities.find(item => item.id === 'original-stop'));
  assert.equal(active(h.trip)[0].id, 'original-stop'); assert.equal(h.trip.days[0].activities.length, 3);
  assert.equal(h.trip.days[0].activities.find(item => item.id === customId).alternativeFor, 'original-stop');
  assert.equal(h.trip.days[0].activities.find(item => item.id === 'sibling-option').alternativeFor, 'original-stop');
  h.ui.editing = active(h.trip)[0]; h.render().chooseAlternative(h.trip.days[0].activities.find(item => item.id === 'sibling-option'));
  assert.equal(active(h.trip)[0].id, 'sibling-option'); assert.equal(h.trip.days[0].activities.length, 3);
  assert.deepEqual(new Set(h.trip.days[0].activities.filter(item => item.alternativeFor).map(item => item.alternativeFor)), new Set(['sibling-option']));
  assertDistinct(h.trip);
});

test('original actual expense remains attached: actual 18 plus new estimate 9 totals 27', () => {
  const h = harness(trip => { trip.expenses = [{ id: 'original-actual', title: 'Authored admission paid', amount: 18, date: trip.startDate, category: 'culture', activityId: 'original-stop' }]; });
  const before = plain(h.trip.expenses); h.start(); h.submit();
  assert.deepEqual(plain(h.trip.expenses), before); const cost = getTripCost(h.trip, h.profile);
  assert.equal(cost.total, 27); assert.equal(cost.spent, 18);
});

test('original reservation remains attached: reservation 20 plus new estimate 9 totals 29', () => {
  const h = harness(trip => { trip.bookings = [{ id: 'original-booking', type: 'event', title: 'Authored old reservation', reference: 'PRIVATE-OLD', date: trip.startDate, cost: 20, status: 'reserved', source: 'custom', activityId: 'original-stop', notes: 'Private original notes' }]; });
  const before = plain(h.trip.bookings); h.start(); h.submit();
  assert.deepEqual(plain(h.trip.bookings), before); const cost = getTripCost(h.trip, h.profile);
  assert.equal(cost.total, 29); assert.equal(cost.spent, 0);
});

test('custom alternatives fill record 60 but refuse a 61st without changing the original', () => {
  for (const count of [59, 60]) {
    const h = harness(trip => { const base = trip.days[0].activities[0]; while (trip.days[0].activities.length < count) trip.days[0].activities.push({ ...base, id: 'filler-' + trip.days[0].activities.length, event: undefined }); });
    const before = JSON.stringify(h.trip); h.start(); h.submit();
    if (count === 59) { assert.equal(h.trip.days[0].activities.length, 60); assert.equal(h.updates.length, 1); assertDistinct(h.trip); }
    else { assert.equal(JSON.stringify(h.trip), before); assert.equal(h.updates.length, 0); assert.match(h.errors.at(-1), /60 stops/); }
  }
});

test('an existing sibling swap at capacity is still permitted without another record', () => {
  const h = harness(trip => { const base = trip.days[0].activities[0]; while (trip.days[0].activities.length < 60) trip.days[0].activities.push({ ...base, id: 'filler-' + trip.days[0].activities.length, event: undefined }); });
  h.render().chooseAlternative(h.trip.days[0].activities.find(item => item.id === 'sibling-option'));
  assert.equal(h.trip.days[0].activities.length, 60); assert.equal(active(h.trip).some(item => item.id === 'sibling-option'), true); assertDistinct(h.trip);
});

test('missing original refuses a custom replacement and latest unrelated edits survive valid swaps', () => {
  const missing = harness(); missing.start(); missing.advance(trip => ({ ...trip, days: trip.days.map(day => ({ ...day, activities: day.activities.filter(item => item.id !== 'original-stop') })) }));
  const before = JSON.stringify(missing.trip); missing.submit(); assert.equal(JSON.stringify(missing.trip), before); assert.equal(missing.updates.length, 0); assert.match(missing.errors.at(-1), /no longer/);
  const h = harness(); h.start(); h.advance(trip => ({ ...trip, description: 'Newer authored edit' })); h.submit();
  assert.equal(h.trip.description, 'Newer authored edit'); assert.equal(h.updates.length, 1);
});

test('same-ID workspace replacement or another selected trip refuses the older custom draft', () => {
  for (const change of [h => h.replace(trip => ({ ...trip, title: 'Same-ID restored incarnation' })), h => h.select('another-selected-trip')]) {
    const h = harness(); h.start(); change(h);
    const before = JSON.stringify(h.trip); h.submit();
    assert.equal(h.updates.length, 0); assert.equal(h.notices.length, 0); assert.equal(h.ui.modal, 'activity');
    assert.equal(JSON.stringify(h.trip), before); assert.match(h.errors.at(-1), /Reopen its alternatives/);
  }
});

test('activity entry and custom mode changes hand focus to the first enabled field', () => {
  const effect = focusEffects[0], dependencies = effect.arguments[1].elements.map(node => node.getText(ast));
  assert.deepEqual(dependencies, ['modal', 'customAlternativeFor?.id'], 'Typing is outside the focus dependencies.');
  for (const modal of ['activity', 'alternatives', 'booking', null]) {
    const selectors = [], focused = [];
    const run = evaluate(effect.arguments[0].getText(ast), { modal, activityForm: { current: { querySelector(selector) { selectors.push(selector); return { focus() { focused.push(true); } }; } } } });
    run(); assert.equal(focused.length, modal === 'activity' ? 1 : 0);
    assert.deepEqual(selectors, modal === 'activity' ? ['input:not([disabled])'] : []);
  }
});
