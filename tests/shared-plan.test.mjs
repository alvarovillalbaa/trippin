import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const tripModule = new URL('../lib/trip.ts', import.meta.url).href;
// Node's native TypeScript loader needs the extension that Next resolves itself.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === './data' && context.parentURL === tripModule
      ? new URL('../lib/data.ts', import.meta.url).href : specifier, context);
  },
});
const { initialWorkspace, importSharedPlan, isTrip, isWorkspace, persistWorkspace, restoreWorkspace, serializeWorkspace } = await import(tripModule);

function workspaceWith(count = 1) {
  const workspace = initialWorkspace();
  const template = workspace.trips[0];
  workspace.trips = Array.from({ length: count }, (_, index) => ({ ...structuredClone(template), id: `owned-trip-${index}` }));
  workspace.selectedTripId = workspace.trips.at(-1).id;
  assert.ok(isWorkspace(workspace), 'authored workspace fixture satisfies the real contract');
  return workspace;
}
function plan() {
  const trip = structuredClone(workspaceWith().trips[0]);
  trip.id = 'shared-fixture';
  trip.title = 'Café à Kyoto · 京都 🚋';
  trip.isPublic = true;
  trip.bookings = [{ id: 'private-booking', type: 'flight', title: 'Authored fixture flight', reference: 'PRIVATE-QA', date: trip.startDate, cost: 125, status: 'reserved', source: 'custom', notes: 'Private note' }];
  trip.expenses = [{ id: 'private-expense', title: 'Authored fixture expense', category: 'food', amount: 12, date: trip.startDate }];
  trip.companions = [{ id: 'fixture-person', name: 'Fixture companion', initials: 'FC', homeCity: 'Madrid', bio: 'Authored QA fixture', interests: [], color: '#123456', source: 'demo' }];
  trip.joinRequests = [{ id: 'fixture-request', personId: 'fixture-person', message: 'Authored QA request', status: 'pending', source: 'demo' }];
  assert.ok(isTrip(trip), 'shared fixture satisfies the real trip contract');
  return trip;
}
const baseUrl = 'https://trippin.example/journal?trip=host-7&return=%2Fjournal%3Fx%3D1&tag=a%20b';
const link = value => `${baseUrl}#plan=${Buffer.from(JSON.stringify(value)).toString('base64')}`;
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function nearLimitWorkspace() {
  const workspace = workspaceWith(9), template = structuredClone(workspace.trips[0].days[0].activities[0]);
  for (const trip of workspace.trips) {
    for (const day of trip.days) day.activities = [];
    trip.days[0].activities = Array.from({ length: 60 }, (_, index) => ({ ...structuredClone(template), id: `fixture-stop-${index}`, description: '' }));
  }
  let remaining = 1_999_900 - JSON.stringify(workspace).length;
  assert.ok(remaining > 0);
  for (const trip of workspace.trips) for (const activity of trip.days[0].activities) {
    const size = Math.min(4_000, remaining);
    activity.description = 'x'.repeat(size);
    remaining -= size;
  }
  assert.equal(remaining, 0);
  assert.ok(isWorkspace(workspace));
  assert.equal(JSON.stringify(workspace).length, 1_999_900);
  return workspace;
}

test('valid UTF-8 plan adds one private copy without changing existing trips', () => {
  const workspace = freeze(workspaceWith(2)), original = structuredClone(workspace), shared = plan();
  const result = importSharedPlan(workspace, link(shared));
  assert.equal(result.status, 'imported');
  assert.ok(isWorkspace(result.workspace));
  assert.deepEqual(workspace, original);
  assert.deepEqual(result.workspace.trips.slice(0, 2), original.trips);
  assert.strictEqual(result.workspace.profile, workspace.profile);
  const copy = result.workspace.trips.at(-1);
  assert.notEqual(copy.id, shared.id);
  assert.equal(result.workspace.selectedTripId, copy.id);
  assert.equal(copy.title, shared.title);
  assert.deepEqual(copy.days, shared.days);
  assert.equal(copy.isPublic, false);
  for (const field of ['bookings', 'expenses', 'companions', 'joinRequests']) assert.deepEqual(copy[field], []);
});

test('successful import removes only the fragment and preserves path and exact query', () => {
  const result = importSharedPlan(workspaceWith(), link(plan()));
  assert.equal(result.status, 'imported');
  assert.equal(result.url, baseUrl);
});

for (const [name, href] of [['plain URL', baseUrl], ['unrelated fragment', `${baseUrl}#map=2`]]) {
  test(`${name} does not import or request a history change`, () => {
    const workspace = freeze(workspaceWith());
    const result = importSharedPlan(workspace, href);
    assert.equal(result.status, 'none');
    assert.strictEqual(result.workspace, workspace);
    assert.equal(result.url, undefined);
  });
}

const invalidLinks = [
  ['empty plan', `${baseUrl}#plan=`],
  ['malformed base64', `${baseUrl}#plan=not-base64!`],
  ['malformed JSON', `${baseUrl}#plan=${Buffer.from('{').toString('base64')}`],
  ['invalid trip', link({ id: 'incomplete' })],
  ['oversized plan', `${baseUrl}#plan=${'A'.repeat(32_001)}`],
  ['invalid UTF-8', `${baseUrl}#plan=${Buffer.from([0xff]).toString('base64')}`],
];
for (const [name, href] of invalidLinks) {
  test(`${name} preserves the existing valid workspace and incoming URL`, () => {
    const workspace = freeze(workspaceWith(3)), saved = JSON.stringify(workspace);
    const result = importSharedPlan(workspace, href);
    assert.equal(result.status, 'invalid');
    assert.strictEqual(result.workspace, workspace);
    assert.equal(result.url, undefined);
    assert.equal(JSON.stringify(result.workspace), saved);
    assert.deepEqual(restoreWorkspace(saved), workspace);
  });
}

