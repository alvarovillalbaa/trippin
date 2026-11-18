// T2: actual manual-edit callbacks/effects and real reducer with authored queues.
// No React mount, DOM, browser, persistence, backend, Auth or network executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const lib = new URL('../../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib) && /^\.\/[\w-]+$/.test(specifier)) return next(new URL(specifier + '.ts', context.parentURL).href, context);
  return next(specifier, context);
} });
const { createWorkspaceEditor, workspaceReducer } = await import('../../lib/workspace-state.ts');
const { createTrip, initialWorkspace, getTripDays, isTrip, isWorkspace } = await import('../../lib/trip.ts');
const ast = ts.createSourceFile('workspace.tsx', readFileSync(new URL('../../components/workspace.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Workspace');
assert.ok(component?.body);
const names = ['close', 'open', 'commitTripEdit', 'selectTrip', 'leaveWorkspace', 'submitExpense', 'submitActivity',
  'submitBooking', 'saveTripDetails', 'saveEvent', 'chooseAlternative'];
const declarations = component.body.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations);
const callbacks = names.map(name => {
  const found = declarations.find(node => node.name.getText(ast) === name);
  assert.ok(found?.initializer, 'Extract the actual ' + name + ' callback.'); return found;
});
let finish, warn;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    if (node.arguments[1]?.getText(ast) === '[workspaceEdit.editNotice]') finish = node.arguments[0];
    if (node.arguments[1]?.getText(ast) === '[saveError,tripEditPending]') warn = node.arguments[0];
  }
  ts.forEachChild(node, visit);
}
visit(component);
assert.ok(finish && warn, 'Extract actual edit completion and pending-departure effects.');
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['field', 'safeUrl'].includes(node.name?.text));
assert.equal(helpers.length, 2);
const compiled = ts.transpileModule(helpers.map(node => node.getText(ast)).join('\n')
  + '\nmodule.exports = (trip,day,workspaceEdit,editing,editingBooking,tripEditPending,saveError) => {\n'
  + callbacks.map(node => 'const ' + node.name.getText(ast) + '=' + node.initializer.getText(ast) + ';').join('\n')
  + '\nreturn {' + names.join(',') + ',finish:' + finish.getText(ast) + ',warn:' + warn.getText(ast) + '}; };', {
  fileName: 'actual-manual-trip-edit-ui.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
const script = new vm.Script(compiled.outputText);
const plain = value => JSON.parse(JSON.stringify(value));
const expense = id => ({ id, title: 'Authored private expense', date: '2026-12-01', category: 'other', amount: 1 });
const booking = id => ({ id, title: 'Authored private reservation', type: 'event', reference: 'AUTHORED-PRIVATE',
  date: '2026-12-01', cost: 12, status: 'reserved', source: 'custom' });
const activity = (id, extra = {}) => ({ id, title: 'Authored stop', category: 'culture', description: 'Authored private notes',
  location: 'Authored place', lat: 48.13, lng: 11.57, time: '10:00', duration: 30, cost: 12, status: 'planned', source: 'custom', ...extra });
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function fixture() {
  const value = initialWorkspace('Authored private editor');
  value.trips = [createTrip('munich', '2026-12-01', '2026-12-02', 'Authored first trip'),
    createTrip('lisbon', '2026-12-01', '2026-12-01', 'Authored sibling trip')];
  value.trips.forEach((trip, index) => { trip.id = 'authored-trip-' + index; });
  value.selectedTripId = value.trips[0].id;
  return value;
}
function harness({ prepare, editActivity = false, editBooking = false, modal = 'expense' } = {}) {
  const workspace = fixture(); prepare?.(workspace.trips[0], workspace);
  assert.equal(isWorkspace(workspace), true);
  let editor = createWorkspaceEditor(freeze(workspace)), counter = 0, closed = 0, persisted = 0;
  const queue = [], errors = [], notices = [], events = [], listeners = new Map();
  const state = { modal, tripEditPending: false, saveError: '', selected: 'authored-previous-selection',
    editing: editActivity ? workspace.trips[0].days[0].activities[0] : null,
    editingBooking: editBooking ? workspace.trips[0].bookings[0] : null, dayIndex: 0 };
  const refs = { pendingTripEdit: { current: null }, tripEditGeneration: { current: 0 }, modalEpoch: { current: 0 },
    workspaceRef: { current: editor }, customAlternativeTicket: { current: null }, pendingExit: { current: null },
    departureGeneration: { current: 0 }, backupReadGeneration: { current: 0 },
    backupInput: { current: { value: 'authored-backup-input' } }, fileInput: { current: { value: 'authored-csv-input' } } };
  const setters = {};
  for (const name of ['Modal', 'TripEditPending', 'Editing', 'EditingBooking', 'CustomAlternativeFor', 'EventDraft', 'ShareUrl',
    'Requests', 'ShareTripId', 'Selected', 'DayIndex', 'View', 'MobileMap', 'BudgetOpen', 'LeaveRequested']) {
    const key = name[0].toLowerCase() + name.slice(1);
    setters['set' + name] = value => { state[key] = value; events.push([key, value]); if (name === 'Modal' && value === null) closed++; };
  }
  const context = vm.createContext({ Error, URL, isTrip, getTripDays, ...refs, ...setters,
    customAlternativeFor: null, dayIndex: 0,
    FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? null; } },
    makeId: prefix => `${prefix}-authored-ui-${++counter}`,
    dispatchWorkspace: action => { queue.push(action); events.push(['dispatch', action.type]); },
    setState: update => { queue.push({ type: 'update', update }); events.push(['dispatch', 'update']); },
    setError: value => { errors.push(value); state.error = value; events.push(['error', value]); },
    notify: value => { notices.push(value); events.push(['notice', value]); },
    persistCurrentWorkspace: () => { persisted++; return 'saved'; },
    window: { addEventListener(name, callback) { assert.equal(name, 'beforeunload'); listeners.set(name, callback); },
      removeEventListener(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); } },
    fetch() { throw new Error('Network is forbidden in manual-edit UI checks.'); }, module: { exports: {} },
  });
  script.runInContext(context);
  const render = () => {
    const trip = editor.workspace.trips.find(item => item.id === editor.workspace.selectedTripId) || editor.workspace.trips[0];
    return context.module.exports(trip, trip.days[Math.min(state.dayIndex, trip.days.length - 1)], editor,
      state.editing, state.editingBooking, state.tripEditPending, state.saveError);
  };
  const captured = render();
  const target = () => editor.workspace.trips.find(item => item.id === workspace.trips[0].id);
  function reduceNext({ replay = true } = {}) {
    const action = queue.shift(); assert.ok(action, 'A real callback must dispatch this action.');
    const before = editor, original = JSON.stringify(before.workspace), eventCount = events.length;
    freeze(before.workspace);
    const first = workspaceReducer(before, action);
    const after = replay ? workspaceReducer(before, action) : first;
    assert.deepEqual(first, after, 'Real queued updates replay deterministically.');
    assert.equal(JSON.stringify(before.workspace), original, 'Queued updates preserve their input.');
    assert.equal(events.length, eventCount, 'Reducers and their updaters cannot perform UI side effects.');
    editor = after; refs.workspaceRef.current = editor;
    return { before, after, action };
  }
  return {
    captured, render, refs, state, queue, errors, notices, events, listeners,
    get editor() { return editor; }, get trip() { return target(); }, get closed() { return closed; }, get persisted() { return persisted; },
    reduceNext, finish() { render().finish(); },
    flush() { while (queue.length) reduceNext(); render().finish(); },
    update(update) { queue.push({ type: 'update', update }); },
    csv(rows) { queue.push({ type: 'csv-import', ticket: { tripId: workspace.trips[0].id,
      identity: editor.tripIdentities.get(workspace.trips[0].id), requestId: 101 }, expenses: rows }); },
    replace(next) { queue.push({ type: 'update', update: next }); },
    submitExpense(values = {}) { captured.submitExpense({ preventDefault() {}, currentTarget: {
      title: 'Authored manual receipt', amount: '18', date: workspace.trips[0].startDate, category: 'culture', estimate: '', ...values } }); },
    submitRecord(kind) { captured[kind]({ preventDefault() {}, currentTarget: kind === 'submitActivity'
      ? { title: 'Authored edited stop', category: 'culture', description: 'Edited private notes', time: '11:00', duration: '60', cost: '15', lat: '48.13', lng: '11.57', location: 'Authored place', url: '' }
      : { title: 'Authored edited reservation', type: 'event', status: 'reserved', reference: 'AUTHORED-PRIVATE',
        date: workspace.trips[0].startDate, cost: '15', activityId: '', url: '', notes: 'Edited private notes' } }); },
  };
}

