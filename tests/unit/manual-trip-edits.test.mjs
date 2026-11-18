// T2: actual reducer with authored queues and immutable private trip fixtures.
// No React mount, browser, storage, backend, Auth, provider or network executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const lib = new URL('../../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib) && /^\.\/[\w-]+$/.test(specifier)) return next(new URL(specifier + '.ts', context.parentURL).href, context);
  return next(specifier, context);
} });
globalThis.fetch = () => { throw new Error('Network is forbidden in manual-edit checks.'); };
const { createWorkspaceEditor, workspaceReducer } = await import('../../lib/workspace-state.ts');
const { createTrip, initialWorkspace, isTrip, isWorkspace, serializeWorkspace, exportWorkspaceBackup } = await import('../../lib/trip.ts');

function fixture() {
  const value = initialWorkspace('Authored editor');
  value.trips = [createTrip('munich', '2026-12-01', '2026-12-02', 'Authored editable trip'),
    createTrip('lisbon', '2026-12-01', '2026-12-01', 'Authored sibling trip')];
  value.trips.forEach((trip, index) => {
    trip.id = index ? 'authored-trip-b' : 'authored-trip-a';
    trip.days = trip.days.map((day, dayIndex) => ({ ...day, id: `authored-day-${index}-${dayIndex}` }));
  });
  value.selectedTripId = value.trips[0].id;
  assert.equal(isWorkspace(value), true);
  return value;
}
const expense = id => ({ id, title: 'Authored actual', date: '2026-12-01', category: 'other', amount: 1 });
const booking = (id, extra = {}) => ({ id, type: 'event', title: 'Authored reservation', reference: 'PRIVATE-AUTHORED',
  date: '2026-12-01', cost: 12, status: 'reserved', source: 'custom', ...extra });
const activity = id => ({ id, title: 'Authored stop', category: 'culture', description: 'Private authored notes',
  time: '10:00', duration: 30, cost: 12, lat: 48.13, lng: 11.57, location: 'Authored place', status: 'planned', source: 'custom' });
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function frozenEditor(workspace = fixture()) {
  const value = createWorkspaceEditor(freeze(workspace));
  for (const method of ['set', 'delete', 'clear']) Object.defineProperty(value.tripIdentities, method, {
    value() { throw new Error('The reducer mutated its input identity Map.'); },
  });
  return freeze(value);
}
function ticket(editor, requestId = 1, extra = {}) {
  const tripId = editor.workspace.trips[0].id;
  return freeze({ tripId, identity: editor.tripIdentities.get(tripId), requestId, epoch: 17, ...extra });
}
const edit = (ticket, update) => Object.freeze({ type: 'trip-edit', ticket, update });
const target = editor => editor.workspace.trips.find(trip => trip.id === 'authored-trip-a');
function refused(before, after, pattern) {
  assert.notStrictEqual(after, before, 'The refusal is an explicit reducer result.');
  assert.strictEqual(after.workspace, before.workspace, 'Every latest workspace byte stays represented by the same object.');
  assert.strictEqual(after.tripIdentities, before.tripIdentities);
  assert.equal(after.nextIdentity, before.nextIdentity);
  assert.strictEqual(after.csvNotice, before.csvNotice);
  assert.equal(after.editNotice.accepted, false);
  assert.match(after.editNotice.message, pattern);
}

test('999 captured expenses plus a queued CSV row refuse the later manual row atomically at 1000', () => {
  const workspace = fixture(); workspace.trips[0].expenses = Array.from({ length: 999 }, (_, index) => expense('before-' + index));
  const before = frozenEditor(workspace), manual = expense('authored-manual-after-csv'), editTicket = ticket(before);
  assert.equal(isTrip({ ...target(before), expenses: [...target(before).expenses, manual] }), true, 'The captured form preflight would pass.');
  const csv = workspaceReducer(before, { type: 'csv-import', ticket: editTicket, expenses: [expense('authored-csv-last-slot')] });
  assert.equal(csv.csvNotice.accepted, true); assert.equal(target(csv).expenses.length, 1000);
  const after = workspaceReducer(csv, edit(editTicket, current => ({ ...current, expenses: [...current.expenses, manual] })));
  refused(csv, after, /1,000 expenses/);
  assert.strictEqual(after.editNotice.ticket, editTicket);
  assert.equal(target(after).expenses.at(-1).id, 'authored-csv-last-slot');
  assert.equal(target(after).expenses.some(item => item.id === manual.id), false);
  assert.equal(isWorkspace(after.workspace), true); assert.equal(serializeWorkspace(after.workspace, 0), serializeWorkspace(csv.workspace, 0));
});

