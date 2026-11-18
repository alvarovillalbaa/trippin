// T2: authored Storage, lock and generation controls; no browser/Auth/backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const lib = new URL('../../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib) && /^\.\/[\w-]+$/.test(specifier)) return next(new URL(specifier + '.ts', context.parentURL).href, context);
  return next(specifier, context);
} });
const { initialWorkspace, createTrip, serializeWorkspace } = await import('../../lib/trip.ts');
const { accountWorkspaceKey, readAccountWorkspace, saveAccountWorkspace, accountManagedStorage,
  captureAccountWorkspaceRecovery: capture, recoverAccountWorkspace: recover,
  accountWorkspaceRecoveryArchives: archives } = await import('../../lib/account-workspace.ts');
const { COMMUNITY_MANAGEMENT_KEY: journal, serializeManagedTrips } = await import('../../lib/community-management.ts');
const { readManagedStorage } = await import('../../lib/community-management-storage.ts');
const alice = { id: '11111111-1111-4111-8111-111111111111', email: 'one@example.test', name: 'One' };
const bob = { id: '22222222-2222-4222-8222-222222222222', email: 'two@example.test', name: 'Two' };
const guestKey = accountWorkspaceKey(null), legacyKey = 'trippin.workspace.v1';
const physical = (user, key) => user ? `trippin.account.${user.id.toLowerCase()}.${key}` : key;
function plan(id = 'restored', published = false) {
  const value = initialWorkspace('Authored traveler');
  value.trips = [{ ...createTrip('munich', '2027-02-01', '2027-02-02'), id, isPublic: published }];
  value.selectedTripId = id;
  return value;
}
function memory(initial = {}) {
  const values = new Map(Object.entries(initial)), writes = [];
  const store = { values, writes, beforeWrite: null, afterWrite: null, beforeRead: null,
    get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem(key) { store.beforeRead?.(key); return values.get(key) ?? null; },
    setItem(key, raw) { writes.push({ key, raw }); if (store.beforeWrite?.(key, raw) === false) return; values.set(key, raw); store.afterWrite?.(key, raw); },
    removeItem(key) { values.delete(key); } };
  return store;
}
function locks() {
  const calls = [];
  return { calls, request(name, options, callback) { calls.push({ name, options }); return Promise.resolve().then(() => callback({ name, mode: 'exclusive' })); } };
}
function heldLock() {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  return { release, request: async (name, options, callback) => { await gate; return callback({ name, mode: options.mode }); } };
}
function setup(user = alice, raw = '{broken') {
  const key = accountWorkspaceKey(user), store = memory({ [key]: raw });
  return { user, key, raw, store, ticket: capture(store, user, 'recovery-1') };
}
function originalUnchanged(state) { assert.equal(state.store.getItem(state.key), state.raw); }
function verifiedArchive(state) {
  const raw = state.store.getItem(state.ticket.archiveKey);
  assert.equal(JSON.parse(raw).raw, state.raw);
  return raw;
}

test('capture is read-only, selects corrupt v2, and leaves healthy or absent workspaces alone', () => {
  const state = setup();
  assert.deepEqual(state.store.writes, []);
  assert.equal(state.ticket.targetKey, state.key); assert.equal(state.ticket.sourceKey, state.key);
  assert.equal(state.ticket.sourceRaw, state.raw); assert.equal(state.ticket.publicRecoveryIncomplete, true);
  assert.equal(capture(memory(), alice, 'empty'), null);
  assert.equal(capture(memory({ [state.key]: serializeWorkspace(plan()) }), alice, 'valid'), null);
  for (const id of ['', '../escape', 'x'.repeat(81), null, 4]) assert.throws(() => capture(state.store, alice, id), /identifier/);
  assert.throws(() => readAccountWorkspace(state.store, alice), /kept/);
  assert.throws(() => saveAccountWorkspace(state.store, alice, plan()), /recovery/);
  originalUnchanged(state);
});