test('the actual captured expense form refuses a queued CSV overflow and stays open without success', () => {
  const h = harness({ prepare(trip) { trip.expenses = Array.from({ length: 999 }, (_, index) => expense('before-' + index)); } });
  h.csv([expense('accepted-csv-last-slot')]); h.submitExpense();
  assert.deepEqual(h.queue.map(item => item.type), ['csv-import', 'trip-edit']);
  assert.equal(h.closed, 0); assert.deepEqual(h.notices, []); assert.equal(h.state.tripEditPending, true);
  const csv = h.reduceNext(); assert.equal(h.trip.expenses.length, 1000);
  const edit = h.reduceNext(); assert.strictEqual(edit.after.workspace, csv.after.workspace);
  assert.equal(h.closed, 0); assert.deepEqual(h.notices, []);
  h.finish(); assert.match(h.errors.at(-1), /1,000 expenses/);
  assert.equal(h.state.modal, 'expense'); assert.equal(h.closed, 0); assert.deepEqual(h.notices, []);
  assert.equal(h.state.tripEditPending, false); assert.equal(h.refs.pendingTripEdit.current, null);
  assert.equal(h.trip.expenses.length, 1000); assert.equal(h.trip.expenses.at(-1).id, 'accepted-csv-last-slot');
  assert.equal(isWorkspace(h.editor.workspace), true);
});

