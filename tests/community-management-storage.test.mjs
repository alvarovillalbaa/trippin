// Tier 2: shared authored memory storage and controlled callback interleavings.
// No browser storage implementation, provider, backend or network executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const source = new URL('../lib/community-management-storage.ts', import.meta.url).href;
const codec = new URL('../lib/community-management.ts', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL === source && specifier === './community-management') return nextResolve(codec, context);
  if ([source, codec].includes(context.parentURL)) throw new Error('Unexpected runtime import in frontend management checks: ' + specifier);
  return nextResolve(specifier, context);
} });
globalThis.fetch = () => { throw new Error('Network is forbidden in frontend management-storage checks.'); };
const { COMMUNITY_MANAGEMENT_KEY: KEY, serializeManagedTrips } = await import(codec);
const { readManagedStorage, preserveManagedStorage, reserveManagedPublication,
  confirmManagedPublicationStorage, snapshotManagedUnpublish, confirmManagedUnpublishStorage } = await import(source);
const attemptKey = id => KEY + ':attempt:' + id;
const referenceKey = id => KEY + ':reference:' + id;
const record = (id, status = 'published', change = {}) => ({ id, title: 'Authored ' + id, city: 'Málaga', status, ...change });
const raw = (id, status = 'published', change = {}) => serializeManagedTrips([record(id, status, change)]);
function trip(id, change = {}) {
  return { id, title: 'Authored ' + id, city: 'Málaga', country: 'Spain', countryCode: 'ES',
    startDate: '2026-11-03', endDate: '2026-11-03', lat: 40, lng: -3, image: '/images/world.svg',
    description: 'Authored itinerary', budget: 100, currency: 'EUR', isPublic: false,
    days: [{ id: 'day-' + id, date: '2026-11-03', label: 'Authored day', activities: [] }],
    expenses: [], bookings: [], joinRequests: [], companions: [], ...change };
}
class MemoryStorage {
  constructor(entries = []) { this.values = new Map(entries); this.beforeSet = null; this.beforeRemove = null; this.readKeys = []; }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { this.readKeys.push(key); return this.values.get(key) ?? null; }
  setItem(key, value) { this.beforeSet?.(key, value); this.values.set(key, value); }
  removeItem(key) { this.beforeRemove?.(key); this.values.delete(key); }
}

test('the new protocol ignores unrelated browser keys and the unreleased aggregate key', () => {
  const storage = new MemoryStorage([['trippin.owner', 'authored-private-capability'], [KEY, 'old aggregate bytes'], ['trippin.workspace.v1', 'private workspace']]);
  assert.deepEqual(readManagedStorage(storage), { records: [], entries: [] });
  assert.deepEqual(storage.readKeys, []);
});

test('snapshot values are projections independent of mutable caller arrays', () => {
  const storage = new MemoryStorage([[attemptKey('op-a'), raw('trip-a')]]);
  const snapshot = readManagedStorage(storage);
  snapshot.records[0].title = 'Changed local projection'; snapshot.entries[0].record.status = 'uncertain'; snapshot.entries.length = 0;
  assert.deepEqual(readManagedStorage(storage).records, [record('trip-a')]);
  assert.equal(storage.getItem(attemptKey('op-a')), raw('trip-a'));
});

test('labels and ordering are stable across enumeration order while any uncertain attempt wins', () => {
  const entries = [[referenceKey('trip-a'), raw('trip-a', 'published', { title: 'Legacy label' })],
    [attemptKey('op-z'), raw('trip-a', 'uncertain', { title: 'Later key label' })],
    [attemptKey('op-a'), raw('trip-a', 'published', { title: 'First key label' })],
    [attemptKey('op-b'), raw('trip-b')]];
  const first = readManagedStorage(new MemoryStorage(entries));
  const second = readManagedStorage(new MemoryStorage([...entries].reverse()));
  assert.deepEqual(first, second);
  assert.deepEqual(first.records, [record('trip-a', 'uncertain', { title: 'First key label' }), record('trip-b')]);
});

test('legacy preservation adds missing public IDs without rewriting saved labels or uncertainty', () => {
  const existingRaw = JSON.stringify({ version: 1, trips: [record('old', 'uncertain', { title: 'Kept label' })] }, null, 2);
  const storage = new MemoryStorage([[attemptKey('old-op'), existingRaw]]);
  const supplied = [trip('old', { isPublic: true, title: 'Do not replace' }), trip('private'), trip('new-public', { isPublic: true })];
  const before = structuredClone(supplied);
  assert.deepEqual(preserveManagedStorage(storage, supplied), [record('new-public'), record('old', 'uncertain', { title: 'Kept label' })]);
  assert.equal(storage.getItem(attemptKey('old-op')), existingRaw);
  assert.equal(storage.getItem(referenceKey('new-public')), raw('new-public'));
  assert.equal(storage.getItem(referenceKey('old')), null); assert.equal(storage.getItem(referenceKey('private')), null);
  assert.deepEqual(supplied, before);
});