test('explicit restore verifies original archive and candidate, using an exclusive namespace lock', async () => {
  const state = setup(), next = plan(), lock = locks();
  const result = await recover(state.store, alice, state.ticket, next, lock, () => true);
  assert.deepEqual(result, { workspace: next, archiveKey: state.ticket.archiveKey });
  assert.deepEqual(readAccountWorkspace(state.store, alice), next);
  assert.equal(lock.calls[0].name, 'trippin.workspace.recovery:' + state.key);
  assert.equal(lock.calls[0].options.mode, 'exclusive'); assert.ok(lock.calls[0].options.signal instanceof AbortSignal);
  const archive = JSON.parse(verifiedArchive(state));
  assert.deepEqual(Object.keys(archive).sort(), ['kind', 'raw', 'recoveryId', 'sourceKey', 'targetKey', 'version']);
  assert.equal(archive.kind, 'trippin-workspace-recovery');
  assert.equal(state.store.writes[0].key, state.ticket.archiveKey);
  assert.equal(state.store.writes.at(-1).key, state.key);
});

test('archive preserves exact UTF-16 strings including lone surrogates without copying capability bytes', async () => {
  const state = setup(alice, 'broken\ud800middle\udfff'), owner = physical(alice, 'trippin.owner');
  state.store.values.set(owner, 'private-owner-capability'); state.ticket = capture(state.store, alice, 'surrogates');
  await recover(state.store, alice, state.ticket, plan(), locks(), () => true);
  const archive = verifiedArchive(state);
  assert.equal(archive.includes('private-owner-capability'), false); assert.equal(archive.includes('capabilities'), false);
  assert.equal(state.store.getItem(owner), 'private-owner-capability');
});

test('guest legacy recovery keeps original v1 and every other guest/account namespace byte', async () => {
  const before = { [legacyKey]: 'legacy\ud800bad', [accountWorkspaceKey(alice)]: '{alice', [accountWorkspaceKey(bob)]: '{bob', unrelated: 'unchanged' };
  const store = memory(before), ticket = capture(store, null, 'legacy');
  assert.equal(ticket.sourceKey, legacyKey); assert.equal(ticket.targetKey, guestKey); assert.equal(ticket.targetRaw, null);
  assert.equal(capture(store, alice, 'alice').sourceKey, accountWorkspaceKey(alice));
  const next = plan();
  await recover(store, null, ticket, next, locks(), () => true);
  for (const [key, raw] of Object.entries(before)) assert.equal(store.getItem(key), raw);
  assert.deepEqual(readAccountWorkspace(store, null), next);
  assert.equal(capture(memory({ [legacyKey]: '{guest-only' }), alice, 'not-guest'), null);
  const v2 = memory({ [guestKey]: '{current', [legacyKey]: serializeWorkspace(plan()) });
  assert.equal(capture(v2, null, 'selected').sourceRaw, '{current');
});

test('archive catalog is opaque, read-only, sorted and restricted to the exact current namespace', () => {
  const a = accountWorkspaceKey(alice), b = accountWorkspaceKey(bob);
  const store = memory({ [a + '.recovery.z']: '{invalid archive', [a + '.recovery.a']: '\udfff',
    [a + '.recovery-not-an-archive']: 'no', [b + '.recovery.a']: 'bob', [guestKey + '.recovery.a']: 'guest', [legacyKey]: 'legacy' });
  assert.deepEqual(archives(store, alice), [{ key: a + '.recovery.a', raw: '\udfff' }, { key: a + '.recovery.z', raw: '{invalid archive' }]);
  assert.deepEqual(archives(store, null), [{ key: guestKey + '.recovery.a', raw: 'guest' }]);
  assert.deepEqual(store.writes, []);
});

test('strict public metadata is salvaged even when the complete old trip is invalid', async () => {
  const old = { trips: [{ id: 'public-old', title: 'Old public title', city: 'Munich', isPublic: true, days: 'broken' },
    { id: 'private-old', isPublic: false }] };
  const state = setup(alice, JSON.stringify(old)), next = plan('public-new', true);
  assert.equal(state.ticket.publicRecoveryIncomplete, false);
  await recover(state.store, alice, state.ticket, next, locks(), () => true);
  const records = readManagedStorage(accountManagedStorage(() => state.store, alice)).records;
  assert.deepEqual(records.map(item => item.id), ['public-new', 'public-old']);
  assert.equal(records.find(item => item.id === 'public-old').title, 'Old public title');
  assert.equal(records.every(item => item.status === 'published'), true);
  assert.equal(readManagedStorage(accountManagedStorage(() => state.store, bob)).records.length, 0);
});

