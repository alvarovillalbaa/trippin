// Tier 2: authored, in-memory frontend state. No React/browser/backend executes.
// This new reducer has no legacy counterpart; missing exports are not a
// regression-sensitivity baseline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const stateModule = new URL('../lib/workspace-state.ts', import.meta.url).href;
const tripModule = new URL('../lib/trip.ts', import.meta.url).href;
const dataModule = new URL('../lib/data.ts', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === stateModule && specifier === './trip') return nextResolve(tripModule, context);
    if (context.parentURL === tripModule && specifier === './data') return nextResolve(dataModule, context);
    if ([stateModule, tripModule, dataModule].includes(context.parentURL)) {
      throw new Error('Unexpected runtime import in pure reducer checks: ' + specifier);
    }
    return nextResolve(specifier, context);
  },
});
globalThis.fetch = () => { throw new Error('Network calls are forbidden in pure reducer checks.'); };
const { createWorkspaceEditor, workspaceReducer } = await import(stateModule);
const { isWorkspace, serializeWorkspace, restoreWorkspace, persistWorkspace } = await import(tripModule);
const date = '2026-11-03';

function expense(id, overrides = {}) {
  return { id, title: 'Authored expense ' + id, amount: 4.5, date, category: 'food', ...overrides };
}

function fixture(expenseCount = 0) {
  const workspace = {
    version: 1,
    selectedTripId: 'authored-trip-b',
    profile: {
      name: 'Authored traveler', bio: 'Authored profile', homeCity: 'Madrid',
      interests: ['Architecture'], dailyFoodBudget: 20, dailyTransportBudget: 10, badges: [],
    },
    trips: ['a', 'b', 'c'].map(letter => ({
      id: 'authored-trip-' + letter, title: 'Authored trip ' + letter,
      city: 'Authored City ' + letter.toUpperCase(), country: 'Spain', countryCode: 'ES',
      startDate: date, endDate: date, lat: 40, lng: -3, image: '/images/authored.jpg',
      description: 'Authored itinerary', budget: 500, currency: 'EUR', isPublic: false,
      days: [{ id: 'authored-day-' + letter, date, label: 'Authored day', activities: [] }],
      expenses: letter === 'a' ? Array.from({ length: expenseCount }, (_, index) => expense('existing-' + index)) : [],
      bookings: [], companions: [], joinRequests: [],
    })),
  };
  assert.ok(isWorkspace(workspace), 'The authored workspace must satisfy the actual model.');
  return workspace;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function frozenEditor(workspace = fixture()) {
  const editor = createWorkspaceEditor(deepFreeze(workspace));
  // Object.freeze alone does not protect Map entries. Direct mutation must fail.
  for (const name of ['set', 'delete', 'clear']) {
    Object.defineProperty(editor.tripIdentities, name, {
      value: () => { throw new Error('The reducer mutated its input identity Map.'); },
    });
  }
  return deepFreeze(editor);
}

function ticket(editor, tripId = 'authored-trip-a', requestId = 1) {
  return Object.freeze({ tripId, identity: editor.tripIdentities.get(tripId), requestId });
}

function importAction(importTicket, expenses) {
  return deepFreeze({ type: 'csv-import', ticket: importTicket, expenses });
}

function target(editor, tripId = 'authored-trip-a') {
  return editor.workspace.trips.find(trip => trip.id === tripId);
}

test('frozen state and payload replay deterministically without mutating the identity Map or source workspace', () => {
  const current = frozenEditor();
  const originalWorkspace = structuredClone(current.workspace);
  const identities = [...current.tripIdentities];
  const payload = [expense('replay-1'), expense('replay-2')];
  const action = importAction(ticket(current), payload);
  const originalAction = structuredClone(action);
  const first = workspaceReducer(current, action);
  const second = workspaceReducer(current, action);
  assert.deepEqual(first, second);
  assert.notStrictEqual(first, current);
  assert.notStrictEqual(first.workspace, current.workspace);
  assert.strictEqual(first.tripIdentities, current.tripIdentities);
  assert.deepEqual([...current.tripIdentities], identities);
  assert.deepEqual(current.workspace, originalWorkspace);
  assert.deepEqual(action, originalAction);
  assert.deepEqual(target(first).expenses, payload);
  assert.equal(first.csvNotice.accepted, true);
  assert.equal(first.csvNotice.requestId, action.ticket.requestId);
});

test('two imports captured together append independently to the latest valid target', () => {
  const current = frozenEditor();
  const firstTicket = ticket(current, 'authored-trip-a', 11);
  const secondTicket = ticket(current, 'authored-trip-a', 12);
  const firstRows = [expense('concurrent-first-1'), expense('concurrent-first-2')];
  const secondRows = [expense('concurrent-second-1')];
  const afterFirst = workspaceReducer(current, importAction(firstTicket, firstRows));
  const afterBoth = workspaceReducer(afterFirst, importAction(secondTicket, secondRows));
  assert.deepEqual(target(afterBoth).expenses, [...firstRows, ...secondRows]);
  assert.equal(afterBoth.csvNotice.requestId, 12);
  assert.equal(afterBoth.csvNotice.accepted, true);
  assert.strictEqual(afterBoth.tripIdentities, current.tripIdentities);
  assert.deepEqual(target(afterFirst).expenses, firstRows);
  assert.deepEqual(target(current).expenses, []);
});

test('995 expenses accept exactly five, then a concurrent stale-capacity import rejects atomically at 1000', () => {
  const current = frozenEditor(fixture(995));
  const acceptedRows = Array.from({ length: 5 }, (_, index) => expense('capacity-' + index));
  const oldTicket = ticket(current, 'authored-trip-a', 22);
  const full = workspaceReducer(current, importAction(ticket(current, 'authored-trip-a', 21), acceptedRows));
  assert.equal(target(full).expenses.length, 1000);
  assert.deepEqual(target(full).expenses.slice(-5), acceptedRows);
  assert.equal(full.csvNotice.accepted, true);
  const rejected = workspaceReducer(full, importAction(oldTicket, [expense('capacity-overflow')]));
  assert.strictEqual(rejected.workspace, full.workspace);
  assert.strictEqual(rejected.tripIdentities, full.tripIdentities);
  assert.equal(target(rejected).expenses.length, 1000);
  assert.equal(target(rejected).expenses.some(item => item.id === 'capacity-overflow'), false);
  assert.equal(rejected.csvNotice.requestId, 22);
  assert.equal(rejected.csvNotice.accepted, false);
  assert.match(rejected.csvNotice.message, /1,000|1000/);
});

test('normal edits and selection survive import and success names the target current city', () => {
  const current = frozenEditor();
  const pending = ticket(current, 'authored-trip-a', 31);
  const activity = deepFreeze({
    id: 'authored-normal-edit-stop', title: 'Authored walk', category: 'outdoors',
    description: 'A concurrent normal edit', time: '09:00', duration: 30, cost: 0,
    lat: 40, lng: -3, location: 'Authored square', status: 'planned', source: 'custom',
  });
  const edited = workspaceReducer(current, {
    type: 'update',
    update: workspace => ({
      ...workspace, selectedTripId: 'authored-trip-c',
      profile: { ...workspace.profile, bio: 'Updated while the CSV was being read.' },
      trips: workspace.trips.map(trip => trip.id === pending.tripId ? {
        ...trip, city: 'Current Authored City',
        days: trip.days.map(day => ({ ...day, activities: [activity] })),
      } : trip),
    }),
  });
  const appended = workspaceReducer(edited, importAction(pending, [expense('after-normal-edit')]));
  assert.equal(appended.workspace.selectedTripId, 'authored-trip-c');
  assert.equal(appended.workspace.profile.bio, edited.workspace.profile.bio);
  assert.strictEqual(target(appended).days, target(edited).days);
  assert.deepEqual(target(appended).days[0].activities, [activity]);
  assert.strictEqual(target(appended, 'authored-trip-b'), target(edited, 'authored-trip-b'));
  assert.equal(appended.tripIdentities.get(pending.tripId), pending.identity);
  assert.equal(appended.csvNotice.message, '1 expenses imported into Current Authored City.');
  assert.equal(appended.csvNotice.accepted, true);
});

test('deleting an unrelated earlier trip preserves the pending target identity', () => {
  const current = frozenEditor();
  const pending = ticket(current, 'authored-trip-c', 41);
  const identities = [...current.tripIdentities];
  const deleted = workspaceReducer(current, {
    type: 'update', update: workspace => ({ ...workspace, trips: workspace.trips.filter(trip => trip.id !== 'authored-trip-a') }),
  });
  assert.equal(deleted.tripIdentities.get('authored-trip-c'), pending.identity);
  assert.equal(deleted.tripIdentities.has('authored-trip-a'), false);
  assert.deepEqual([...current.tripIdentities], identities);
  const appended = workspaceReducer(deleted, importAction(pending, [expense('unrelated-delete')]));
  assert.equal(target(appended, 'authored-trip-c').expenses[0].id, 'unrelated-delete');
  assert.equal(appended.workspace.selectedTripId, 'authored-trip-b');
  assert.equal(appended.csvNotice.accepted, true);
});

test('deleting and recreating the same trip ID cannot revive its old import or parser error', () => {
  const current = frozenEditor();
  const pending = ticket(current, 'authored-trip-a', 51);
  const replacementTrip = { ...structuredClone(target(current)), title: 'Explicitly recreated trip' };
  const deleted = workspaceReducer(current, {
    type: 'update', update: workspace => ({ ...workspace, trips: workspace.trips.filter(trip => trip.id !== pending.tripId) }),
  });
  const recreated = workspaceReducer(deleted, {
    type: 'update', update: workspace => ({ ...workspace, trips: [...workspace.trips, replacementTrip] }),
  });
  assert.notEqual(recreated.tripIdentities.get(pending.tripId), pending.identity);
  assert.strictEqual(workspaceReducer(recreated, importAction(pending, [expense('must-not-revive')])), recreated);
  assert.strictEqual(workspaceReducer(recreated, { type: 'csv-error', ticket: pending, message: 'Stale parser error' }), recreated);
  const accepted = workspaceReducer(recreated, importAction(ticket(recreated, pending.tripId, 52), [expense('new-trip-import')]));
  assert.equal(target(accepted).title, 'Explicitly recreated trip');
  assert.deepEqual(target(accepted).expenses.map(item => item.id), ['new-trip-import']);
});

test('direct replacement by the exact same workspace object fences every trip and clears the old notice', () => {
  const current = frozenEditor();
  const tickets = current.workspace.trips.map((trip, index) => ticket(current, trip.id, 60 + index));
  const primed = workspaceReducer(current, { type: 'csv-error', ticket: tickets[0], message: 'Previous notice' });
  const oldIdentities = [...primed.tripIdentities];
  const replaced = workspaceReducer(primed, { type: 'update', update: primed.workspace });
  assert.strictEqual(replaced.workspace, primed.workspace);
  assert.notStrictEqual(replaced, primed);
  assert.equal(replaced.csvNotice, null);
  assert.deepEqual([...primed.tripIdentities], oldIdentities);
  for (const pending of tickets) {
    assert.notEqual(replaced.tripIdentities.get(pending.tripId), pending.identity);
    assert.strictEqual(workspaceReducer(replaced, importAction(pending, [expense('old-replacement-' + pending.tripId)])), replaced);
  }
  const accepted = workspaceReducer(replaced, importAction(ticket(replaced, 'authored-trip-a', 69), [expense('replacement-current')]));
  assert.equal(accepted.csvNotice.accepted, true);
});

test('stale or absent-target parser errors return the exact current editor and retain its notice', () => {
  const current = frozenEditor();
  const accepted = workspaceReducer(current, importAction(ticket(current, 'authored-trip-b', 71), [expense('notice-owner')]));
  for (const stale of [
    { tripId: 'authored-trip-a', identity: undefined, requestId: 72 },
    { tripId: 'authored-trip-a', identity: 999, requestId: 73 },
    { tripId: 'deleted-authored-trip', identity: 1, requestId: 74 },
  ]) {
    assert.strictEqual(workspaceReducer(accepted, { type: 'csv-error', ticket: stale, message: 'Must not replace the notice' }), accepted);
  }
  assert.equal(accepted.csvNotice.requestId, 71);
  assert.equal(accepted.csvNotice.accepted, true);
});

test('complete-candidate validation atomically rejects IDs duplicated against existing or incoming expenses', () => {
  const current = frozenEditor(fixture(1));
  for (const rows of [
    [expense('existing-0')],
    [expense('duplicate-incoming'), expense('duplicate-incoming')],
  ]) {
    const rejected = workspaceReducer(current, importAction(ticket(current, 'authored-trip-a', 81), rows));
    assert.strictEqual(rejected.workspace, current.workspace);
    assert.strictEqual(rejected.tripIdentities, current.tripIdentities);
    assert.deepEqual(target(rejected).expenses.map(item => item.id), ['existing-0']);
    assert.equal(rejected.csvNotice.accepted, false);
    assert.match(rejected.csvNotice.message, /invalid|unsupported/i);
    assert.match(rejected.csvNotice.message, /No CSV rows were imported/);
  }
});

test('the complete workspace size cap rejects an otherwise valid import without losing the existing workspace', () => {
  const workspace = fixture();
  workspace.authoredExtension = '';
  workspace.authoredExtension = 'x'.repeat(1_999_980 - JSON.stringify(workspace).length);
  assert.ok(isWorkspace(workspace));
  assert.equal(serializeWorkspace(workspace, 0).length, 1_999_980);
  const current = frozenEditor(workspace);
  const rejected = workspaceReducer(current, importAction(ticket(current, 'authored-trip-a', 91), [expense('would-exceed-the-complete-workspace-cap')]));
  assert.strictEqual(rejected.workspace, current.workspace);
  assert.strictEqual(rejected.tripIdentities, current.tripIdentities);
  assert.deepEqual(target(rejected).expenses, []);
  assert.equal(rejected.csvNotice.accepted, false);
  assert.match(rejected.csvNotice.message, /too large/i);
  assert.match(rejected.csvNotice.message, /No CSV rows were imported/);
});

test('accepted workspace persists and restores through actual helpers without editor or import metadata', () => {
  const current = frozenEditor();
  const accepted = workspaceReducer(current, importAction(ticket(current, 'authored-trip-a', 101), [expense('portable-expense')]));
  let saved = null;
  assert.equal(persistWorkspace(accepted.workspace, serialized => { saved = serialized; }), 'saved');
  const parsed = JSON.parse(saved);
  assert.deepEqual(parsed, accepted.workspace);
  assert.deepEqual(Object.keys(parsed).sort(), ['profile', 'selectedTripId', 'trips', 'version']);
  for (const field of ['tripIdentities', 'nextIdentity', 'csvNotice', 'ticket', 'requestId']) {
    assert.equal(Object.hasOwn(parsed, field), false);
  }
  assert.doesNotMatch(saved, /"(?:tripIdentities|nextIdentity|csvNotice|ticket|requestId)"\s*:/);
  const restored = restoreWorkspace(saved);
  assert.deepEqual(restored, accepted.workspace);
  const editor = createWorkspaceEditor(restored);
  assert.equal(editor.csvNotice, null);
  assert.equal(editor.tripIdentities.size, restored.trips.length);
});

test('a functional no-op preserves exact editor identity and leaves a captured ticket usable', () => {
  const current = frozenEditor();
  const pending = ticket(current, 'authored-trip-a', 111);
  const unchanged = workspaceReducer(current, { type: 'update', update: workspace => workspace });
  assert.strictEqual(unchanged, current);
  const accepted = workspaceReducer(unchanged, importAction(pending, [expense('after-functional-noop')]));
  assert.equal(accepted.csvNotice.accepted, true);
  assert.deepEqual(target(accepted).expenses.map(item => item.id), ['after-functional-noop']);
});

test('publication completion patches the latest target while preserving newer private edits, selection and CSV notice', () => {
  const current = frozenEditor();
  const pending = ticket(current, 'authored-trip-a', 121);
  const edited = workspaceReducer(current, {
    type: 'update',
    update: workspace => ({
      ...workspace, selectedTripId: 'authored-trip-c',
      profile: { ...workspace.profile, bio: 'Private profile edited during publication.' },
      trips: workspace.trips.map(trip => trip.id === pending.tripId ? {
        ...trip, title: 'Latest private trip title', description: 'Newer private notes', budget: 731,
      } : trip),
    }),
  });
  const latest = workspaceReducer(edited, importAction(pending, [expense('private-during-publication')]));
  deepFreeze(latest);
  const action = deepFreeze({ type: 'publication-result', tripId: pending.tripId, identity: pending.identity, isPublic: true });
  const published = workspaceReducer(latest, action);
  assert.notStrictEqual(published.workspace, latest.workspace);
  assert.deepEqual(target(published), { ...target(latest), isPublic: true });
  assert.equal(target(published).title, 'Latest private trip title');
  assert.equal(target(published).description, 'Newer private notes');
  assert.equal(target(published).budget, 731);
  assert.strictEqual(target(published).expenses, target(latest).expenses);
  assert.strictEqual(target(published).days, target(latest).days);
  assert.strictEqual(target(published).bookings, target(latest).bookings);
  assert.strictEqual(target(published, 'authored-trip-b'), target(latest, 'authored-trip-b'));
  assert.strictEqual(target(published, 'authored-trip-c'), target(latest, 'authored-trip-c'));
  assert.strictEqual(published.workspace.profile, latest.workspace.profile);
  assert.equal(published.workspace.selectedTripId, 'authored-trip-c');
  assert.strictEqual(published.tripIdentities, latest.tripIdentities);
  assert.equal(published.nextIdentity, latest.nextIdentity);
  assert.strictEqual(published.csvNotice, latest.csvNotice);
  assert.equal(target(latest).isPublic, false);
  assert.deepEqual(workspaceReducer(latest, action), published, 'Frozen publication replay must be deterministic.');
});

test('unpublication preserves current private data and leaves a previously captured CSV ticket usable', () => {
  const workspace = fixture();
  workspace.trips[0].isPublic = true;
  const current = frozenEditor(workspace);
  const pending = ticket(current, 'authored-trip-a', 131);
  const unpublished = workspaceReducer(current, {
    type: 'publication-result', tripId: pending.tripId, identity: pending.identity, isPublic: false,
  });
  assert.deepEqual(target(unpublished), { ...target(current), isPublic: false });
  assert.strictEqual(unpublished.tripIdentities, current.tripIdentities);
  assert.strictEqual(unpublished.csvNotice, current.csvNotice);
  const imported = workspaceReducer(unpublished, importAction(pending, [expense('after-unpublication')]));
  assert.equal(target(imported).isPublic, false);
  assert.equal(imported.csvNotice.accepted, true);
  assert.deepEqual(target(imported).expenses.map(item => item.id), ['after-unpublication']);
  assert.equal(target(current).isPublic, true);
});

test('publication results with an absent or stale identity retain the exact workspace and existing notice', () => {
  const current = frozenEditor();
  const primed = workspaceReducer(current, { type: 'csv-error', ticket: ticket(current), message: 'Current CSV notice' });
  for (const captured of [
    { tripId: 'authored-trip-a', identity: undefined },
    { tripId: 'authored-trip-a', identity: 999 },
    { tripId: 'authored-trip-a', identity: current.tripIdentities.get('authored-trip-b') },
    { tripId: 'missing-authored-trip', identity: 1 },
  ]) {
    assert.strictEqual(workspaceReducer(primed, { type: 'publication-result', ...captured, isPublic: true }), primed);
  }
  const inconsistent = { ...primed, tripIdentities: new Map([...primed.tripIdentities, ['missing-authored-trip', 999]]) };
  assert.strictEqual(workspaceReducer(inconsistent, {
    type: 'publication-result', tripId: 'missing-authored-trip', identity: 999, isPublic: true,
  }), inconsistent, 'An identity entry alone must never recreate an absent trip.');
});

test('a publication result for a deleted trip cannot recreate it or alter another trip', () => {
  const current = frozenEditor();
  const pending = ticket(current);
  const deleted = workspaceReducer(current, {
    type: 'update', update: workspace => ({ ...workspace, trips: workspace.trips.filter(trip => trip.id !== pending.tripId) }),
  });
  assert.strictEqual(workspaceReducer(deleted, {
    type: 'publication-result', tripId: pending.tripId, identity: pending.identity, isPublic: true,
  }), deleted);
  assert.equal(deleted.workspace.trips.length, 2);
  assert.equal(target(deleted), undefined);
});

test('deleting and recreating a trip with the same ID rejects the old publication incarnation', () => {
  const current = frozenEditor();
  const pending = ticket(current);
  const deleted = workspaceReducer(current, {
    type: 'update', update: workspace => ({ ...workspace, trips: workspace.trips.filter(trip => trip.id !== pending.tripId) }),
  });
  const recreated = workspaceReducer(deleted, {
    type: 'update', update: workspace => ({ ...workspace, trips: [...workspace.trips, { ...target(current), title: 'New private incarnation' }] }),
  });
  assert.notEqual(recreated.tripIdentities.get(pending.tripId), pending.identity);
  assert.strictEqual(workspaceReducer(recreated, {
    type: 'publication-result', tripId: pending.tripId, identity: pending.identity, isPublic: true,
  }), recreated);
  const published = workspaceReducer(recreated, {
    type: 'publication-result', tripId: pending.tripId, identity: recreated.tripIdentities.get(pending.tripId), isPublic: true,
  });
  assert.equal(target(published).isPublic, true);
  assert.equal(target(published).title, 'New private incarnation');
});

test('restoring the same trip IDs invalidates old publication results without blocking a new one', () => {
  const current = frozenEditor();
  const pending = ticket(current);
  const restored = restoreWorkspace(serializeWorkspace(current.workspace, 0));
  const replaced = workspaceReducer(current, { type: 'update', update: restored });
  assert.notEqual(replaced.tripIdentities.get(pending.tripId), pending.identity);
  assert.strictEqual(workspaceReducer(replaced, {
    type: 'publication-result', tripId: pending.tripId, identity: pending.identity, isPublic: true,
  }), replaced);
  const published = workspaceReducer(replaced, {
    type: 'publication-result', tripId: pending.tripId, identity: replaced.tripIdentities.get(pending.tripId), isPublic: true,
  });
  assert.equal(target(published).isPublic, true);
  assert.strictEqual(published.tripIdentities, replaced.tripIdentities);
});

test('an already matching publication state is an exact no-op and does not replace feedback or CSV identities', () => {
  const current = frozenEditor();
  const pending = ticket(current);
  const primed = workspaceReducer(current, { type: 'csv-error', ticket: pending, message: 'Keep this CSV error' });
  assert.strictEqual(workspaceReducer(primed, {
    type: 'publication-result', tripId: pending.tripId, identity: pending.identity, isPublic: false,
  }), primed);
});
