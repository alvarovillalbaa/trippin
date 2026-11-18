// T2: authored trip data only; no browser, provider, Auth or backend calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const moduleUrl = new URL('../../lib/trip.ts', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === './data' && context.parentURL === moduleUrl
    ? new URL('../../lib/data.ts', import.meta.url).href : specifier, context);
} });
globalThis.fetch = () => { throw new Error('Network is forbidden in trip-cost checks.'); };
const {
  createTrip, initialWorkspace, getTripCost, publicTripSnapshot,
  importSharedPlan, serializeWorkspace, parseWorkspaceBackup, isTrip,
} = await import(moduleUrl);

function activity(cost) {
  return { id: 'authored-admission', title: 'Authored museum', category: 'culture',
    description: 'Manual planning estimate', time: '10:00', duration: 60, cost,
    lat: 48.137, lng: 11.575, location: 'Authored museum', status: 'planned', source: 'custom' };
}
function plan(cost = 0, endDate = '2026-12-01') {
  const value = createTrip('munich', '2026-12-01', endDate, 'Authored trip');
  value.budget = 100;
  value.days[0].activities = [activity(cost)];
  return value;
}
const profile = initialWorkspace().profile;

test('projected admission totals and breakdowns round half cents consistently at different magnitudes', () => {
  // Decimal expectations are written independently of the application's rounding.
  for (const [input, expected] of [[1.005, 1.01], [10.075, 10.08], [19.995, 20], [1000.005, 1000.01]]) {
    const cost = getTripCost(plan(input), profile);
    assert.equal(cost.activities, expected, `Admission ${input}`);
    assert.equal(cost.total, expected, `Total ${input}`);
  }
});

test('actual expenses round consistently and count once in the projection', () => {
  const value = plan(35);
  value.expenses = [{ id: 'actual-admission', title: 'Authored payment', category: 'culture',
    date: value.startDate, amount: 10.075, activityId: value.days[0].activities[0].id }];
  const cost = getTripCost(value, profile);
  assert.equal(cost.activities, 10.08);
  assert.equal(cost.total, 10.08);
  assert.equal(cost.spent, 10.08);
  assert.equal(cost.manual, 0);
  assert.equal(cost.remaining, 89.92);
});

test('negative remaining budgets use the same half-cent rounding as positive costs', () => {
  const value = plan(20);
  value.budget = 9.925;
  const cost = getTripCost(value, profile);
  assert.equal(cost.total, 20);
  assert.equal(cost.remaining, -10.08);
});

test('a sub-cent budget shortfall displays a plain zero remaining balance', () => {
  const value = plan(10);
  value.budget = 9.999;
  const cost = getTripCost(value, profile);
  assert.equal(cost.remaining, 0);
  assert.equal(Object.is(cost.remaining, -0), false);
});

test('shared trip allowances survive the actual public projection, import and backup round trip', () => {
  const value = plan(14.5, '2026-12-02');
  value.dailyFoodBudget = 27.25;
  value.dailyTransportBudget = 6;
  value.isPublic = true;
  value.privateExtension = { note: 'Private trip extension' };
  value.days[0].activities[0].privateExtension = 'Private stop extension';
  value.days[0].activities[0].bookingUrl = 'https://example.test/private-booking';
  value.bookings = [{ id: 'private-booking', type: 'flight', title: 'Private flight',
    reference: 'PRIVATE-REFERENCE', date: value.startDate, cost: 25,
    notes: 'Private booking note', status: 'reserved', source: 'custom' }];
  value.expenses = [{ id: 'private-expense', title: 'Private spending', category: 'other',
    date: value.startDate, amount: 7 }];
  value.companions = [{ id: 'private-companion', name: 'Authored companion', initials: 'AC',
    homeCity: 'Madrid', bio: 'Private biography', interests: [], color: '#123456', source: 'demo' }];
  value.joinRequests = [{ id: 'private-request', personId: 'private-companion',
    message: 'Private request', status: 'pending', source: 'demo' }];
  assert.equal(isTrip(value), true);
  const original = structuredClone(value);
  const snapshot = publicTripSnapshot(value);
  assert.deepEqual(value, original);
  assert.equal(isTrip(snapshot), true);
  assert.equal(snapshot.dailyFoodBudget, 27.25);
  assert.equal(snapshot.dailyTransportBudget, 6);
  assert.equal(Object.hasOwn(snapshot, 'privateExtension'), false);
  assert.equal(Object.hasOwn(snapshot.days[0].activities[0], 'privateExtension'), false);
  assert.equal(Object.hasOwn(snapshot.days[0].activities[0], 'bookingUrl'), false);
  for (const field of ['bookings', 'expenses', 'companions', 'joinRequests']) assert.deepEqual(snapshot[field], []);
  const recipient = initialWorkspace('Authored recipient');
  recipient.profile.dailyFoodBudget = 999;
  recipient.profile.dailyTransportBudget = 222;
  const href = `https://trippin.example/#plan=${Buffer.from(JSON.stringify(snapshot)).toString('base64')}`;
  const imported = importSharedPlan(recipient, href);
  assert.equal(imported.status, 'imported');
  const restored = parseWorkspaceBackup(new TextEncoder().encode(serializeWorkspace(imported.workspace, 0)));
  assert.deepEqual(restored, imported.workspace);
  const cost = getTripCost(restored.trips[0], restored.profile);
  // Two days: food 54.50 + transport 12 + admission 14.50 = 81 EUR.
  assert.equal(cost.food, 54.5);
  assert.equal(cost.transport, 12);
  assert.equal(cost.activities, 14.5);
  assert.equal(cost.total, 81);
});

test('legacy shared trips keep absent allowances and explicit zero overrides remain zero', () => {
  const value = plan();
  const legacy = publicTripSnapshot(value);
  assert.equal(Object.hasOwn(legacy, 'dailyFoodBudget'), false);
  assert.equal(Object.hasOwn(legacy, 'dailyTransportBudget'), false);
  const changedProfile = { ...profile, dailyFoodBudget: 25, dailyTransportBudget: 5 };
  assert.equal(getTripCost(legacy, changedProfile).total, 30);
  const zero = publicTripSnapshot({ ...value, dailyFoodBudget: 0, dailyTransportBudget: 0 });
  assert.equal(zero.dailyFoodBudget, 0);
  assert.equal(zero.dailyTransportBudget, 0);
  assert.equal(getTripCost(zero, changedProfile).total, 0);
});