test('success closes and announces only after an accepted result reaches the actual effect', () => {
  const h = harness(); h.submitExpense();
  assert.equal(h.queue.length, 1); assert.equal(h.trip.expenses.length, 0);
  assert.equal(h.closed, 0); assert.equal(h.notices.length, 0);
  h.reduceNext(); assert.equal(h.trip.expenses.length, 1); assert.equal(h.closed, 0); assert.equal(h.notices.length, 0);
  h.finish(); assert.equal(h.closed, 1); assert.equal(h.state.modal, null);
  assert.deepEqual(h.notices, ['Expense recorded. Your budget is up to date.']);
  assert.equal(h.state.tripEditPending, false); assert.equal(h.refs.pendingTripEdit.current, null);
  h.finish(); assert.equal(h.closed, 1); assert.equal(h.notices.length, 1, 'Effect replay cannot repeat completion.');
});

test('a double submit while pending admits one action and one completion', () => {
  const h = harness(); h.submitExpense(); const pending = h.refs.pendingTripEdit.current;
  h.submitExpense({ title: 'Duplicate attempt' });
  assert.equal(h.queue.length, 1); assert.strictEqual(h.refs.pendingTripEdit.current, pending);
  assert.equal(h.refs.tripEditGeneration.current, 1); assert.match(h.errors.at(-1), /previous edit is still being applied/);
  h.flush(); assert.equal(h.trip.expenses.length, 1); assert.equal(h.closed, 1); assert.equal(h.notices.length, 1);
});

test('an older result cannot clear or complete a newer request opened in another modal', () => {
  const h = harness(); let first = 0, second = 0;
  h.captured.commitTripEdit(current => ({ ...current, title: 'First accepted data edit' }), () => { first++; });
  h.captured.open('activity');
  const newer = h.render(); newer.commitTripEdit(current => ({ ...current, description: 'Second accepted data edit' }), () => { second++; });
  const pending = h.refs.pendingTripEdit.current;
  h.reduceNext(); h.finish();
  assert.strictEqual(h.refs.pendingTripEdit.current, pending); assert.equal(h.state.tripEditPending, true);
  assert.equal(h.state.modal, 'activity'); assert.equal(first, 0); assert.equal(second, 0);
  h.reduceNext(); h.finish(); assert.equal(first, 0); assert.equal(second, 1);
  assert.equal(h.state.tripEditPending, false); assert.equal(h.state.modal, 'activity');
});

