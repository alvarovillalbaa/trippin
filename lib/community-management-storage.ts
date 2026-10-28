import type { Trip } from './types';
import { COMMUNITY_MANAGEMENT_KEY, MAX_MANAGED_TRIPS, parseManagedTrips, serializeManagedTrips,
  rememberManagedTrip, type ManagedTrip } from './community-management';

export interface ManagedStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ManagedStorageEntry { key: string; raw: string; record: ManagedTrip }
export interface ManagedSnapshot { records: ManagedTrip[]; entries: ManagedStorageEntry[] }
export interface ManagedPublicationReservation { key: string; id: string; records: ManagedTrip[] }
export interface CapturedManagedEntry { key: string; raw: string }

const prefix = COMMUNITY_MANAGEMENT_KEY + ':';
const referencePrefix = prefix + 'reference:';
const attemptPrefix = prefix + 'attempt:';
const validId = (id: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const invalid = () => new Error('Public-plan management entries are invalid or unsupported. Existing browser data is unchanged.');

function entryKind(key: string): { kind: 'reference' | 'attempt'; suffix: string } {
  const kind = key.startsWith(referencePrefix) ? 'reference' : key.startsWith(attemptPrefix) ? 'attempt' : null;
  const suffix = kind === 'reference' ? key.slice(referencePrefix.length) : kind === 'attempt' ? key.slice(attemptPrefix.length) : '';
  if (!kind || !validId(suffix)) throw invalid();
  return { kind, suffix };
}

function parseEntry(key: string, raw: string): ManagedStorageEntry {
  const { kind, suffix } = entryKind(key), records = parseManagedTrips(raw);
  if (records.length !== 1 || (kind === 'reference' && records[0].id !== suffix)) throw invalid();
  return { key, raw, record: records[0] };
}

function single(trip: Pick<Trip, 'id' | 'title' | 'city'>, status: ManagedTrip['status']): ManagedTrip {
  return rememberManagedTrip([], trip, status)[0];
}

/** Reads may observe concurrent changes; no aggregate snapshot is ever written back. */
export function readManagedStorage(storage: ManagedStorage): ManagedSnapshot {
  const keys = new Set<string>();
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.add(key);
  }
  const entries: ManagedStorageEntry[] = [];
  for (const key of [...keys].sort()) {
    const raw = storage.getItem(key);
    if (raw !== null) entries.push(parseEntry(key, raw));
  }
  const grouped = new Map<string, ManagedTrip>();
  for (const { record } of entries) {
    const prior = grouped.get(record.id);
    if (!prior) grouped.set(record.id, { ...record });
    else if (record.status === 'uncertain') grouped.set(record.id, { ...prior, status: 'uncertain' });
  }
  const records = [...grouped.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { records, entries };
}

/** Legacy flags are references, not fresh server acknowledgments or publish attempts. */
export function preserveManagedStorage(storage: ManagedStorage, trips: readonly Trip[]): ManagedTrip[] {
  const existing = new Set(readManagedStorage(storage).records.map(record => record.id));
  for (const trip of trips) {
    if (!trip.isPublic || existing.has(trip.id)) continue;
    const record = single(trip, 'published'), key = referencePrefix + record.id;
    const raw = storage.getItem(key);
    if (raw === null) storage.setItem(key, serializeManagedTrips([record]));
    else parseEntry(key, raw);
    existing.add(record.id);
  }
  return readManagedStorage(storage).records;
}

/** Callers provide a fresh operation ID for every attempt, including retries. */
export function reserveManagedPublication(storage: ManagedStorage, trip: Pick<Trip, 'id' | 'title' | 'city'>, operationId: string): ManagedPublicationReservation {
  if (typeof operationId !== 'string' || !validId(operationId)) throw invalid();
  const record = single(trip, 'uncertain'), key = attemptPrefix + operationId;
  if (storage.getItem(key) !== null) throw new Error('This publication attempt already has a management entry. Use a new attempt identifier.');
  const { records } = readManagedStorage(storage);
  if (!records.some(item => item.id === record.id) && records.length >= MAX_MANAGED_TRIPS) {
    throw new Error('Keep up to 40 distinct managed public trips in this browser. Existing management entries are unchanged.');
  }
  storage.setItem(key, serializeManagedTrips([record]));
  return { key, id: record.id, records: readManagedStorage(storage).records };
}

/** Only this attempt's acknowledgment changes; another attempt can remain unknown. */
export function confirmManagedPublicationStorage(storage: ManagedStorage, reservation: Pick<ManagedPublicationReservation, 'key' | 'id'>): ManagedTrip[] {
  if (entryKind(reservation.key).kind !== 'attempt' || !validId(reservation.id)) throw invalid();
  const raw = storage.getItem(reservation.key);
  if (raw !== null) {
    const { record } = parseEntry(reservation.key, raw);
    if (record.id !== reservation.id) throw invalid();
    if (record.status !== 'published') storage.setItem(reservation.key, serializeManagedTrips([{ ...record, status: 'published' }]));
  }
  return readManagedStorage(storage).records;
}

/** Capture before sending DELETE; later keys are outside that acknowledgment. */
export function snapshotManagedUnpublish(storage: ManagedStorage, id: string): CapturedManagedEntry[] {
  if (!validId(id)) throw invalid();
  return readManagedStorage(storage).entries
    .filter(entry => entry.record.id === id && entry.record.status === 'published')
    .map(({ key, raw }) => ({ key, raw }));
}

/** Remove only captured published bytes; uncertain or newly created keys survive. */
export function confirmManagedUnpublishStorage(storage: ManagedStorage, id: string, captured: readonly CapturedManagedEntry[]): ManagedTrip[] {
  if (!validId(id)) throw invalid();
  for (const entry of captured) {
    const { record } = parseEntry(entry.key, entry.raw);
    if (record.id === id && record.status === 'published' && storage.getItem(entry.key) === entry.raw) storage.removeItem(entry.key);
  }
  return readManagedStorage(storage).records;
}
