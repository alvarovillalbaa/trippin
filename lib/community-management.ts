import type { Trip } from './types';

export const COMMUNITY_MANAGEMENT_KEY = 'trippin.community-management.v1';
export const MAX_MANAGED_TRIPS = 40;
const maxJournalCharacters = 50_000;
const sourceId = /^[a-zA-Z0-9_-]{1,80}$/;

export interface ManagedTrip {
  id: string;
  title: string;
  city: string;
  status: 'published' | 'uncertain';
}

const invalid = () => new Error('Public-trip management data is invalid or unsupported. Existing saved data is unchanged.');
const capacity = () => new Error('Keep up to 40 managed public trips in this browser. Existing management records are unchanged.');
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = (value: unknown): value is string => typeof value === 'string' && value.length <= 200 && Boolean(value.trim());

function projectManagedTrip(value: unknown, exact: boolean): ManagedTrip {
  if (!object(value) || typeof value.id !== 'string' || !sourceId.test(value.id)
    || !label(value.title) || !label(value.city) || (value.status !== 'published' && value.status !== 'uncertain')) throw invalid();
  if (exact && (Object.keys(value).length !== 4 || Object.keys(value).some(key => !['id', 'title', 'city', 'status'].includes(key)))) throw invalid();
  return { id: value.id, title: value.title, city: value.city, status: value.status };
}

function normalized(records: unknown, exact = false): ManagedTrip[] {
  if (!Array.isArray(records)) throw invalid();
  if (records.length > MAX_MANAGED_TRIPS) throw capacity();
  const ids = new Set<string>();
  return Array.from(records, value => {
    const record = projectManagedTrip(value, exact);
    if (ids.has(record.id)) throw invalid();
    ids.add(record.id);
    return record;
  });
}

/** A bad or newer journal must remain available for recovery, never become []. */
export function parseManagedTrips(raw: string | null): ManagedTrip[] {
  if (raw === null) return [];
  if (typeof raw !== 'string' || raw.length > maxJournalCharacters) throw invalid();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw invalid(); }
  if (!object(value) || !Object.hasOwn(value, 'version') || value.version !== 1 || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'trips')) throw invalid();
  return normalized(value.trips, true);
}

/** Only management labels and uncertainty enter this independent device journal. */
export function serializeManagedTrips(records: readonly ManagedTrip[]): string {
  const raw = JSON.stringify({ version: 1, trips: normalized(records) });
  if (raw.length > maxJournalCharacters) throw new Error('Public-trip management data exceeds the 50,000-character limit. Existing saved data is unchanged.');
  return raw;
}

export function rememberManagedTrip(records: readonly ManagedTrip[], trip: Pick<Trip, 'id' | 'title' | 'city'>, status: ManagedTrip['status']): ManagedTrip[] {
  const next = normalized(records), entry = projectManagedTrip({ id: trip.id, title: trip.title, city: trip.city, status }, false);
  const index = next.findIndex(record => record.id === entry.id);
  if (index >= 0) next[index] = entry;
  else {
    if (next.length >= MAX_MANAGED_TRIPS) throw capacity();
    next.push(entry);
  }
  return next;
}