test('a changed modal epoch drops matching stale completion without touching newer UI', () => {
  const h = harness(); let completed = 0;
  h.captured.commitTripEdit(current => ({ ...current, title: 'Accepted trip edit' }), () => { completed++; });
  h.captured.selectTrip('authored-trip-1');
  h.reduceNext(); h.finish();
  assert.equal(completed, 0); assert.equal(h.closed, 0); assert.equal(h.notices.length, 0);
  assert.equal(h.state.tripEditPending, false); assert.equal(h.refs.pendingTripEdit.current, null);
  h.reduceNext(); assert.equal(h.editor.workspace.selectedTripId, 'authored-trip-1');
});

test('replacement with the same trip ID refuses the old request and preserves replacement data', () => {
  const h = harness(), replacement = structuredClone(h.editor.workspace);
  replacement.trips[0].title = 'Replacement private trip'; h.replace(replacement); h.submitExpense();
  h.reduceNext(); const latest = h.editor.workspace; h.reduceNext(); h.finish();
  assert.strictEqual(h.editor.workspace, latest); assert.equal(h.trip.title, 'Replacement private trip');
  assert.equal(h.trip.expenses.length, 0); assert.match(h.errors.at(-1), /replaced or removed/);
  assert.equal(h.closed, 0); assert.equal(h.notices.length, 0); assert.equal(h.state.modal, 'expense');
});

test('trip details retain current expenses, reservations, publication, days and private extensions', () => {
  const h = harness({ modal: 'tripSettings', prepare(trip) { trip.days[0].activities = [activity('retained-stop')]; } });
  const draft = structuredClone(h.trip);
  draft.title = 'Renamed authored trip'; draft.budget = 600; draft.startDate = '2026-12-02'; draft.endDate = '2026-12-03';
  draft.days = draft.days.map((day, index) => ({ ...day, date: index ? '2026-12-03' : '2026-12-02' }));
  h.update(current => ({ ...current, trips: current.trips.map(trip => trip.id === h.trip.id ? { ...trip,
    description: 'Newer private description', isPublic: true, expenses: [expense('newer-private-expense')],
    bookings: [booking('newer-private-reservation')], privateExtension: { retained: true },
    days: trip.days.map((day, index) => index ? day : { ...day, label: 'Newer day label', privateDayExtension: 'retain' }),
  } : trip) }));
  h.captured.saveTripDetails(draft); h.flush();
  assert.equal(h.trip.title, draft.title); assert.equal(h.trip.budget, 600);
  assert.equal(h.trip.startDate, '2026-12-02'); assert.equal(h.trip.endDate, '2026-12-03');
  assert.equal(h.trip.description, 'Newer private description'); assert.equal(h.trip.isPublic, true);
  assert.equal(h.trip.expenses[0].id, 'newer-private-expense'); assert.equal(h.trip.bookings[0].id, 'newer-private-reservation');
  assert.deepEqual(plain(h.trip.privateExtension), { retained: true }); assert.equal(h.trip.days[0].privateDayExtension, 'retain');
  assert.equal(h.trip.days[0].label, 'Newer day label'); assert.equal(h.trip.days[0].activities[0].id, 'retained-stop');
  assert.equal(h.closed, 1); assert.equal(h.notices.length, 1); assert.equal(isWorkspace(h.editor.workspace), true);
});

test('a shorter trip refuses activities added later to days the draft would remove', () => {
  const h = harness({ modal: 'tripSettings' }), draft = structuredClone(h.trip);
  draft.endDate = draft.startDate; draft.days = draft.days.slice(0, 1);
  h.update(current => ({ ...current, trips: current.trips.map(trip => trip.id === h.trip.id ? { ...trip,
    days: trip.days.map((day, index) => index === 1 ? { ...day, activities: [activity('newer-tail-stop')] } : day),
  } : trip) }));
  h.captured.saveTripDetails(draft); h.reduceNext(); const latest = h.editor.workspace; h.reduceNext(); h.finish();
  assert.strictEqual(h.editor.workspace, latest); assert.equal(h.trip.days.length, 2);
  assert.equal(h.trip.days[1].activities[0].id, 'newer-tail-stop');
  assert.equal(h.closed, 0); assert.equal(h.notices.length, 0); assert.equal(h.state.modal, 'tripSettings');
  assert.ok(h.errors.at(-1));
});

