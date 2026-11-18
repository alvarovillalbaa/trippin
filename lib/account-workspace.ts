import { initialWorkspace, isWorkspace, serializeWorkspace } from './trip';
import { seedProfile } from './data';
import type { Trip, WorkspaceState } from './types';
import type { ManagedStorage } from './community-management-storage';
import { preserveManagedStorage, readManagedStorage } from './community-management-storage';
import { COMMUNITY_MANAGEMENT_KEY, parseManagedTrips } from './community-management';

export interface AccountUser { id: string; email: string; name: string }
export function accountWorkspaceKey(user: AccountUser | null) {
  if (!user) return 'trippin.workspace.v2.guest';
  if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(user.id)) throw new Error('The account identity could not be verified.');
  return `trippin.workspace.v2.user.${user.id.toLowerCase()}`;
}
export function readAccountWorkspace(storage: Pick<Storage, 'getItem'>, user: AccountUser | null): WorkspaceState {
  const key = accountWorkspaceKey(user), current = storage.getItem(key);
  // A legacy anonymous workspace is offered only in guest mode, never attached
  // to a signed-in account. The original key is preserved during migration.
  const legacy = !user && current === null ? storage.getItem('trippin.workspace.v1') : null;
  const raw = current ?? legacy;
  if (raw === null) return initialWorkspace(user?.name || '');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Saved trips could not be opened. Your original browser data has been kept.'); }
  if (!isWorkspace(parsed)) throw new Error('Saved trips need recovery before they can be opened. Your original browser data has been kept.');
  if (legacy !== null && JSON.stringify(parsed.profile) === JSON.stringify(seedProfile)) {
    return { ...parsed, profile: initialWorkspace().profile, trips: parsed.trips.map(trip => ({ ...trip,
      dailyFoodBudget: trip.dailyFoodBudget ?? parsed.profile.dailyFoodBudget,
      dailyTransportBudget: trip.dailyTransportBudget ?? parsed.profile.dailyTransportBudget,
    })) };
  }
  return parsed;
}
export function saveAccountWorkspace(storage: Pick<Storage, 'getItem' | 'setItem'>, user: AccountUser | null, state: WorkspaceState) {
  const key = accountWorkspaceKey(user), raw = serializeWorkspace(state, 0), previous = storage.getItem(key);
  if (previous !== null) {
    let valid = false;
    try { valid = isWorkspace(JSON.parse(previous)); } catch { /* Preserve malformed storage before any replacement. */ }
    if (!valid) throw new Error('Existing saved data needs recovery. Export it before replacing this workspace.');
  }
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new Error('Your browser did not confirm the save. Keep this page open and export a backup.');
}

/** Workspace data and public-plan capabilities must use the same account scope. */
export function accountManagedStorage(getStorage: () => Storage, user: AccountUser | null): ManagedStorage {
  const workspaceKey = accountWorkspaceKey(user);
  const prefix = user ? `trippin.account.${user.id.toLowerCase()}.` : '';
  const keys = () => {
    const storage = getStorage(), result: string[] = [];
    for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key?.startsWith(prefix)) result.push(key.slice(prefix.length)); }
    return result;
  };
  const physical = (key: string) => key === workspaceKey ? key : prefix + key;
  return { get length() { return keys().length; }, key: index => keys()[index] ?? null,
    getItem: key => getStorage().getItem(physical(key)), setItem: (key, value) => getStorage().setItem(physical(key), value),
    removeItem: key => getStorage().removeItem(physical(key)) };
}

export function restoreAccountWorkspace(storage: Storage, user: AccountUser | null, next: WorkspaceState) {
  const current = readAccountWorkspace(storage, user);
  const managed = preserveManagedStorage(accountManagedStorage(() => storage, user), [...current.trips, ...next.trips]);
  if (!next.trips.length && managed.length) throw new Error('Review public plans in your profile before restoring an empty travel space. Your current trips are unchanged.');
  saveAccountWorkspace(storage, user, next);
}