test('unknown public metadata is warned about, archived exactly, and never becomes invented records', async () => {
  const old = { trips: [{ id: '../bad', title: 'Known label', city: 'Munich', isPublic: true },
    { id: 'blank-label', title: '', city: 'Munich', isPublic: true }, { id: 'unknown-status', title: 'Unknown', city: 'Munich' }, null] };
  const state = setup(alice, JSON.stringify(old));
  assert.equal(state.ticket.publicRecoveryIncomplete, true);
  await recover(state.store, alice, state.ticket, plan(), locks(), () => true);
  verifiedArchive(state);
  assert.deepEqual(readManagedStorage(accountManagedStorage(() => state.store, alice)).records, []);
});

test('existing owner and uncertain/public journals remain exact, independent entries', async () => {
  const state = setup(alice, JSON.stringify({ trips: [{ id: 'same-public', title: 'Old label', city: 'Munich', isPublic: true }] }));
  const entry = journal + ':attempt:operation-1', raw = serializeManagedTrips([{ id: 'same-public', title: 'Existing label', city: 'Munich', status: 'uncertain' }]);
  state.store.values.set(physical(alice, entry), raw); state.store.values.set(physical(alice, 'trippin.owner'), 'owner');
  state.store.values.set(physical(bob, entry), 'unrelated-bob'); state.ticket = capture(state.store, alice, 'uncertain');
  await recover(state.store, alice, state.ticket, plan(), locks(), () => true);
  assert.equal(state.store.getItem(physical(alice, entry)), raw); assert.equal(state.store.getItem(physical(bob, entry)), 'unrelated-bob');
  assert.deepEqual(readManagedStorage(accountManagedStorage(() => state.store, alice)).records,
    [{ id: 'same-public', title: 'Existing label', city: 'Munich', status: 'uncertain' }]);
  assert.equal(state.store.getItem(physical(alice, journal + ':reference:same-public')), null);
});

test('valid legacy aggregate stays exact and explicitly incomplete; unknown journals fail closed after archiving', async () => {
  const state = setup(), raw = serializeManagedTrips([{ id: 'legacy-public', title: 'Legacy', city: 'Munich', status: 'published' }]);
  state.store.values.set(physical(alice, journal), raw); state.ticket = capture(state.store, alice, 'legacy-journal');
  assert.equal(state.ticket.publicRecoveryIncomplete, true);
  await recover(state.store, alice, state.ticket, plan(), locks(), () => true);
  assert.equal(state.store.getItem(physical(alice, journal)), raw);
  for (const [key, value] of [[journal, '{bad'], [journal + ':future:unknown', raw], [journal + ':reference:wrong-id', raw]]) {
    const broken = setup(); broken.store.values.set(physical(alice, key), value); broken.ticket = capture(broken.store, alice, 'unknown');
    assert.equal(broken.ticket.publicRecoveryIncomplete, true);
    await assert.rejects(recover(broken.store, alice, broken.ticket, plan(), locks(), () => true), /invalid|unsupported/);
    originalUnchanged(broken); verifiedArchive(broken); assert.equal(broken.store.getItem(physical(alice, key)), value);
  }
});

for (const [label, extra, raw] of [
  ['owner', { 'trippin.owner': 'owner' }, '{bad'],
  ['journal', { [journal]: serializeManagedTrips([]) }, '{bad'],
  ['unknown journal', { [journal + ':future:x']: 'bad' }, '{bad'],
  ['known public flag', {}, JSON.stringify({ trips: [{ id: 'public-old', title: 'Old', city: 'Munich', isPublic: true }] })],
  ['unidentified public flag', {}, JSON.stringify({ trips: [{ isPublic: true }] })],
]) test(`empty recovery cannot strand ${label}`, async () => {
  const state = setup(alice, raw);
  for (const [key, value] of Object.entries(extra)) state.store.values.set(physical(alice, key), value);
  state.ticket = capture(state.store, alice, 'empty-gate');
  await assert.rejects(recover(state.store, alice, state.ticket, initialWorkspace(), locks(), () => true), /at least one trip/);
  originalUnchanged(state); assert.equal(state.store.getItem(state.ticket.archiveKey), null);
});

