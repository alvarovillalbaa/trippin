// T2: authored browser-state fixtures; no browser, Auth, backend or network calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const lib = new URL('../../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib) && /^\.\/[\w-]+$/.test(specifier)) return next(new URL(specifier + '.ts', context.parentURL).href, context);
  return next(specifier, context);
} });
globalThis.fetch = () => { throw new Error('Network is forbidden in frontend data checks.'); };
const trip = await import('../../lib/trip.ts');
const { seedProfile, seedTrips } = await import('../../lib/data.ts');
const { accountWorkspaceKey, readAccountWorkspace, saveAccountWorkspace, accountManagedStorage, restoreAccountWorkspace } = await import('../../lib/account-workspace.ts');
const { readManagedStorage } = await import('../../lib/community-management-storage.ts');
const { getGoogleMapsRoutes } = await import('../../lib/maps.ts');
const first = { id: '11111111-1111-4111-8111-111111111111', email: 'one@example.test', name: 'Authored One' };
const second = { id: '22222222-2222-4222-8222-222222222222', email: 'two@example.test', name: 'Authored Two' };
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function plan(name) { const value = trip.initialWorkspace(name); value.trips = [structuredClone(seedTrips[0])]; value.selectedTripId = value.trips[0].id; return value; }
function stop(index, update = {}) { return { id: `stop-${index}`, lat: 40 + index / 100, lng: -3 + index / 100, status: 'planned', ...update }; }

test('new workspaces are empty, valid and portable, with no fictional person or allowances', () => {
  const value = trip.initialWorkspace();
  assert.deepEqual(value.trips, []); assert.equal(value.profile.name, ''); assert.deepEqual(value.profile.badges, []);
  assert.equal(value.profile.dailyFoodBudget, 0); assert.equal(value.selectedTripId, '');
  assert.equal(trip.isWorkspace(value), true);
  assert.deepEqual(trip.parseWorkspaceBackup(new TextEncoder().encode(trip.serializeWorkspace(value))), value);
  assert.deepEqual(trip.restoreWorkspace(null), value);
  assert.equal(trip.isWorkspace({ ...value, selectedTripId: 'missing' }), false);
});

test('guest, first and second account workspaces are disjoint and require canonical account IDs', () => {
  const memory = storage(), a = plan('First'), b = plan('Second'), guest = plan('Guest');
  saveAccountWorkspace(memory, first, a); saveAccountWorkspace(memory, second, b); saveAccountWorkspace(memory, null, guest);
  assert.deepEqual(readAccountWorkspace(memory, first), a); assert.deepEqual(readAccountWorkspace(memory, second), b);
  assert.deepEqual(readAccountWorkspace(memory, null), guest);
  assert.equal(new Set([accountWorkspaceKey(first), accountWorkspaceKey(second), accountWorkspaceKey(null)]).size, 3);
  for (const id of ['__proto__', '../guest', '', 1]) assert.throws(() => accountWorkspaceKey({ ...first, id }));
});

test('legacy guest plans are retained without automatically assigning them to an account', () => {
  const legacy = { ...plan('Unused'), profile: seedProfile }, raw = JSON.stringify(legacy);
  const memory = storage({ 'trippin.workspace.v1': raw });
  const guest = readAccountWorkspace(memory, null);
  assert.deepEqual(guest.trips, legacy.trips.map(item => ({ ...item, dailyFoodBudget: legacy.profile.dailyFoodBudget, dailyTransportBudget: legacy.profile.dailyTransportBudget })));
  assert.equal(guest.profile.name, '');
  assert.deepEqual(trip.getTripCost(guest.trips[0], guest.profile), trip.getTripCost(legacy.trips[0], legacy.profile));
  assert.deepEqual(readAccountWorkspace(memory, first).trips, []);
  saveAccountWorkspace(memory, null, guest);
  assert.equal(memory.getItem('trippin.workspace.v1'), raw);
  assert.deepEqual(readAccountWorkspace(memory, null), guest);
  const edited = { ...legacy, profile: { ...seedProfile, name: 'A real edit' } };
  assert.equal(readAccountWorkspace(storage({ 'trippin.workspace.v1': JSON.stringify(edited) }), null).profile.name, 'A real edit');
});

test('corrupt browser data and silent or throwing write failures never become confirmed saves', () => {
  const memory = storage({ [accountWorkspaceKey(first)]: '{broken' });
  assert.throws(() => readAccountWorkspace(memory, first), /kept/);
  assert.throws(() => saveAccountWorkspace(memory, first, trip.initialWorkspace()), /recovery/);
  assert.equal(memory.getItem(accountWorkspaceKey(first)), '{broken');
  assert.throws(() => saveAccountWorkspace({ getItem: () => null, setItem() {} }, first, trip.initialWorkspace()), /confirm/);
  assert.throws(() => saveAccountWorkspace({ getItem: () => null, setItem() { throw new Error('Quota'); } }, first, trip.initialWorkspace()), /Quota/);
});

