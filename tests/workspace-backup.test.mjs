import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const tripModule = new URL('../lib/trip.ts', import.meta.url).href;
// Only the extensionless data import needs Node's native TS-loader adapter.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === './data' && context.parentURL === tripModule
      ? new URL('../lib/data.ts', import.meta.url).href : specifier, context);
  },
});
globalThis.fetch = () => { throw new Error('Network calls are forbidden in pure backup checks.'); };
const {
  initialWorkspace, isWorkspace, serializeWorkspace,
  MAX_BACKUP_FILE_BYTES, exportWorkspaceBackup, parseWorkspaceBackup,
} = await import(tripModule);
// Missing exports are a missing implementation, not regression sensitivity.
assert.equal(typeof exportWorkspaceBackup, 'function');
assert.equal(typeof parseWorkspaceBackup, 'function');
assert.equal(MAX_BACKUP_FILE_BYTES, 16 * 1024 * 1024);
const utf8 = new TextEncoder();
const bytes = value => utf8.encode(typeof value === 'string' ? value : JSON.stringify(value));

function workspaceWith(count = 1) {
  const workspace = initialWorkspace(), template = workspace.trips[0];
  workspace.trips = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(template), id: `backup-owned-trip-${index}`,
  }));
  workspace.selectedTripId = workspace.trips.at(-1).id;
  assert.ok(isWorkspace(workspace), 'The authored fixture must satisfy the real model.');
  return workspace;
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function sizedWorkspace(length, character = 'x') {
  const workspace = workspaceWith(9);
  const template = workspace.trips[0].days[0].activities[0];
  for (const trip of workspace.trips) {
    for (const day of trip.days) day.activities = [];
    trip.days[0].activities = Array.from({ length: 60 }, (_, index) => ({
      ...structuredClone(template), id: `backup-owned-stop-${index}`, description: '',
    }));
  }
  let remaining = length - JSON.stringify(workspace).length;
  assert.ok(remaining > 0);
  for (const trip of workspace.trips) for (const activity of trip.days[0].activities) {
    const size = Math.min(4_000, remaining);
    activity.description = character.repeat(size);
    remaining -= size;
  }
  assert.equal(remaining, 0, 'The authored fixture has enough bounded string capacity.');
  assert.ok(isWorkspace(workspace));
  assert.equal(JSON.stringify(workspace).length, length);
  return workspace;
}

test('compact export and restore retain all 40 trips, private fields and accepted extensions', () => {
  const workspace = workspaceWith(40), trip = workspace.trips[0];
  const activity = trip.days[0].activities[0];
  trip.isPublic = true;
  trip.bookings = [{ id: 'backup-booking', type: 'flight', title: 'Authored private flight',
    reference: 'PRIVATE-AUTHORED-REFERENCE', date: trip.startDate, cost: 125,
    status: 'reserved', source: 'custom', notes: 'Private reservation notes', url: 'https://example.com/booking' }];
  trip.expenses = [{ id: 'backup-expense', title: 'Authored private expense', amount: 12,
    date: trip.startDate, category: 'food', bookingId: 'backup-booking' }];
  trip.companions = [{ id: 'backup-person', name: 'Authored companion', initials: 'AC',
    homeCity: 'Madrid', bio: 'Authored private biography', interests: ['culture'], color: '#123456', source: 'demo' }];
  trip.joinRequests = [{ id: 'backup-request', personId: 'backup-person',
    message: 'Authored private request', status: 'pending', source: 'demo' }];
  activity.event = { provider: 'ticketmaster', id: 'authored-event-id', scheduledDate: trip.startDate,
    fetchedAt: '2026-10-27T10:00:00.000Z', priceNote: 'Authored EUR estimate' };
  workspace.profile.openToEvents = ['culture', 'community'];
  workspace.backupExtension = { nested: ['retained', null, { text: 'Unknown fields are not projected away.' }] };
  trip.backupExtension = { privateNote: 'Retain accepted trip extensions too.' };
  assert.ok(isWorkspace(workspace));
  const original = structuredClone(workspace);
  freeze(workspace);
  const exported = exportWorkspaceBackup(workspace);
  assert.equal(exported.serialized, JSON.stringify(original), 'The new export is compact JSON.');
  assert.equal(exported.withinWorkspaceLimit, true);
  const encoded = bytes(exported.serialized), originalBytes = encoded.slice();
  const restored = parseWorkspaceBackup(encoded);
  assert.deepEqual(restored, original);
  assert.equal(restored.trips.length, 40);
  assert.equal(restored.selectedTripId, 'backup-owned-trip-39');
  assert.deepEqual(encoded, originalBytes, 'Parsing must not mutate the supplied bytes.');
  assert.deepEqual(workspace, original, 'Export must not mutate the supplied workspace.');
});

test('Unicode and JSON-escaped legacy string values round-trip without normalization', () => {
  const workspace = workspaceWith();
  workspace.profile.name = 'Café · 京都 · 🚋 · e\u0301';
  workspace.trips[0].description = '  Exact spaces\r\nTabs\tand quotes " stay.\u0000\ud800\udfff';
  workspace.unicodeExtension = { value: '\ufeffInside a string\u2028\u2029' };
  assert.ok(isWorkspace(workspace));
  const exported = exportWorkspaceBackup(workspace);
  assert.equal(exported.withinWorkspaceLimit, true);
  assert.deepEqual(parseWorkspaceBackup(bytes(exported.serialized)), workspace);
});