test('empty recovery with no attributable public data remains possible and archived', async () => {
  const state = setup();
  const result = await recover(state.store, alice, state.ticket, initialWorkspace(), locks(), () => true);
  assert.deepEqual(result.workspace.trips, []); verifiedArchive(state);
});

for (const kind of ['account', 'file generation', 'source raw', 'target raw', 'owner', 'journal']) test(`queued ${kind} changes refuse stale recovery`, async () => {
  const state = setup(), lock = heldLock(); let current = true;
  const pending = recover(state.store, kind === 'account' ? bob : alice, state.ticket, plan(), lock, () => current);
  if (kind === 'file generation') current = false;
  if (kind === 'source raw' || kind === 'target raw') state.store.values.set(state.key, '{newer');
  if (kind === 'owner') state.store.values.set(physical(alice, 'trippin.owner'), 'new-owner');
  if (kind === 'journal') state.store.values.set(physical(alice, journal + ':attempt:new'), 'new-journal');
  lock.release();
  await assert.rejects(pending, /changed/);
  assert.equal(state.store.getItem(state.ticket.archiveKey), null);
  assert.equal(state.store.getItem(state.key), kind.endsWith('raw') ? '{newer' : state.raw);
});

test('legacy source changes and new guest v2 both invalidate a queued legacy ticket', async () => {
  for (const changedKey of [legacyKey, guestKey]) {
    const store = memory({ [legacyKey]: '{old' }), ticket = capture(store, null, 'legacy-stale'), lock = heldLock();
    const pending = recover(store, null, ticket, plan(), lock, () => true);
    store.values.set(changedKey, '{newer'); lock.release();
    await assert.rejects(pending, /changed/); assert.equal(store.getItem(ticket.archiveKey), null);
    assert.equal(store.getItem(changedKey), '{newer');
  }
});

for (const stage of ['archive', 'reference']) test(`changes during verified ${stage} writes preserve newer data and refuse target replacement`, async () => {
  const state = setup(), next = plan('new-public', stage === 'reference');
  state.store.afterWrite = key => {
    if (stage === 'archive' ? key === state.ticket.archiveKey : key.includes(':reference:')) state.store.values.set(state.key, '{newer');
  };
  await assert.rejects(recover(state.store, alice, state.ticket, next, locks(), () => true), /changed/);
  assert.equal(state.store.getItem(state.key), '{newer'); verifiedArchive(state);
  assert.equal(state.store.writes.some(item => item.key === state.key), false);
});

test('generation change after archive verification retains the archive without replacing source', async () => {
  const state = setup(); let current = true;
  state.store.afterWrite = key => { if (key === state.ticket.archiveKey) current = false; };
  await assert.rejects(recover(state.store, alice, state.ticket, plan(), locks(), () => current), /changed/);
  originalUnchanged(state); verifiedArchive(state);
});

for (const stage of ['archive', 'reference', 'target']) for (const mode of ['throw', 'silent']) test(`${mode} ${stage} write is never confirmed`, async () => {
  const state = setup(), next = plan('public-next', stage === 'reference');
  state.store.beforeWrite = key => {
    const matches = stage === 'archive' ? key === state.ticket.archiveKey : stage === 'target' ? key === state.key : key.includes(':reference:');
    if (!matches) return;
    if (mode === 'throw') throw new Error('Authored quota refusal');
    return false;
  };
  await assert.rejects(recover(state.store, alice, state.ticket, next, locks(), () => true), /quota|verified|confirmed/);
  originalUnchanged(state);
  if (stage !== 'archive') verifiedArchive(state);
  assert.equal(state.store.writes.filter(item => item.key === state.key).length, stage === 'target' ? 1 : 0);
});

test('same ticket can reuse its identical verified archive after target quota refusal', async () => {
  const state = setup(), next = plan();
  state.store.beforeWrite = key => { if (key === state.key) throw new Error('Quota'); };
  await assert.rejects(recover(state.store, alice, state.ticket, next, locks(), () => true), /Quota/);
  const originalArchive = verifiedArchive(state); state.store.beforeWrite = null;
  assert.deepEqual((await recover(state.store, alice, state.ticket, next, locks(), () => true)).workspace, next);
  assert.equal(state.store.getItem(state.ticket.archiveKey), originalArchive);
  assert.equal(state.store.writes.filter(item => item.key === state.ticket.archiveKey).length, 1);
});