test('an existing deterministic legacy reference keeps its original bytes', () => {
  const original = JSON.stringify({ version: 1, trips: [record('trip-a', 'published', { city: 'Kept city' })] }, null, 2);
  const storage = new MemoryStorage([[referenceKey('trip-a'), original]]);
  preserveManagedStorage(storage, [trip('trip-a', { isPublic: true, city: 'Different city' })]);
  assert.equal(storage.getItem(referenceKey('trip-a')), original);
});

test('reservation persists one projected uncertain attempt before returning its management reference', () => {
  const storage = new MemoryStorage();
  const supplied = trip('trip-a', { title: '  Viaje 🌅  ', city: '東京', bookings: [{ reference: 'Private fixture' }] });
  Object.defineProperty(supplied, 'owner', { enumerable: true, get() { throw new Error('The private capability must not be read.'); } });
  const reservation = reserveManagedPublication(storage, supplied, 'authored-operation');
  assert.equal(reservation.key, attemptKey('authored-operation')); assert.equal(reservation.id, 'trip-a');
  assert.deepEqual(reservation.records, [record('trip-a', 'uncertain', { title: '  Viaje 🌅  ', city: '東京' })]);
  assert.equal(storage.length, 1); assert.doesNotMatch(storage.getItem(reservation.key), /bookings|reference|owner|Private fixture/);
});

test('an existing operation key is refused instead of replacing any attempt', () => {
  const storage = new MemoryStorage(); reserveManagedPublication(storage, trip('trip-a'), 'same-op');
  const before = [...storage.values];
  assert.throws(() => reserveManagedPublication(storage, trip('trip-b'), 'same-op'), /already has/);
  assert.deepEqual([...storage.values], before);
});

for (const id of ['', 'space id', 'slash/id', 'a'.repeat(81)]) test('invalid operation suffix is refused: ' + JSON.stringify(id), () => {
  const storage = new MemoryStorage();
  assert.throws(() => reserveManagedPublication(storage, trip('trip-a'), id), /invalid/);
  assert.equal(storage.length, 0);
});

test('two tabs with stale reads reserve different IDs without overwriting either reference', () => {
  const storage = new MemoryStorage(); let second;
  storage.beforeSet = key => {
    if (key !== attemptKey('op-a')) return;
    storage.beforeSet = null;
    second = reserveManagedPublication(storage, trip('trip-b'), 'op-b');
  };
  const first = reserveManagedPublication(storage, trip('trip-a'), 'op-a');
  assert.equal(first.records.length, 2); assert.equal(second.records.length, 1);
  assert.deepEqual(readManagedStorage(storage).records, [record('trip-a', 'uncertain'), record('trip-b', 'uncertain')]);
  assert.equal(storage.length, 2);
});

test('one same-ID acknowledgment cannot clear a different tab’s unknown publication', () => {
  const storage = new MemoryStorage();
  const first = reserveManagedPublication(storage, trip('trip-a'), 'op-a');
  const second = reserveManagedPublication(storage, trip('trip-a'), 'op-b');
  assert.deepEqual(confirmManagedPublicationStorage(storage, first), [record('trip-a', 'uncertain')]);
  assert.equal(readManagedStorage(storage).entries.find(entry => entry.key === second.key).record.status, 'uncertain');
  assert.deepEqual(confirmManagedPublicationStorage(storage, second), [record('trip-a')]);
});

test('a publication acknowledgment never recreates an erased attempt from its stale records array', () => {
  const storage = new MemoryStorage(), reservation = reserveManagedPublication(storage, trip('trip-a'), 'op-a');
  storage.removeItem(reservation.key); reserveManagedPublication(storage, trip('trip-b'), 'op-b');
  assert.deepEqual(confirmManagedPublicationStorage(storage, reservation), [record('trip-b', 'uncertain')]);
  assert.equal(storage.getItem(reservation.key), null);
});

test('an acknowledgment for the wrong ID leaves the original attempt unchanged', () => {
  const storage = new MemoryStorage(), reservation = reserveManagedPublication(storage, trip('trip-a'), 'op-a');
  const before = storage.getItem(reservation.key);
  assert.throws(() => confirmManagedPublicationStorage(storage, { ...reservation, id: 'trip-b' }), /invalid/);
  assert.equal(storage.getItem(reservation.key), before);
});

test('repeated publication acknowledgment does not rewrite already published bytes', () => {
  const storage = new MemoryStorage(), reservation = reserveManagedPublication(storage, trip('trip-a'), 'op-a');
  confirmManagedPublicationStorage(storage, reservation);
  storage.beforeSet = () => { throw new Error('A repeated acknowledgment must not rewrite the record.'); };
  assert.deepEqual(confirmManagedPublicationStorage(storage, reservation), [record('trip-a')]);
});