test('an event already added by an earlier queued action cannot be added again', () => {
  const h = harness({ modal: 'event' });
  const candidate = activity('event-new-stop', { event: { provider: 'manual', id: 'same-authored-event', scheduledDate: h.trip.startDate } });
  h.update(current => ({ ...current, trips: current.trips.map(trip => trip.id === h.trip.id ? { ...trip,
    days: trip.days.map((day, index) => index ? day : { ...day, activities: [{ ...candidate, id: 'event-already-saved' }] }),
  } : trip) }));
  h.captured.saveEvent(candidate, 0); h.reduceNext(); const latest = h.editor.workspace; h.reduceNext(); h.finish();
  assert.strictEqual(h.editor.workspace, latest); assert.equal(h.trip.days[0].activities.length, 1);
  assert.equal(h.trip.days[0].activities[0].id, 'event-already-saved');
  assert.equal(h.closed, 0); assert.equal(h.notices.length, 0); assert.equal(h.state.modal, 'event'); assert.ok(h.errors.at(-1));
});

test('event creation rechecks the latest day capacity before reporting success', () => {
  const h = harness({ modal: 'event', prepare(trip) { trip.days[0].activities = Array.from({ length: 59 }, (_, index) => activity('before-' + index)); } });
  h.update(current => ({ ...current, trips: current.trips.map(trip => trip.id === h.trip.id ? { ...trip,
    days: trip.days.map((day, index) => index ? day : { ...day, activities: [...day.activities, activity('newer-sixtieth-stop')] }),
  } : trip) }));
  h.captured.saveEvent(activity('overflow-event'), 0); h.flush();
  assert.equal(h.trip.days[0].activities.length, 60); assert.match(h.errors.at(-1), /60 stops and alternatives/);
  assert.equal(h.closed, 0); assert.equal(h.notices.length, 0); assert.equal(h.state.modal, 'event');
});

test('event creation cannot recreate a target day removed by a newer edit', () => {
  const h = harness({ modal: 'event' });
  h.update(current => ({ ...current, trips: current.trips.map(trip => trip.id === h.trip.id
    ? { ...trip, endDate: trip.startDate, days: trip.days.slice(0, 1) } : trip) }));
  h.captured.saveEvent(activity('removed-day-event'), 1); h.flush();
  assert.equal(h.trip.days.length, 1); assert.equal(h.trip.days[0].activities.length, 0);
  assert.equal(h.closed, 0); assert.equal(h.notices.length, 0); assert.ok(h.errors.at(-1));
});

for (const kind of ['submitActivity', 'submitBooking']) test(`latest removal of the edited record refuses ${kind} without success`, () => {
  const h = harness({ modal: kind === 'submitActivity' ? 'activity' : 'booking', editActivity: kind === 'submitActivity', editBooking: kind === 'submitBooking',
    prepare(trip) { trip.days[0].activities = [activity('removed-stop')]; trip.bookings = [booking('removed-reservation')]; } });
  h.update(current => ({ ...current, trips: current.trips.map(trip => trip.id === h.trip.id ? kind === 'submitActivity'
    ? { ...trip, days: trip.days.map((day, index) => index ? day : { ...day, activities: [] }) }
    : { ...trip, bookings: [] } : trip) }));
  h.submitRecord(kind); h.reduceNext(); const latest = h.editor.workspace; h.reduceNext(); h.finish();
  assert.strictEqual(h.editor.workspace, latest); assert.equal(h.closed, 0); assert.equal(h.notices.length, 0);
  assert.ok(h.errors.at(-1)); assert.equal(isWorkspace(h.editor.workspace), true);
});

test('pending edits guard both in-app departure and the actual beforeunload listener', () => {
  const h = harness(); h.submitExpense(); let departed = 0;
  h.captured.leaveWorkspace(() => { departed++; });
  assert.equal(departed, 0); assert.equal(h.persisted, 0); assert.match(h.errors.at(-1), /wait before leaving/);
  const cleanup = h.render().warn(); assert.equal(typeof cleanup, 'function');
  let prevented = 0; const event = { returnValue: 'untouched', preventDefault() { prevented++; } };
  h.listeners.get('beforeunload')(event); assert.equal(prevented, 1); assert.equal(event.returnValue, '');
  cleanup(); assert.equal(h.listeners.size, 0);
  h.flush(); assert.equal(h.render().warn(), undefined); assert.equal(h.listeners.size, 0);
  h.render().leaveWorkspace(() => { departed++; }); assert.equal(departed, 1); assert.equal(h.persisted, 1);
});