test('archive collisions, malformed candidates and forged healthy-source tickets refuse without writes', async () => {
  const state = setup(); state.store.values.set(state.ticket.archiveKey, 'different archive');
  await assert.rejects(recover(state.store, alice, state.ticket, plan(), locks(), () => true), /different data/);
  originalUnchanged(state); assert.equal(state.store.getItem(state.ticket.archiveKey), 'different archive');
  const malformed = setup();
  await assert.rejects(recover(malformed.store, alice, malformed.ticket, { ...plan(), selectedTripId: 'missing' }, locks(), () => true), /invalid/);
  const healthyRaw = serializeWorkspace(plan()), forged = { ...malformed.ticket, sourceRaw: healthyRaw, targetRaw: healthyRaw };
  malformed.store.values.set(malformed.key, healthyRaw);
  await assert.rejects(recover(malformed.store, alice, forged, plan(), locks(), () => true), /changed/);
  assert.deepEqual(malformed.store.writes, []);
});

test('candidate snapshot cannot change while waiting for the recovery lock', async () => {
  const state = setup(), lock = heldLock(), next = plan(), expected = structuredClone(next);
  const pending = recover(state.store, alice, state.ticket, next, lock, () => true);
  next.trips[0].title = 'Mutated after confirm'; next.trips[0].isPublic = true; lock.release();
  assert.deepEqual((await pending).workspace, expected);
  assert.deepEqual(readAccountWorkspace(state.store, alice), expected);
  assert.deepEqual(readManagedStorage(accountManagedStorage(() => state.store, alice)).records, []);
});

test('caller ticket mutation while queued cannot retarget or rewrite captured recovery intent', async () => {
  const state = setup(), lock = heldLock(), originalTicket = structuredClone(state.ticket), next = plan();
  state.store.values.set(physical(alice, 'trippin.owner'), 'original-owner');
  state.ticket = capture(state.store, alice, 'immutable-ticket');
  const intended = structuredClone(state.ticket);
  const pending = recover(state.store, alice, state.ticket, next, lock, () => true);
  state.ticket.sourceRaw = '{mutated'; state.ticket.targetRaw = '{mutated'; state.ticket.archiveKey += '-mutated';
  state.ticket.capabilities[0].raw = 'mutated-owner'; state.ticket.capabilities.push({ key: 'trippin.owner.new', raw: 'new' });
  lock.release();
  assert.equal((await pending).archiveKey, intended.archiveKey);
  assert.equal(JSON.parse(state.store.getItem(intended.archiveKey)).raw, originalTicket.sourceRaw);
  assert.equal(state.store.getItem(intended.archiveKey + '-mutated'), null);
  assert.equal(state.store.getItem(physical(alice, 'trippin.owner')), 'original-owner');
});

test('mutating the caller account object while queued cannot redirect scoped public recovery', async () => {
  const account = { ...alice }, state = setup(account), lock = heldLock(), next = plan('new-public', true);
  const pending = recover(state.store, account, state.ticket, next, lock, () => true);
  account.id = bob.id; lock.release();
  await pending;
  assert.deepEqual(readManagedStorage(accountManagedStorage(() => state.store, alice)).records.map(item => item.id), ['new-public']);
  assert.deepEqual(readManagedStorage(accountManagedStorage(() => state.store, bob)).records, []);
  assert.equal(state.store.getItem(accountWorkspaceKey(bob)), null);
});

for (const change of ['archive', 'owner', 'journal', 'target', 'generation']) test(`late ${change} changes never become confirmed recovery`, async () => {
  const state = setup(); let current = true;
  state.store.afterWrite = key => {
    if (key !== state.key) return;
    if (change === 'archive') state.store.values.set(state.ticket.archiveKey, '{newer archive');
    if (change === 'owner') state.store.values.set(physical(alice, 'trippin.owner'), 'new owner');
    if (change === 'journal') state.store.values.set(physical(alice, journal + ':attempt:late'), 'new journal');
    if (change === 'target') state.store.values.set(state.key, '{newer target');
    if (change === 'generation') current = false;
  };
  await assert.rejects(recover(state.store, alice, state.ticket, plan(), locks(), () => current), /changed|confirmed/);
  assert.equal(state.store.writes.filter(item => item.key === state.key).length, 1);
  // Recovery never rolls a later write back over the observed bytes.
  assert.equal(state.store.getItem(state.key), change === 'target' ? '{newer target' : state.store.writes.at(-1).raw);
});