test('exactly two million compact JS characters remain valid even above two million UTF-8 bytes', () => {
  const workspace = sizedWorkspace(2_000_000, '漢');
  const exported = exportWorkspaceBackup(workspace), encoded = bytes(exported.serialized);
  assert.equal(exported.serialized.length, 2_000_000);
  assert.ok(encoded.byteLength > 2_000_000);
  assert.ok(encoded.byteLength <= 6_000_000);
  assert.equal(exported.withinWorkspaceLimit, true);
  assert.equal(serializeWorkspace(workspace, 0), exported.serialized);
  assert.deepEqual(parseWorkspaceBackup(encoded), workspace);
});

test('legacy indented JSON above the old two-MB file guard restores by its compact size', () => {
  const workspace = sizedWorkspace(1_999_900);
  const legacy = JSON.stringify(workspace, null, 2), encoded = bytes(legacy);
  assert.ok(legacy.length > 2_000_000);
  assert.ok(encoded.byteLength > 2_000_000 && encoded.byteLength < MAX_BACKUP_FILE_BYTES);
  const restored = parseWorkspaceBackup(encoded);
  assert.deepEqual(restored, workspace);
  assert.equal(serializeWorkspace(restored, 0).length, 1_999_900);
});

test('an optional UTF-8 BOM is accepted without altering any workspace string', () => {
  const workspace = workspaceWith(), encoded = bytes(workspace);
  const withBom = new Uint8Array(encoded.byteLength + 3);
  withBom.set([0xef, 0xbb, 0xbf]); withBom.set(encoded, 3);
  assert.deepEqual(parseWorkspaceBackup(withBom), workspace);
});

test('a two-million-plus-one-character recovery export remains available but cannot restore wholesale', () => {
  const workspace = sizedWorkspace(2_000_001), original = structuredClone(workspace);
  const exported = exportWorkspaceBackup(freeze(workspace));
  assert.equal(exported.serialized.length, 2_000_001);
  assert.equal(exported.withinWorkspaceLimit, false);
  assert.deepEqual(JSON.parse(exported.serialized), original, 'Recovery export must retain all archived data.');
  assert.throws(() => parseWorkspaceBackup(bytes(exported.serialized)));
  assert.deepEqual(workspace, original);
});

test('structurally unsupported in-memory data can still be archived without claiming restorability', () => {
  const workspace = { ...workspaceWith(), version: 99, recoveryNote: 'Keep this original archive.' };
  assert.equal(isWorkspace(workspace), false);
  const exported = exportWorkspaceBackup(workspace);
  assert.equal(exported.withinWorkspaceLimit, false);
  assert.deepEqual(JSON.parse(exported.serialized), workspace);
});

for (const [name, invalid] of [
  ['an unsupported version', () => ({ ...workspaceWith(), version: 99 })],
  ['41 trips', () => {
    const workspace = workspaceWith(40);
    workspace.trips.push({ ...structuredClone(workspace.trips[0]), id: 'backup-over-capacity' });
    return workspace;
  }],
  ['a missing selected-trip identity', () => ({ ...workspaceWith(), selectedTripId: 'not-a-saved-trip' })],
]) {
  test(`restore rejects ${name} instead of returning sample data`, () => {
    const input = invalid();
    assert.equal(isWorkspace(input), false);
    assert.throws(() => parseWorkspaceBackup(bytes(input)));
  });
}

test('malformed JSON and invalid UTF-8 throw rather than returning a replacement workspace', () => {
  for (const input of [bytes('{"version":'), Uint8Array.of(0xff), Uint8Array.of(0xc3, 0x28)]) {
    assert.throws(() => parseWorkspaceBackup(input));
  }
  // A malformed byte inside otherwise valid JSON must not silently become U+FFFD.
  const encoded = bytes(workspaceWith());
  const marker = bytes('Munich'), offset = Buffer.from(encoded).indexOf(marker);
  assert.ok(offset >= 0, 'The authored fixture contains the field used for UTF-8 corruption.');
  encoded[offset] = 0xff;
  assert.throws(() => parseWorkspaceBackup(encoded));
});

test('the raw-file cap is inclusive and applies independently of compact workspace size', () => {
  const workspace = workspaceWith(), encoded = bytes(workspace);
  const atLimit = new Uint8Array(MAX_BACKUP_FILE_BYTES).fill(0x20);
  atLimit.set(encoded);
  assert.deepEqual(parseWorkspaceBackup(atLimit), workspace, 'Trailing JSON whitespace is legal within the raw cap.');
  const overLimit = new Uint8Array(MAX_BACKUP_FILE_BYTES + 1).fill(0x20);
  overLimit.set(encoded);
  assert.throws(() => parseWorkspaceBackup(overLimit), 'A valid but oversized raw file must be refused.');
});