test('public-plan capabilities and entry enumeration stay within their account scope', () => {
  const memory = storage({ unrelated: 'keep' }), a = accountManagedStorage(() => memory, first), b = accountManagedStorage(() => memory, second);
  const guest = accountManagedStorage(() => memory, null), key = 'trippin.community.management.v1:reference:authored';
  a.setItem('trippin.owner', 'owner-a'); a.setItem(key, 'plan-a'); b.setItem('trippin.owner', 'owner-b');
  assert.equal(a.getItem('trippin.owner'), 'owner-a'); assert.equal(b.getItem('trippin.owner'), 'owner-b');
  assert.equal(guest.getItem('trippin.owner'), null); assert.equal(b.getItem(key), null);
  assert.deepEqual(Array.from({ length: a.length }, (_, index) => a.key(index)).sort(), [key, 'trippin.owner'].sort());
  a.removeItem('trippin.owner'); assert.equal(b.getItem('trippin.owner'), 'owner-b');
  a.setItem(accountWorkspaceKey(first), 'own workspace');
  assert.equal(memory.getItem(accountWorkspaceKey(first)), 'own workspace');
  assert.equal(memory.getItem('unrelated'), 'keep');
});

test('Google Maps links preserve order and every route leg within mobile waypoint and URL limits', () => {
  for (const count of [0, 1, 2, 5, 6, 9, 60]) {
    const stops = Array.from({ length: count }, (_, index) => stop(index));
    const routes = getGoogleMapsRoutes(stops), reconstructed = [];
    for (const [index, route] of routes.entries()) {
      const url = new URL(route.url), points = [url.searchParams.get('origin'), ...(url.searchParams.get('waypoints')?.split('|') || []), url.searchParams.get('destination')].filter(Boolean);
      assert.equal(url.origin, 'https://www.google.com'); assert.equal(url.searchParams.get('api'), '1');
      assert.equal(url.searchParams.get('travelmode'), 'walking'); assert.ok(route.url.length <= 2048);
      assert.ok((url.searchParams.get('waypoints')?.split('|').length || 0) <= 3);
      reconstructed.push(...(index ? points.slice(1) : points));
    }
    assert.deepEqual(reconstructed, stops.map(item => `${item.lat},${item.lng}`));
  }
});

test('skipped stops, unchosen alternatives and invalid coordinates stay out of directions', () => {
  const a = stop(0), b = stop(4);
  const [route] = getGoogleMapsRoutes([a, stop(1, { status: 'skipped' }), stop(2, { alternativeFor: a.id }), stop(3, { lat: Infinity }), b]);
  const url = new URL(route.url);
  assert.equal(url.searchParams.get('origin'), `${a.lat},${a.lng}`);
  assert.equal(url.searchParams.get('destination'), `${b.lat},${b.lng}`); assert.equal(url.searchParams.has('waypoints'), false);
});

test('daily allowances belong to their trip without changing other trips or legacy profile defaults', () => {
  const value = plan('Authored traveler');
  value.trips[0].days = value.trips[0].days.map(day => ({ ...day, activities: [] }));
  value.trips[0].bookings = []; value.trips[0].expenses = [];
  value.profile.dailyFoodBudget = 20; value.profile.dailyTransportBudget = 5;
  const original = value.trips[0], changed = { ...original, dailyFoodBudget: 10.5, dailyTransportBudget: 2.25 };
  assert.equal(trip.getTripCost(changed, value.profile).food, 10.5 * changed.days.length);
  assert.equal(trip.getTripCost(changed, value.profile).transport, 2.25 * changed.days.length);
  assert.equal(trip.getTripCost(original, value.profile).food, 20 * original.days.length);
  assert.equal(value.profile.dailyFoodBudget, 20);
  value.trips = [changed];
  assert.deepEqual(trip.parseWorkspaceBackup(new TextEncoder().encode(trip.serializeWorkspace(value))).trips[0], changed);
  assert.equal(trip.isTrip({ ...changed, dailyFoodBudget: NaN }), false);
  assert.equal(trip.isTrip({ ...changed, dailyTransportBudget: -1 }), false);
});

test('landing-page restores preserve public-plan management before replacing private trips', () => {
  const memory = storage(), before = plan('Public-plan host'); before.trips[0].isPublic = true;
  saveAccountWorkspace(memory, first, before);
  const next = plan('Restored traveler'); next.trips[0].id = 'restored-other'; next.selectedTripId = 'restored-other';
  restoreAccountWorkspace(memory, first, next);
  assert.deepEqual(readAccountWorkspace(memory, first), next);
  const managed = readManagedStorage(accountManagedStorage(() => memory, first)).records;
  assert.equal(managed.some(item => item.id === before.trips[0].id), true);
  assert.equal(readManagedStorage(accountManagedStorage(() => memory, second)).records.length, 0);
  assert.throws(() => restoreAccountWorkspace(memory, first, trip.initialWorkspace()), /Review public plans/);
  assert.deepEqual(readAccountWorkspace(memory, first), next);
});