test('late legacy source mutation cannot acknowledge guest recovery or roll back newer bytes', async () => {
  const store = memory({ [legacyKey]: '{old' }), ticket = capture(store, null, 'late-legacy');
  store.afterWrite = key => { if (key === guestKey) store.values.set(legacyKey, '{newer legacy'); };
  await assert.rejects(recover(store, null, ticket, plan(), locks(), () => true), /changed/);
  assert.equal(store.getItem(legacyKey), '{newer legacy'); assert.equal(JSON.parse(store.getItem(ticket.archiveKey)).raw, '{old');
  assert.equal(store.writes.filter(item => item.key === guestKey).length, 1);
});

test('unavailable, rejected or timed-out locks cannot write, including a late callback', async context => {
  const state = setup();
  await assert.rejects(recover(state.store, alice, state.ticket, plan(), null, () => true), /coordinate/);
  await assert.rejects(recover(state.store, alice, state.ticket, plan(), { request() { return Promise.reject(new Error('Lock refused')); } }, () => true), /Lock refused/);
  const lock = heldLock(); context.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = recover(state.store, alice, state.ticket, plan(), lock, () => true);
  const rejected = assert.rejects(pending, /exclusive access in time/);
  context.mock.timers.tick(5_000); await rejected; lock.release(); await Promise.resolve();
  assert.deepEqual(state.store.writes, []); originalUnchanged(state);
});

test('new or unattributable Storage read failures refuse rather than treating unknown records as empty', async () => {
  const state = setup();
  state.store.beforeRead = key => { if (key === physical(alice, 'trippin.owner')) throw new Error('Storage denied'); };
  state.store.values.set(physical(alice, 'trippin.owner'), 'owner');
  assert.throws(() => capture(state.store, alice, 'denied'), /Storage denied/);
  state.store.beforeRead = key => { if (key === state.key) throw new Error('Storage denied'); };
  await assert.rejects(recover(state.store, alice, state.ticket, plan(), locks(), () => true), /Storage denied/);
  assert.deepEqual(state.store.writes, []);
});

test('exactly 40 invalid private source trips remain lossless and eligible for recovery', async () => {
  const raw = JSON.stringify({ trips: Array.from({ length: 40 }, (_, index) => ({ id: `private-${index}`, isPublic: false, days: 'invalid' })) });
  const state = setup(alice, raw);
  await recover(state.store, alice, state.ticket, plan(), locks(), () => true);
  assert.equal(JSON.parse(verifiedArchive(state)).raw, raw);
  assert.deepEqual(readManagedStorage(accountManagedStorage(() => state.store, alice)).records, []);
});

for (const kind of ['private', 'public', 'unidentified']) test(`41 ${kind} source trips refuse automatic recovery without truncation or writes`, async () => {
  const trips = Array.from({ length: 41 }, (_, index) => kind === 'unidentified' ? null :
    { id: `${kind}-${index}`, title: 'Authored trip', city: 'Munich', isPublic: kind === 'public' });
  const state = setup(), raw = JSON.stringify({ trips });
  state.store.values.set(state.key, raw);
  const ticket = { ...state.ticket, targetRaw: raw, sourceRaw: raw };
  assert.throws(() => capture(state.store, alice, 'over-trip-budget'), /40 source trips/);
  await assert.rejects(recover(state.store, alice, ticket, plan(), locks(), () => true), /40 source trips/);
  assert.equal(state.store.getItem(state.key), raw); assert.deepEqual(state.store.writes, []);
});

function addCapabilityEntries(state, count) {
  const raw = serializeManagedTrips([{ id: 'existing-public', title: 'Existing plan', city: 'Munich', status: 'uncertain' }]);
  state.store.values.set(physical(alice, 'trippin.owner'), 'owner-capability');
  for (let index = 1; index < count; index++) state.store.values.set(physical(alice, journal + ':attempt:entry-' + index), raw);
  return new Map(state.store.values);
}