test('a full 40-trip workspace rejects a valid shared plan without producing invalid saved data', () => {
  const workspace = freeze(workspaceWith(40)), saved = JSON.stringify(workspace);
  const result = importSharedPlan(workspace, link(plan()));
  assert.equal(result.status, 'full');
  assert.strictEqual(result.workspace, workspace);
  assert.equal(result.url, undefined);
  assert.equal(JSON.stringify(result.workspace), saved);
  assert.equal(restoreWorkspace(JSON.stringify(result.workspace)).trips.length, 40);
  assert.equal(result.workspace.selectedTripId, 'owned-trip-39');
});

test('39 trips accepts the final slot and survives the actual restore validator', () => {
  const result = importSharedPlan(freeze(workspaceWith(39)), link(plan()));
  assert.equal(result.status, 'imported');
  assert.equal(result.workspace.trips.length, 40);
  assert.ok(isWorkspace(result.workspace));
  assert.deepEqual(restoreWorkspace(JSON.stringify(result.workspace)), result.workspace);
});

test('reloading the consumed URL keeps the saved imported trip without adding another copy', () => {
  const first = importSharedPlan(workspaceWith(2), link(plan()));
  assert.equal(first.status, 'imported');
  const saved = restoreWorkspace(JSON.stringify(first.workspace));
  const reloaded = importSharedPlan(saved, first.url);
  assert.equal(reloaded.status, 'none');
  assert.strictEqual(reloaded.workspace, saved);
  assert.equal(reloaded.workspace.trips.length, 3);
  assert.equal(reloaded.workspace.selectedTripId, first.workspace.selectedTripId);
});

test('a valid near-limit workspace rejects a combined serialized-size overflow without losing existing trips', () => {
  const workspace = freeze(nearLimitWorkspace()), saved = serializeWorkspace(workspace, 0);
  assert.equal(saved.length, 1_999_900);
  assert.deepEqual(restoreWorkspace(saved), workspace);
  const result = importSharedPlan(workspace, link(plan()));
  assert.equal(result.status, 'full');
  assert.strictEqual(result.workspace, workspace);
  assert.equal(result.url, undefined);
  assert.equal(serializeWorkspace(result.workspace, 0), saved);
});

test('failed storage write retains the shared URL and the in-memory imported trip', () => {
  const href = link(plan()), imported = importSharedPlan(workspaceWith(), href);
  assert.equal(imported.status, 'imported');
  const snapshot = structuredClone(imported.workspace), calls = [];
  let currentUrl = href;
  const result = persistWorkspace(imported.workspace, () => {
    calls.push('write');
    throw new Error('Authored quota failure');
  }, () => { calls.push('consume'); currentUrl = imported.url; });
  assert.equal(result, 'unsaved');
  assert.deepEqual(calls, ['write']);
  assert.equal(currentUrl, href);
  assert.deepEqual(imported.workspace, snapshot);
  assert.equal(imported.workspace.trips.length, 2);
});

test('successful persistence writes a restore-valid workspace before consuming the shared URL', () => {
  const imported = importSharedPlan(workspaceWith(), link(plan())), calls = [];
  assert.equal(imported.status, 'imported');
  let saved;
  const result = persistWorkspace(imported.workspace, serialized => {
    calls.push('write'); saved = serialized;
    assert.deepEqual(restoreWorkspace(serialized), imported.workspace);
  }, () => {
    assert.ok(saved);
    calls.push('consume');
  });
  assert.equal(result, 'saved');
  assert.deepEqual(calls, ['write', 'consume']);
});

test('a failed write can retry successfully before the original shared URL is consumed', () => {
  const imported = importSharedPlan(workspaceWith(), link(plan())), calls = [];
  assert.equal(imported.status, 'imported');
  const consume = () => calls.push('consume');
  assert.equal(persistWorkspace(imported.workspace, () => { calls.push('failed-write'); throw new Error('Authored first failure'); }, consume), 'unsaved');
  assert.equal(persistWorkspace(imported.workspace, () => calls.push('successful-write'), consume), 'saved');
  assert.deepEqual(calls, ['failed-write', 'successful-write', 'consume']);
});

test('invalid workspace data cannot overwrite a prior durable workspace or consume a URL', () => {
  const invalid = { ...workspaceWith(), version: 99 }, calls = [];
  const result = persistWorkspace(invalid, () => calls.push('write'), () => calls.push('consume'));
  assert.equal(result, 'unsaved');
  assert.deepEqual(calls, []);
});

test('oversized but structurally valid workspace data cannot overwrite durable data', () => {
  const oversized = nearLimitWorkspace();
  oversized.trips.push({ ...structuredClone(plan()), id: 'oversized-addition' });
  assert.ok(isWorkspace(oversized));
  assert.ok(JSON.stringify(oversized).length > 2_000_000);
  const calls = [];
  assert.equal(persistWorkspace(oversized, () => calls.push('write'), () => calls.push('consume')), 'unsaved');
  assert.deepEqual(calls, []);
});

test('history failure reports a retained link after a successful durable write', () => {
  const workspace = workspaceWith(), calls = [];
  assert.equal(persistWorkspace(workspace, () => calls.push('write'), () => {
    calls.push('consume'); throw new Error('Authored history failure');
  }), 'link-retained');
  assert.deepEqual(calls, ['write', 'consume']);
});