test('DELETE captures only matching published entries before the request', () => {
  const storage = new MemoryStorage();
  preserveManagedStorage(storage, [trip('trip-a', { isPublic: true }), trip('trip-b', { isPublic: true })]);
  const pending = reserveManagedPublication(storage, trip('trip-a'), 'unknown-op');
  const captured = snapshotManagedUnpublish(storage, 'trip-a');
  assert.deepEqual(captured, [{ key: referenceKey('trip-a'), raw: raw('trip-a') }]);
  assert.deepEqual(confirmManagedUnpublishStorage(storage, 'trip-a', captured), [record('trip-a', 'uncertain'), record('trip-b')]);
  assert.notEqual(storage.getItem(pending.key), null);
});

for (const acknowledge of [false, true]) test('a new POST ' + (acknowledge ? 'and acknowledgment' : 'with unknown outcome') + ' after DELETE capture keeps its own key', () => {
  const storage = new MemoryStorage(), first = reserveManagedPublication(storage, trip('trip-a'), 'op-a');
  confirmManagedPublicationStorage(storage, first);
  const captured = snapshotManagedUnpublish(storage, 'trip-a');
  const newer = reserveManagedPublication(storage, trip('trip-a'), 'op-b');
  if (acknowledge) confirmManagedPublicationStorage(storage, newer);
  assert.deepEqual(confirmManagedUnpublishStorage(storage, 'trip-a', captured), [record('trip-a', acknowledge ? 'published' : 'uncertain')]);
  assert.equal(storage.getItem(first.key), null); assert.notEqual(storage.getItem(newer.key), null);
});

test('a legacy reference key created after capture is not removed by that snapshot', () => {
  const storage = new MemoryStorage(), first = reserveManagedPublication(storage, trip('trip-a'), 'op-a');
  confirmManagedPublicationStorage(storage, first);
  const captured = snapshotManagedUnpublish(storage, 'trip-a');
  storage.removeItem(first.key);
  preserveManagedStorage(storage, [trip('trip-a', { isPublic: true })]);
  assert.deepEqual(confirmManagedUnpublishStorage(storage, 'trip-a', captured), [record('trip-a')]);
  assert.equal(storage.getItem(referenceKey('trip-a')), raw('trip-a'));
});

test('changed published bytes and unrelated IDs are retained after an older DELETE acknowledgment', () => {
  const storage = new MemoryStorage(); preserveManagedStorage(storage, [trip('trip-a', { isPublic: true }), trip('trip-b', { isPublic: true })]);
  const captured = snapshotManagedUnpublish(storage, 'trip-a');
  const changed = raw('trip-a', 'published', { title: 'Changed after capture' });
  storage.setItem(referenceKey('trip-a'), changed);
  confirmManagedUnpublishStorage(storage, 'trip-a', [...captured, { key: referenceKey('trip-b'), raw: raw('trip-b') }]);
  assert.equal(storage.getItem(referenceKey('trip-a')), changed); assert.equal(storage.getItem(referenceKey('trip-b')), raw('trip-b'));
});

test('even a caller-supplied uncertain capture cannot remove an unknown publication', () => {
  const storage = new MemoryStorage(), pending = reserveManagedPublication(storage, trip('trip-a'), 'op-a');
  const bytes = storage.getItem(pending.key);
  assert.deepEqual(confirmManagedUnpublishStorage(storage, 'trip-a', [{ key: pending.key, raw: bytes }]), [record('trip-a', 'uncertain')]);
  assert.equal(storage.getItem(pending.key), bytes);
});

test('a failed reservation write leaves existing references intact and returns no reservation', () => {
  const storage = new MemoryStorage([[referenceKey('trip-a'), raw('trip-a')]]), before = [...storage.values];
  storage.beforeSet = () => { throw new Error('Authored storage full'); };
  assert.throws(() => reserveManagedPublication(storage, trip('trip-b'), 'op-b'), /storage full/);
  assert.deepEqual([...storage.values], before);
});

test('a failed acknowledgment write keeps the uncertain attempt available', () => {
  const storage = new MemoryStorage(), pending = reserveManagedPublication(storage, trip('trip-a'), 'op-a');
  const before = storage.getItem(pending.key); storage.beforeSet = () => { throw new Error('Authored storage full'); };
  assert.throws(() => confirmManagedPublicationStorage(storage, pending), /storage full/);
  assert.equal(storage.getItem(pending.key), before);
});