test('exactly 256 scoped capabilities remain byte-exact and can recover with no additional references', async () => {
  const state = setup(), before = addCapabilityEntries(state, 256);
  state.ticket = capture(state.store, alice, 'capability-boundary');
  assert.equal(state.ticket.capabilities.length, 256);
  await recover(state.store, alice, state.ticket, plan(), locks(), () => true);
  for (const [key, raw] of before) if (key !== state.key) assert.equal(state.store.getItem(key), raw);
  assert.deepEqual(readManagedStorage(accountManagedStorage(() => state.store, alice)).records,
    [{ id: 'existing-public', title: 'Existing plan', city: 'Munich', status: 'uncertain' }]);
});

test('257 scoped capability entries refuse before any archive, reference or target write', async () => {
  const state = setup(), before = addCapabilityEntries(state, 257);
  const caps = [...state.store.values].filter(([key]) => key !== state.key).map(([key, raw]) => ({ key: key.slice(`trippin.account.${alice.id}.`.length), raw }));
  assert.throws(() => capture(state.store, alice, 'too-many-caps'), /256 public-plan access entries/);
  await assert.rejects(recover(state.store, alice, { ...state.ticket, capabilities: caps }, plan(), locks(), () => true), /256 public-plan access entries/);
  assert.deepEqual(state.store.values, before); assert.deepEqual(state.store.writes, []);
});

for (const initialCount of [255, 256]) test(`prospective public reference respects the total 256-entry bound from ${initialCount} entries`, async () => {
  const state = setup(), before = addCapabilityEntries(state, initialCount), next = plan('new-public', true);
  state.ticket = capture(state.store, alice, 'prospective-' + initialCount);
  if (initialCount === 256) {
    await assert.rejects(recover(state.store, alice, state.ticket, next, locks(), () => true), /256 public-plan access entries/);
    assert.deepEqual(state.store.values, before); assert.deepEqual(state.store.writes, []);
  } else {
    await recover(state.store, alice, state.ticket, next, locks(), () => true);
    for (const [key, raw] of before) if (key !== state.key) assert.equal(state.store.getItem(key), raw);
    assert.equal(state.store.getItem(physical(alice, journal + ':reference:new-public')) !== null, true);
    assert.equal(state.store.values.size - 2, 256); // Exclude target and its original-data archive.
  }
});

test('late overflow of scoped journals is detected before any recovery writes', async () => {
  const state = setup(), lock = heldLock(); addCapabilityEntries(state, 256);
  state.ticket = capture(state.store, alice, 'late-overflow');
  const pending = recover(state.store, alice, state.ticket, plan(), lock, () => true);
  state.store.values.set(physical(alice, journal + ':future:late-opaque'), 'preserve unknown journal bytes');
  const before = new Map(state.store.values); lock.release();
  await assert.rejects(pending, /256 public-plan access entries/);
  assert.deepEqual(state.store.values, before); assert.deepEqual(state.store.writes, []);
});

test('40 old public projections plus 40 backup trips preserve all 80 known public identities', async () => {
  const old = Array.from({ length: 40 }, (_, index) => ({ id: `old-${index}`, title: `Old ${index}`, city: 'Munich', isPublic: true, days: 'invalid' }));
  const state = setup(alice, JSON.stringify({ trips: old })), next = initialWorkspace('Authored traveler');
  next.trips = Array.from({ length: 40 }, (_, index) => plan(`new-${index}`, true).trips[0]); next.selectedTripId = 'new-0';
  await recover(state.store, alice, state.ticket, next, locks(), () => true);
  const records = readManagedStorage(accountManagedStorage(() => state.store, alice)).records;
  assert.deepEqual(new Set(records.map(record => record.id)), new Set([...old, ...next.trips].map(trip => trip.id)));
  assert.equal(records.length, 80); assert.equal(state.store.writes.filter(item => item.key.includes(':reference:')).length, 80);
  assert.deepEqual(readAccountWorkspace(state.store, alice), next); verifiedArchive(state);
});