type RecoveryEntry = { key: string; raw: string };
type RecoveryPublicTrip = Pick<Trip, 'id' | 'title' | 'city' | 'isPublic'>;
export interface AccountWorkspaceRecoveryTicket {
  readonly version: 1;
  readonly recoveryId: string;
  readonly targetKey: string;
  readonly targetRaw: string | null;
  readonly sourceKey: string;
  readonly sourceRaw: string;
  readonly archiveKey: string;
  readonly capabilities: readonly RecoveryEntry[];
  readonly publicRecoveryIncomplete: boolean;
}
const recoveryIdPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const recoveryArchiveLimit = 16 * 1024 * 1024;
const recoveryTripLimit = 40;
const recoveryCapabilityLimit = 256;
const recoveryWaitMs = 5_000;
const changedRecovery = () => new Error('Saved data or this recovery choice changed. Choose the backup again before replacing it.');
const capabilityBudget = () => new Error('Automatic recovery supports up to 256 public-plan access entries. Download your original data for manual recovery; existing entries have been kept.');

function storageEntries(storage: Pick<Storage, 'getItem' | 'length' | 'key'>, accepts: (key: string) => boolean, maximum = 10_000): RecoveryEntry[] {
  const keys = new Set<string>();
  const count = storage.length;
  if (!Number.isInteger(count) || count < 0 || count > 10_000) throw new Error('Browser recovery entries could not be read safely. Existing data has been kept.');
  for (let index = 0; index < count; index++) {
    const key = storage.key(index);
    if (key !== null && accepts(key)) keys.add(key);
    if (keys.size > maximum) throw capabilityBudget();
  }
  return [...keys].sort().map(key => {
    const raw = storage.getItem(key);
    if (raw === null) throw changedRecovery();
    return { key, raw };
  });
}
function recoveryCapabilities(storage: Storage, user: AccountUser | null): RecoveryEntry[] {
  const prefix = user ? `trippin.account.${user.id.toLowerCase()}.` : '';
  return storageEntries(storage, physical => {
    if (!physical.startsWith(prefix)) return false;
    const key = physical.slice(prefix.length);
    return key === 'trippin.owner' || key === COMMUNITY_MANAGEMENT_KEY || key.startsWith(COMMUNITY_MANAGEMENT_KEY + ':');
  }, recoveryCapabilityLimit).map(entry => ({ ...entry, key: entry.key.slice(prefix.length) }));
}
function recoveryManagedView(storage: Storage, user: AccountUser | null, expected: ReadonlyMap<string, string>): ManagedStorage {
  const scoped = accountManagedStorage(() => storage, user);
  return { get length() { return expected.size; }, key: index => [...expected.keys()][index] ?? null,
    getItem: key => scoped.getItem(key), setItem: (key, raw) => scoped.setItem(key, raw), removeItem: key => scoped.removeItem(key) };
}
function publicRecovery(raw: string): { trips: RecoveryPublicTrip[]; incomplete: boolean; hasPublicFlags: boolean } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { trips: [], incomplete: true, hasPublicFlags: false }; }
  if (!value || typeof value !== 'object' || !Array.isArray((value as { trips?: unknown }).trips)) {
    return { trips: [], incomplete: true, hasPublicFlags: false };
  }
  if ((value as { trips: unknown[] }).trips.length > recoveryTripLimit) throw new Error('Automatic recovery supports up to 40 source trips. Download your original data for manual recovery; no trips have been removed.');
  const trips: RecoveryPublicTrip[] = [], seen = new Set<string>();
  let incomplete = false, hasPublicFlags = false;
  for (const item of (value as { trips: unknown[] }).trips) {
    if (!item || typeof item !== 'object') { incomplete = true; continue; }
    const trip = item as Record<string, unknown>;
    if (trip.isPublic === false) continue;
    if (trip.isPublic !== true) { incomplete = true; continue; }
    hasPublicFlags = true;
    if (typeof trip.id !== 'string' || !recoveryIdPattern.test(trip.id)
      || typeof trip.title !== 'string' || !trip.title.trim() || trip.title.length > 200
      || typeof trip.city !== 'string' || !trip.city.trim() || trip.city.length > 200 || seen.has(trip.id)) {
      incomplete = true; continue;
    }
    seen.add(trip.id); trips.push({ id: trip.id, title: trip.title, city: trip.city, isPublic: true });
  }
  return { trips, incomplete, hasPublicFlags };
}
function validWorkspaceRaw(raw: string) {
  try { return isWorkspace(JSON.parse(raw)); } catch { return false; }
}