test('a failed cleanup never rewrites or removes unrelated management entries', () => {
  const storage = new MemoryStorage(); preserveManagedStorage(storage, [trip('trip-a', { isPublic: true }), trip('trip-b', { isPublic: true })]);
  const captured = snapshotManagedUnpublish(storage, 'trip-a'), before = [...storage.values];
  storage.beforeRemove = () => { throw new Error('Authored storage blocked'); };
  assert.throws(() => confirmManagedUnpublishStorage(storage, 'trip-a', captured), /storage blocked/);
  assert.deepEqual([...storage.values], before);
});

test('a partial legacy import adds independent references without overwriting earlier saved bytes', () => {
  const original = raw('existing'), storage = new MemoryStorage([[referenceKey('existing'), original]]);
  storage.beforeSet = key => { if (key === referenceKey('new-b')) throw new Error('Authored storage full'); };
  assert.throws(() => preserveManagedStorage(storage, [trip('new-a', { isPublic: true }), trip('new-b', { isPublic: true })]), /storage full/);
  assert.equal(storage.getItem(referenceKey('existing')), original);
  assert.equal(storage.getItem(referenceKey('new-a')), raw('new-a')); assert.equal(storage.getItem(referenceKey('new-b')), null);
});

for (const [key, bytes] of [
  [KEY + ':unknown:entry', raw('trip-a')], [attemptKey('bad/suffix'), raw('trip-a')], [attemptKey('a'.repeat(81)), raw('trip-a')],
  [referenceKey('wrong-id'), raw('trip-a')], [attemptKey('empty'), serializeManagedTrips([])],
  [attemptKey('multiple'), serializeManagedTrips([record('trip-a'), record('trip-b')])],
  [attemptKey('future'), '{"version":2,"trips":[]}'], [attemptKey('broken'), '{'],
]) test('malformed protocol entry fails closed and preserves its raw bytes: ' + key, () => {
  const storage = new MemoryStorage([[key, bytes]]);
  assert.throws(() => readManagedStorage(storage), /invalid|unsupported/);
  assert.throws(() => reserveManagedPublication(storage, trip('new'), 'new-op'), /invalid|unsupported/);
  assert.deepEqual([...storage.values], [[key, bytes]]);
});

test('the reader tolerates a key removed between enumeration and its value read', () => {
  const storage = new MemoryStorage([[referenceKey('trip-a'), raw('trip-a')]]), original = storage.getItem.bind(storage);
  storage.getItem = key => { storage.removeItem(key); return original(key); };
  assert.deepEqual(readManagedStorage(storage), { records: [], entries: [] });
});

test('40 distinct IDs block a new trip while same-ID retries remain possible', () => {
  const storage = new MemoryStorage(); preserveManagedStorage(storage, Array.from({ length: 40 }, (_, index) => trip('trip-' + index, { isPublic: true })));
  assert.throws(() => reserveManagedPublication(storage, trip('overflow'), 'overflow-op'), /40 distinct/);
  reserveManagedPublication(storage, trip('trip-0'), 'retry-op');
  assert.equal(readManagedStorage(storage).records.length, 40); assert.equal(readManagedStorage(storage).entries.length, 41);
});

test('concurrent overflow beyond 40 stays readable and permits cleanup rather than locking recovery', () => {
  const storage = new MemoryStorage(); preserveManagedStorage(storage, Array.from({ length: 39 }, (_, index) => trip('old-' + index, { isPublic: true })));
  storage.beforeSet = key => {
    if (key !== attemptKey('op-a')) return;
    storage.beforeSet = null; reserveManagedPublication(storage, trip('new-b'), 'op-b');
  };
  reserveManagedPublication(storage, trip('new-a'), 'op-a');
  assert.equal(readManagedStorage(storage).records.length, 41);
  assert.throws(() => reserveManagedPublication(storage, trip('blocked'), 'blocked-op'), /40 distinct/);
  const captured = snapshotManagedUnpublish(storage, 'old-0');
  assert.equal(confirmManagedUnpublishStorage(storage, 'old-0', captured).length, 40);
  reserveManagedPublication(storage, trip('new-a'), 'same-id-retry');
  const second = snapshotManagedUnpublish(storage, 'old-1'); confirmManagedUnpublishStorage(storage, 'old-1', second);
  reserveManagedPublication(storage, trip('after-cleanup'), 'after-cleanup-op');
  assert.equal(readManagedStorage(storage).records.length, 40);
});

test('legacy public references remain recoverable even when they take the aggregate above 40', () => {
  const storage = new MemoryStorage();
  const records = preserveManagedStorage(storage, Array.from({ length: 41 }, (_, index) => trip('legacy-' + index, { isPublic: true })));
  assert.equal(records.length, 41);
  const captured = snapshotManagedUnpublish(storage, 'legacy-0');
  assert.equal(confirmManagedUnpublishStorage(storage, 'legacy-0', captured).length, 40);
});