test('the reverse queue order retains the accepted manual row and refuses the later CSV', () => {
  const workspace = fixture(); workspace.trips[0].expenses = Array.from({ length: 999 }, (_, index) => expense('before-' + index));
  const before = frozenEditor(workspace), editTicket = ticket(before), manual = expense('authored-manual-last-slot');
  const saved = workspaceReducer(before, edit(editTicket, current => ({ ...current, expenses: [...current.expenses, manual] })));
  assert.equal(saved.editNotice.accepted, true); assert.equal(target(saved).expenses.length, 1000);
  const after = workspaceReducer(saved, { type: 'csv-import', ticket: { ...editTicket, requestId: 2 }, expenses: [expense('authored-too-late-csv')] });
  assert.strictEqual(after.workspace, saved.workspace); assert.equal(after.csvNotice.accepted, false);
  assert.strictEqual(after.editNotice, saved.editNotice); assert.equal(target(after).expenses.at(-1).id, manual.id);
  assert.equal(isWorkspace(after.workspace), true);
});

test('accepted edits use the latest target and retain newer unrelated data and sibling references', () => {
  const before = frozenEditor(), editTicket = ticket(before), latestExpense = expense('newer-private-row');
  const latest = workspaceReducer(before, { type: 'update', update: current => ({ ...current,
    selectedTripId: current.trips[1].id, profile: { ...current.profile, bio: 'Newer profile edit' },
    trips: current.trips.map(trip => trip.id === editTicket.tripId ? { ...trip, description: 'Newer trip notes',
      expenses: [...trip.expenses, latestExpense], privateExtension: { retained: 'accepted unknown backup field' } } : trip),
  }) });
  const saved = workspaceReducer(latest, edit(editTicket, current => ({ ...current, title: 'New manual title' })));
  assert.equal(saved.editNotice.accepted, true); assert.equal(saved.editNotice.message, '');
  assert.strictEqual(saved.editNotice.ticket, editTicket); assert.strictEqual(saved.tripIdentities, latest.tripIdentities);
  assert.equal(saved.nextIdentity, latest.nextIdentity); assert.equal(saved.workspace.selectedTripId, 'authored-trip-b');
  assert.strictEqual(saved.workspace.profile, latest.workspace.profile); assert.strictEqual(saved.workspace.trips[1], latest.workspace.trips[1]);
  assert.equal(target(saved).description, 'Newer trip notes'); assert.strictEqual(target(saved).expenses[0], latestExpense);
  assert.strictEqual(target(saved).privateExtension, target(latest).privateExtension); assert.equal(target(saved).title, 'New manual title');
  assert.equal(isWorkspace(saved.workspace), true);
});

test('manual action replay is deterministic and preserves frozen source state and identity Map', () => {
  const before = frozenEditor(), original = structuredClone(before.workspace), identities = [...before.tripIdentities];
  const row = freeze(expense('replay-owned-row')), action = edit(ticket(before, 11), current => ({ ...current, expenses: [...current.expenses, row] }));
  const first = workspaceReducer(before, action), replay = workspaceReducer(before, action);
  assert.deepEqual(first, replay); assert.deepEqual(before.workspace, original); assert.deepEqual([...before.tripIdentities], identities);
  assert.equal(target(before).expenses.length, 0); assert.equal(target(first).expenses.length, 1);
  assert.strictEqual(first.tripIdentities, before.tripIdentities); assert.equal(before.editNotice, null);
});

test('full replacement invalidates an old edit ticket even when the scalar trip ID survives', () => {
  const before = frozenEditor(), old = ticket(before);
  const replacement = workspaceReducer(before, { type: 'update', update: structuredClone(before.workspace) });
  assert.notEqual(replacement.tripIdentities.get(old.tripId), old.identity);
  const after = workspaceReducer(replacement, edit(old, current => ({ ...current, title: 'Obsolete draft' })));
  refused(replacement, after, /replaced or removed/); assert.notEqual(target(after).title, 'Obsolete draft');
});

test('missing identity, deleted target and deletion followed by scalar-ID reuse cannot admit old edits', () => {
  const before = frozenEditor(), old = ticket(before);
  const missing = workspaceReducer(before, edit({ ...old, identity: undefined }, current => ({ ...current, title: 'Unknown admission' })));
  refused(before, missing, /replaced or removed/);
  const deleted = workspaceReducer(before, { type: 'update', update: current => ({ ...current,
    trips: current.trips.slice(1), selectedTripId: current.trips[1].id }) });
  refused(deleted, workspaceReducer(deleted, edit(old, current => ({ ...current, title: 'Deleted draft' }))), /replaced or removed/);
  const recreated = workspaceReducer(deleted, { type: 'update', update: current => ({ ...current,
    trips: [...current.trips, { ...before.workspace.trips[0], title: 'Recreated trip' }] }) });
  refused(recreated, workspaceReducer(recreated, edit(old, current => ({ ...current, title: 'Old incarnation' }))), /replaced or removed/);
  assert.equal(target(recreated).title, 'Recreated trip');
});