/** Capture only the selected corrupt namespace; this function never writes. */
export function captureAccountWorkspaceRecovery(storage: Storage, user: AccountUser | null, recoveryId: string): AccountWorkspaceRecoveryTicket | null {
  if (typeof recoveryId !== 'string' || !recoveryIdPattern.test(recoveryId)) throw new Error('A fresh recovery identifier is required.');
  const targetKey = accountWorkspaceKey(user), targetRaw = storage.getItem(targetKey);
  const sourceKey = targetRaw === null && !user ? 'trippin.workspace.v1' : targetKey;
  const sourceRaw = sourceKey === targetKey ? targetRaw : storage.getItem(sourceKey);
  if (sourceRaw === null) return null;
  if (typeof sourceRaw !== 'string' || targetRaw !== null && typeof targetRaw !== 'string') throw changedRecovery();
  if (validWorkspaceRaw(sourceRaw)) return null;
  const capabilities = recoveryCapabilities(storage, user), salvage = publicRecovery(sourceRaw);
  let publicRecoveryIncomplete = salvage.incomplete;
  try {
    readManagedStorage(recoveryManagedView(storage, user, new Map(capabilities.map(entry => [entry.key, entry.raw]))));
    const legacy = capabilities.find(entry => entry.key === COMMUNITY_MANAGEMENT_KEY);
    if (legacy && parseManagedTrips(legacy.raw).length) publicRecoveryIncomplete = true;
  } catch { publicRecoveryIncomplete = true; }
  if (storage.getItem(targetKey) !== targetRaw || storage.getItem(sourceKey) !== sourceRaw
    || JSON.stringify(recoveryCapabilities(storage, user)) !== JSON.stringify(capabilities)) throw changedRecovery();
  return { version: 1, recoveryId, targetKey, targetRaw, sourceKey, sourceRaw,
    archiveKey: targetKey + '.recovery.' + recoveryId, capabilities, publicRecoveryIncomplete };
}

/** Opaque archives stay downloadable in their exact account/guest namespace. */
export function accountWorkspaceRecoveryArchives(storage: Pick<Storage, 'getItem' | 'length' | 'key'>, user: AccountUser | null): RecoveryEntry[] {
  const prefix = accountWorkspaceKey(user) + '.recovery.';
  return storageEntries(storage, key => key.startsWith(prefix));
}

