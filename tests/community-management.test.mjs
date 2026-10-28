// Tier 2: authored, in-memory frontend management data. No server, provider,
// browser, storage API or network executes; these records are not server truth.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const source = new URL('../lib/community-management.ts', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL === source) throw new Error('Unexpected runtime import in frontend journal checks: ' + specifier);
  return nextResolve(specifier, context);
} });
globalThis.fetch = () => { throw new Error('Network is forbidden in frontend journal checks.'); };
const { COMMUNITY_MANAGEMENT_KEY, MAX_MANAGED_TRIPS, parseManagedTrips, serializeManagedTrips,
  rememberManagedTrip } = await import(source);

const managed = (id = 'authored-a', status = 'published', overrides = {}) => ({ id, title: 'Authored trip ' + id, city: 'Málaga', status, ...overrides });
const envelope = trips => JSON.stringify({ version: 1, trips });
function trip(id, overrides = {}) {
  return { id, title: 'Authored trip ' + id, city: 'Málaga', country: 'Spain', countryCode: 'ES',
    startDate: '2026-11-03', endDate: '2026-11-03', lat: 40, lng: -3, image: '/images/world.svg',
    description: 'Authored itinerary', budget: 100, currency: 'EUR', isPublic: false,
    days: [{ id: 'day-' + id, date: '2026-11-03', label: 'Authored day', activities: [] }],
    expenses: [], bookings: [], joinRequests: [], companions: [], ...overrides };
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('the independent versioned journal round-trips management records and an absent journal is empty', () => {
  assert.equal(COMMUNITY_MANAGEMENT_KEY, 'trippin.community-management.v1');
  assert.equal(MAX_MANAGED_TRIPS, 40);
  assert.deepEqual(parseManagedTrips(null), []);
  const records = [managed(), managed('authored-b', 'uncertain')];
  assert.deepEqual(parseManagedTrips(serializeManagedTrips(records)), records);
  assert.deepEqual(JSON.parse(serializeManagedTrips([])), { version: 1, trips: [] });
});

for (const [name, raw] of [
  ['empty text', ''], ['broken JSON', '{'], ['null JSON', 'null'], ['array root', '[]'],
  ['missing version', '{"trips":[]}'], ['future version', '{"version":2,"trips":[]}'],
  ['string version', '{"version":"1","trips":[]}'], ['missing trips', '{"version":1}'],
  ['non-array trips', '{"version":1,"trips":{}}'], ['foreign root fields', '{"version":1,"trips":[],"owner":"authored-secret"}'],
]) test('parse refuses ' + name + ' without treating it as an empty saved journal', () => {
  const before = raw;
  assert.throws(() => parseManagedTrips(raw), /invalid|unsupported/);
  assert.equal(raw, before);
});

for (const [name, record] of [
  ['null entry', null], ['missing status', { id: 'authored-a', title: 'Trip', city: 'City' }],
  ['empty ID', managed('')], ['foreign ID punctuation', managed('authored/a')], ['overlong ID', managed('a'.repeat(81))],
  ['numeric title', managed('a', 'published', { title: 5 })], ['blank title', managed('a', 'published', { title: ' \t' })],
  ['overlong title', managed('a', 'published', { title: 'a'.repeat(201) })],
  ['blank city', managed('a', 'published', { city: '\n ' })], ['overlong city', managed('a', 'published', { city: 'a'.repeat(201) })],
  ['unknown status', managed('a', 'private')], ['foreign entry fields', { ...managed(), owner: 'authored-secret' }],
]) test('parse rejects ' + name + ' atomically', () => {
  const raw = envelope([managed('valid-before'), record, managed('valid-after')]);
  assert.throws(() => parseManagedTrips(raw), /invalid|unsupported/);
  assert.ok(raw.includes('valid-before') && raw.includes('valid-after'));
});

test('duplicate IDs reject instead of losing one management reference', () => {
  const records = [managed(), managed('authored-a', 'uncertain')];
  assert.throws(() => parseManagedTrips(envelope(records)), /invalid/);
  assert.throws(() => serializeManagedTrips(records), /invalid/);
});

test('Unicode labels, outer whitespace and exact field limits survive without normalization', () => {
  const record = managed('a'.repeat(80), 'uncertain', { title: '🌅'.repeat(100), city: '東京'.repeat(100) });
  assert.deepEqual(parseManagedTrips(serializeManagedTrips([record])), [record]);
  const spaced = managed('spaced', 'published', { title: '  Viaje a Málaga  ', city: '\t東京 ' });
  assert.deepEqual(parseManagedTrips(serializeManagedTrips([spaced])), [spaced]);
});

test('serialization projects only known fields and never reads unrelated private getters', () => {
  const record = { ...managed(), bookings: [{ reference: 'authored-booking' }], expenses: [1], profile: { name: 'Private fixture' } };
  Object.defineProperty(record, 'owner', { enumerable: true, get() { throw new Error('Private capability must not be read.'); } });
  const serialized = serializeManagedTrips([record]);
  assert.deepEqual(JSON.parse(serialized), { version: 1, trips: [managed()] });
  assert.doesNotMatch(serialized, /owner|capability|bookings|expenses|profile|authored-booking|Private fixture/);
  assert.throws(() => serializeManagedTrips([{ ...managed(), status: { toString() { throw new Error('Status must not be coerced.'); } } }]), /invalid/);
});

test('raw journal length accepts exactly 50,000 characters and refuses one more', () => {
  const raw = envelope([managed()]);
  const exact = raw + ' '.repeat(50_000 - raw.length);
  assert.deepEqual(parseManagedTrips(exact), [managed()]);
  assert.throws(() => parseManagedTrips(exact + ' '), /invalid/);
});

test('escaped labels cannot make serialization exceed its independent raw-character bound', () => {
  const records = Array.from({ length: 40 }, (_, index) => managed('authored-' + index, 'published', { title: '\0'.repeat(200), city: '\b'.repeat(200) }));
  assert.throws(() => serializeManagedTrips(records), /50,000-character/);
  assert.equal(records.length, 40);
});

test('all 40 records round-trip and a 41st entry rejects for both persisted codecs', () => {
  const records = Array.from({ length: 40 }, (_, index) => managed('authored-' + index));
  assert.deepEqual(parseManagedTrips(serializeManagedTrips(records)), records);
  const tooMany = [...records, managed('overflow')];
  assert.throws(() => parseManagedTrips(envelope(tooMany)), /40 managed/);
  assert.throws(() => serializeManagedTrips(tooMany), /40 managed/);
});

test('remember upserts one projected record without mutating frozen input or sharing records', () => {
  const original = freeze([managed(), managed('authored-b', 'uncertain')]);
  const supplied = freeze(trip('authored-a', { title: 'Updated label', city: 'Kyoto', bookings: [{ reference: 'Private fixture' }] }));
  const before = structuredClone(original), inputBefore = structuredClone(supplied);
  const next = rememberManagedTrip(original, supplied, 'uncertain');
  assert.deepEqual(next, [managed('authored-a', 'uncertain', { title: 'Updated label', city: 'Kyoto' }), original[1]]);
  assert.deepEqual(original, before); assert.deepEqual(supplied, inputBefore);
  assert.notStrictEqual(next, original); assert.notStrictEqual(next[1], original[1]);
  assert.deepEqual(Object.keys(next[0]), ['id', 'title', 'city', 'status']);
});

test('remember appends a new management reference and permits updates at capacity', () => {
  const records = freeze(Array.from({ length: 40 }, (_, index) => managed('authored-' + index)));
  const changed = rememberManagedTrip(records, trip('authored-39', { city: 'Lisbon' }), 'uncertain');
  assert.equal(changed.length, 40); assert.equal(changed[39].city, 'Lisbon'); assert.equal(changed[39].status, 'uncertain');
  assert.throws(() => rememberManagedTrip(records, trip('overflow'), 'uncertain'), /40 managed/);
  assert.equal(records[39].city, 'Málaga'); assert.equal(records[39].status, 'published');
  assert.deepEqual(rememberManagedTrip([], trip('first'), 'uncertain'), [managed('first', 'uncertain')]);
});