for (const [name, count, prepare, update, message] of [
  ['expense', 1000, trip => { trip.expenses = Array.from({ length: 1000 }, (_, index) => expense('full-expense-' + index)); },
    current => ({ ...current, expenses: [...current.expenses, expense('overflow-expense')] }), /1,000 expenses/],
  ['reservation', 100, trip => { trip.bookings = Array.from({ length: 100 }, (_, index) => booking('full-booking-' + index)); },
    current => ({ ...current, bookings: [...current.bookings, booking('overflow-booking')] }), /100 reservations/],
  ['day record', 60, trip => { trip.days[0].activities = Array.from({ length: 60 }, (_, index) => activity('full-stop-' + index)); },
    current => ({ ...current, days: current.days.map((day, index) => index ? day : { ...day, activities: [...day.activities, activity('overflow-stop')] }) }), /60 stops and alternatives/],
]) test(`latest ${name} capacity refuses the whole candidate without losing its ${count} records`, () => {
  const workspace = fixture(); prepare(workspace.trips[0]); assert.equal(isWorkspace(workspace), true);
  const before = frozenEditor(workspace), after = workspaceReducer(before, edit(ticket(before), update));
  refused(before, after, message); assert.equal(isWorkspace(after.workspace), true);
});

test('latest linked reservation ownership cannot become duplicated by a coalesced edit', () => {
  const workspace = fixture(), stop = activity('linked-admission'); workspace.trips[0].days[0].activities = [stop];
  const before = frozenEditor(workspace), pending = ticket(before);
  const first = workspaceReducer(before, edit(pending, current => ({ ...current, bookings: [...current.bookings, booking('first-reservation', { activityId: stop.id })] })));
  assert.equal(first.editNotice.accepted, true);
  const second = workspaceReducer(first, edit({ ...pending, requestId: 2 }, current => ({ ...current,
    bookings: [...current.bookings, booking('second-reservation', { activityId: stop.id })] })));
  refused(first, second, /invalid/); assert.equal(target(second).bookings.length, 1);
  assert.equal(target(second).bookings[0].id, 'first-reservation');
});

test('exceptions, no-op sentinels, malformed records and changed trip IDs refuse explicitly', () => {
  for (const [update, message] of [
    [current => current, /changed while the form was open/],
    [() => { throw new Error('Authored updater failure'); }, /could not be applied/],
    [() => null, /invalid/],
    [current => ({ ...current, budget: -1 }), /invalid/],
    [current => ({ ...current, id: 'different-trip-id' }), /identity/],
  ]) {
    const before = frozenEditor(), after = workspaceReducer(before, edit(ticket(before), update));
    refused(before, after, message); assert.equal(isWorkspace(after.workspace), true);
  }
});

test('whole-workspace growth refuses atomically while retaining accepted private extensions', () => {
  const workspace = fixture(); workspace.trips[0].privateExtension = '';
  workspace.trips[0].privateExtension = 'x'.repeat(1_999_900 - JSON.stringify(workspace).length);
  assert.equal(JSON.stringify(workspace).length, 1_999_900); assert.equal(isWorkspace(workspace), true);
  const before = frozenEditor(workspace), action = edit(ticket(before), current => ({ ...current,
    privateExtension: current.privateExtension + 'y'.repeat(200) }));
  assert.equal(isTrip(action.update(target(before))), true, 'The complete trip schema alone is insufficient.');
  const after = workspaceReducer(before, action);
  refused(before, after, /too large to save/);
  assert.equal(serializeWorkspace(after.workspace, 0).length, 1_999_900);
  assert.equal(target(after).privateExtension, target(before).privateExtension);
});

test('functional generic updates retain edit notices and whole replacements clear them', () => {
  const before = frozenEditor(), saved = workspaceReducer(before, edit(ticket(before, 24), current => ({ ...current, title: 'Accepted edit' })));
  const ordinary = workspaceReducer(saved, { type: 'update', update: current => ({ ...current,
    profile: { ...current.profile, bio: 'Ordinary unrelated update' } }) });
  assert.strictEqual(ordinary.editNotice, saved.editNotice);
  const replaced = workspaceReducer(ordinary, { type: 'update', update: structuredClone(ordinary.workspace) });
  assert.equal(replaced.editNotice, null); assert.equal(replaced.csvNotice, null);
});

test('generic recovery updates and unsupported-data archives retain their existing contract', () => {
  const before = frozenEditor();
  const unsupported = { ...structuredClone(before.workspace), version: 99, recoveryNote: 'Retain authored unsupported data' };
  const replaced = workspaceReducer(before, { type: 'update', update: unsupported });
  assert.strictEqual(replaced.workspace, unsupported); assert.equal(replaced.editNotice, null);
  const ordinary = workspaceReducer(replaced, { type: 'update', update: current => ({ ...current, recoveryNote: 'Recovery data still editable' }) });
  assert.equal(ordinary.workspace.version, 99); assert.equal(ordinary.workspace.recoveryNote, 'Recovery data still editable');
  const archived = exportWorkspaceBackup(ordinary.workspace);
  assert.equal(archived.withinWorkspaceLimit, false);
  assert.deepEqual(JSON.parse(archived.serialized), ordinary.workspace);
});