/** Explicit confirmation only: archive first, then restore under a namespace lock. */
export async function recoverAccountWorkspace(storage: Storage, user: AccountUser | null, ticket: AccountWorkspaceRecoveryTicket,
  next: WorkspaceState, locks: Pick<LockManager, 'request'> | null | undefined, isCurrent: () => boolean): Promise<{ workspace: WorkspaceState; archiveKey: string }> {
  const candidate = serializeWorkspace(next, 0), workspace = JSON.parse(candidate) as WorkspaceState, targetKey = accountWorkspaceKey(user);
  user = user ? { ...user } : null;
  if (!locks?.request) throw new Error('This browser cannot safely coordinate recovery. Keep your original data and try an up-to-date browser.');
  if (!ticket || ticket.version !== 1 || typeof ticket.recoveryId !== 'string' || !recoveryIdPattern.test(ticket.recoveryId) || ticket.targetKey !== targetKey
    || ticket.archiveKey !== targetKey + '.recovery.' + ticket.recoveryId
    || !(ticket.sourceKey === targetKey && ticket.targetRaw === ticket.sourceRaw
      || !user && ticket.sourceKey === 'trippin.workspace.v1' && ticket.targetRaw === null)
    || typeof ticket.sourceRaw !== 'string' || validWorkspaceRaw(ticket.sourceRaw) || !Array.isArray(ticket.capabilities)) throw changedRecovery();
  if (ticket.capabilities.length > recoveryCapabilityLimit) throw capabilityBudget();
  if (ticket.capabilities.some(entry => !entry || typeof entry.key !== 'string' || typeof entry.raw !== 'string')) throw changedRecovery();
  ticket = { version: 1, recoveryId: ticket.recoveryId, targetKey: ticket.targetKey, targetRaw: ticket.targetRaw,
    sourceKey: ticket.sourceKey, sourceRaw: ticket.sourceRaw, archiveKey: ticket.archiveKey,
    publicRecoveryIncomplete: ticket.publicRecoveryIncomplete, capabilities: ticket.capabilities.map(entry => ({ key: entry.key, raw: entry.raw })) };
  const expected = new Map(ticket.capabilities.map(entry => [entry.key, entry.raw]));
  if (expected.size !== ticket.capabilities.length) throw changedRecovery();
  const capabilitiesUnchanged = () => JSON.stringify(recoveryCapabilities(storage, user)) === JSON.stringify([...expected]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, raw]) => ({ key, raw })));
  const unchanged = () => {
    if (!isCurrent() || storage.getItem(targetKey) !== ticket.targetRaw || storage.getItem(ticket.sourceKey) !== ticket.sourceRaw
      || !capabilitiesUnchanged() || !isCurrent()) throw changedRecovery();
  };
  const controller = new AbortController();
  let expired = false, timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; controller.abort(); reject(new Error('Recovery could not get exclusive access in time. Your current data has been kept.')); }, recoveryWaitMs);
  });
  try {
    return await Promise.race([locks.request('trippin.workspace.recovery:' + targetKey, { mode: 'exclusive', signal: controller.signal }, () => {
      if (expired) throw changedRecovery();
      unchanged();
      const salvage = publicRecovery(ticket.sourceRaw);
      if (!workspace.trips.length && (ticket.capabilities.length || salvage.hasPublicFlags)) throw new Error('Restore a backup with at least one trip while public-plan access or public recovery records remain.');
      const scoped = recoveryManagedView(storage, user, expected);
      const publicTrips = [...salvage.trips, ...workspace.trips];
      const known = new Set(publicTrips.filter(trip => trip.isPublic).map(trip => trip.id));
      const legacyJournal = expected.get(COMMUNITY_MANAGEMENT_KEY);
      let existing = new Set<string>();
      try { existing = new Set(readManagedStorage({ ...scoped, getItem: key => expected.get(key) ?? null }).records.map(record => record.id)); }
      catch { /* Invalid captured journals still fail closed after archival. */ }
      if (expected.size + [...known].filter(id => !existing.has(id)).length > recoveryCapabilityLimit) throw capabilityBudget();
      const archive = JSON.stringify({ version: 1, kind: 'trippin-workspace-recovery', recoveryId: ticket.recoveryId,
        sourceKey: ticket.sourceKey, targetKey, raw: ticket.sourceRaw });
      if (archive.length > recoveryArchiveLimit) throw new Error('The original data is too large to archive safely in this browser. Download it for recovery before making room.');
      const priorArchive = storage.getItem(ticket.archiveKey);
      if (priorArchive !== null && priorArchive !== archive) throw new Error('That recovery archive already contains different data. Choose the backup again to create a fresh archive.');
      if (priorArchive === null) storage.setItem(ticket.archiveKey, archive);
      if (storage.getItem(ticket.archiveKey) !== archive) throw new Error('The recovery archive could not be verified. Your original saved data has not been replaced.');
      unchanged();
      if (legacyJournal !== undefined) parseManagedTrips(legacyJournal);
      const guarded: ManagedStorage = { get length() { return scoped.length; }, key: index => scoped.key(index), getItem: key => scoped.getItem(key),
        setItem(key, raw) {
          unchanged();
          if (!key.startsWith(COMMUNITY_MANAGEMENT_KEY + ':reference:') || !known.has(key.slice((COMMUNITY_MANAGEMENT_KEY + ':reference:').length))
            || expected.has(key)) throw changedRecovery();
          scoped.setItem(key, raw);
          if (scoped.getItem(key) !== raw) throw new Error('Public-plan recovery could not be verified. Your saved workspace has not been replaced.');
          expected.set(key, raw);
        }, removeItem() { throw changedRecovery(); } };
      const records = preserveManagedStorage(guarded, publicTrips);
      if ([...known].some(id => !records.some(record => record.id === id))) throw new Error('Public-plan access could not be preserved. Your saved workspace has not been replaced.');
      unchanged();
      if (expired || storage.getItem(ticket.archiveKey) !== archive || !isCurrent()) throw changedRecovery();
      storage.setItem(targetKey, candidate);
      if (storage.getItem(targetKey) !== candidate) throw new Error('The restored workspace could not be confirmed. Your original data remains in its recovery archive.');
      if (storage.getItem(ticket.archiveKey) !== archive
        || ticket.sourceKey !== targetKey && storage.getItem(ticket.sourceKey) !== ticket.sourceRaw
        || !capabilitiesUnchanged() || storage.getItem(targetKey) !== candidate || !isCurrent()) throw changedRecovery();
      return { workspace: JSON.parse(candidate) as WorkspaceState, archiveKey: ticket.archiveKey };
    }), timeout]);
  } finally { clearTimeout(timer); }
}
