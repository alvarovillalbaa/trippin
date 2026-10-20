import { createHash, randomUUID } from 'node:crypto';
import { isTrip } from '@/lib/trip';
import type { Trip } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const ttl = 60 * 60 * 24 * 90;
const maxBodyBytes = 200_000;
const directoryKey = 'trippin:directory';
const tripKey = (id: string) => `trippin:trip:${id}`;
const requestsKey = (id: string) => `trippin:requests:${id}`;
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const configured = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type RecordData = { trip: Trip; ownerHash: string; host: string };
type RequestData = { id: string; name: string; message: string; contact: string; status: 'pending' | 'accepted' | 'declined'; createdAt: string };

class InputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

async function redis<T>(command: (string | number)[]): Promise<T> {
  const url = new URL(process.env.UPSTASH_REDIS_REST_URL!);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid storage configuration');
  const response = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Storage unavailable');
  const data: unknown = await response.json();
  if (!object(data) || 'error' in data || !('result' in data)) throw new Error('Storage command failed');
  return data.result as T;
}

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
}
function fail(error: unknown) {
  return error instanceof InputError ? reply({ error: error.message }, error.status)
    : reply({ error: 'The community service is temporarily unavailable. Please try again.' }, 503);
}
function ownerHash(request: Request) {
  const key = request.headers.get('x-trip-owner') || '';
  return /^[a-zA-Z0-9_-]{40,160}$/.test(key) ? hash(key) : null;
}
function sameOrigin(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

async function limited(request: Request, read = false) {
  // Vercel overwrites this client-IP header. Other hosts share a conservative
  // bucket until their trusted proxy is configured, rather than trusting input.
  const ip = process.env.VERCEL ? request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown' : 'self-hosted';
  const identity = hash(ip.split(',')[0].trim()).slice(0, 24);
  const key = `trippin:rate:${read ? 'read' : 'write'}:${identity}:${Math.floor(Date.now() / 60_000)}`;
  const count = await redis<number>(['EVAL', `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end; return n`, 1, key]);
  return count > (read ? 60 : 15);
}

async function body(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new InputError('Send a JSON request.', 415);
  }
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) throw new InputError('Keep this request below 200 KB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('Include valid JSON details.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let raw = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBodyBytes) { await reader.cancel().catch(() => {}); throw new InputError('Keep this request below 200 KB.', 413); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    const value: unknown = JSON.parse(raw);
    if (!object(value)) throw new InputError('Include a JSON object with your details.');
    return value;
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError('Include valid JSON details.');
  } finally { reader.releaseLock(); }
}

// A field allowlist also removes unknown properties from imported backups.
// Free-text itinerary fields remain public and need the host's review.
function publicTrip(trip: Trip): Trip {
  return {
    id: trip.id, title: trip.title, city: trip.city, country: trip.country, countryCode:trip.countryCode,
    startDate: trip.startDate, endDate: trip.endDate, lat: trip.lat, lng: trip.lng,
    image: trip.image, description: trip.description, budget: trip.budget, currency: trip.currency,
    isPublic: true, expenses: [], bookings: [], companions: [], joinRequests: [],
    days: trip.days.map(day => ({
      id: day.id, date: day.date, label: day.label,
      activities: day.activities.map(activity => ({
        id: activity.id, title: activity.title, category: activity.category,
        description: activity.description, time: activity.time, duration: activity.duration,
        cost: activity.cost, lat: activity.lat, lng: activity.lng, location: activity.location,
        image: activity.image, status: activity.status, alternativeFor: activity.alternativeFor, source: activity.source,
        event:activity.event?{provider:activity.event.provider,id:activity.event.id,scheduledDate:activity.event.scheduledDate}:undefined,
      })),
    })),
  };
}
function parseRecord(raw: string): RecordData {
  const value: unknown = JSON.parse(raw);
  if (!object(value) || !isTrip(value.trip) || typeof value.ownerHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.ownerHash)
    || typeof value.host !== 'string' || value.host.length > 80) throw new Error('Invalid stored trip');
  return { trip: publicTrip(value.trip), ownerHash: value.ownerHash, host: value.host };
}
function parseRequest(raw: string): RequestData {
  const value: unknown = JSON.parse(raw);
  if (!object(value) || !validId(value.id) || typeof value.name !== 'string' || value.name.length > 80
    || typeof value.message !== 'string' || value.message.length > 600 || typeof value.contact !== 'string' || value.contact.length > 160
    || !['pending', 'accepted', 'declined'].includes(String(value.status)) || typeof value.createdAt !== 'string'
    || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('Invalid stored request');
  return { id: value.id, name: value.name, message: value.message, contact: value.contact,
    status: value.status as RequestData['status'], createdAt: value.createdAt };
}

// Owner authorization and the corresponding reads/writes execute together.
// Redis receives only a SHA-256 capability digest, never the raw capability.
const publishScript = `
local existing=redis.call('GET',KEYS[1])
if existing then
  if cjson.decode(existing).ownerHash~=ARGV[1] then return 403 end
else
  redis.call('DEL',KEYS[3])
end
redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3])
redis.call('ZADD',KEYS[2],ARGV[4],ARGV[5])
redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',ARGV[6])
return 201`;
const readRequestsScript = `
local raw=redis.call('GET',KEYS[1])
if not raw then return {404} end
if cjson.decode(raw).ownerHash~=ARGV[1] then return {403} end
local result={200,raw}
for _,entry in ipairs(redis.call('HVALS',KEYS[2])) do table.insert(result,entry) end
return result`;
const joinScript = `
if redis.call('EXISTS',KEYS[1])==0 then return 404 end
local remaining=redis.call('TTL',KEYS[1])
if remaining<1 then return 404 end
if redis.call('HLEN',KEYS[2])>=100 then return 409 end
redis.call('HSET',KEYS[2],ARGV[1],ARGV[2])
local requestTtl=redis.call('TTL',KEYS[2])
if requestTtl<0 or requestTtl>remaining then redis.call('EXPIRE',KEYS[2],remaining) end
return 201`;
const decisionScript = `
local raw=redis.call('GET',KEYS[1])
if not raw then return 404 end
if cjson.decode(raw).ownerHash~=ARGV[1] then return 403 end
local entry=redis.call('HGET',KEYS[2],ARGV[2])
if not entry then return 404 end
local value=cjson.decode(entry)
value.status=ARGV[3]
redis.call('HSET',KEYS[2],ARGV[2],cjson.encode(value))
return 200`;
const deleteScript = `
local raw=redis.call('GET',KEYS[1])
if not raw then return 200 end
if cjson.decode(raw).ownerHash~=ARGV[1] then return 403 end
redis.call('DEL',KEYS[1],KEYS[2])
redis.call('ZREM',KEYS[3],ARGV[2])
return 200`;

export async function GET(request: Request) {
  if (!configured()) return reply({ available: false, trips: [] });
  const id = new URL(request.url).searchParams.get('id');
  if (id !== null && !validId(id)) return reply({ error: 'Invalid trip.' }, 400);
  try {
    if (await limited(request, true)) return reply({ error: 'A few too many requests. Try again in a minute.' }, 429);
    if (id) {
      if (request.headers.has('x-trip-owner')) {
        const owner = ownerHash(request);
        if (!owner) return reply({ error: 'Only the publishing browser can review requests.' }, 403);
        const result = await redis<(number | string)[]>(['EVAL', readRequestsScript, 2, tripKey(id), requestsKey(id), owner]);
        if (result[0] === 403) return reply({ error: 'Only the publishing browser can review requests.' }, 403);
        if (result[0] === 404) return reply({ error: 'This trip is no longer public.' }, 404);
        const record = parseRecord(String(result[1]));
        const requests = result.slice(2).map(value => parseRequest(String(value))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return reply({ available: true, trip: record.trip, host: record.host, requests });
      }
      const raw = await redis<string | null>(['GET', tripKey(id)]);
      if (!raw) return reply({ error: 'This trip is no longer public.' }, 404);
      const record = parseRecord(raw);
      return reply({ available: true, trip: record.trip, host: record.host });
    }
    await redis(['ZREMRANGEBYSCORE', directoryKey, '-inf', Date.now() - ttl * 1000]);
    const ids = await redis<string[]>(['ZREVRANGE', directoryKey, 0, 19]);
    const safeIds = ids.filter(validId);
    const records = safeIds.length ? await redis<(string | null)[]>(['MGET', ...safeIds.map(tripKey)]) : [];
    return reply({ available: true, trips: records.filter((raw): raw is string => raw !== null).map(raw => parseRecord(raw).trip) });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  if (!configured()) return reply({ error: 'Public trips need the shared community service to be connected.' }, 503);
  if (!sameOrigin(request)) return reply({ error: 'Use Trippin to publish your trip.' }, 403);
  try {
    if (await limited(request)) return reply({ error: 'A few too many requests. Try again in a minute.' }, 429);
    const value = await body(request);
    const owner = ownerHash(request);
    if (!isTrip(value.trip) || !validId(value.trip.id) || !owner || typeof value.host !== 'string' || !value.host.trim() || value.host.length > 80) {
      return reply({ error: 'Check your trip and profile details.' }, 400);
    }
    const id = value.trip.id;
    const record: RecordData = { trip: publicTrip(value.trip), ownerHash: owner, host: value.host.trim() };
    const now = Date.now();
    const status = await redis<number>(['EVAL', publishScript, 3, tripKey(id), directoryKey, requestsKey(id), owner, JSON.stringify(record), ttl, now, id, now - ttl * 1000]);
    if (status === 403) return reply({ error: 'This trip belongs to another publishing browser.' }, 403);
    return reply({ published: true, id }, 201);
  } catch (error) { return fail(error); }
}

export async function PATCH(request: Request) {
  if (!configured()) return reply({ error: 'Join requests need the shared community service to be connected.' }, 503);
  if (!sameOrigin(request)) return reply({ error: 'Use Trippin to send a request.' }, 403);
  try {
    if (await limited(request)) return reply({ error: 'A few too many requests. Try again in a minute.' }, 429);
    const value = await body(request);
    if (!validId(value.tripId)) return reply({ error: 'Invalid trip.' }, 400);
    const id = value.tripId;
    if (value.action !== undefined) {
      const owner = ownerHash(request);
      if (!owner) return reply({ error: 'Only the host can review requests.' }, 403);
      if (!validId(value.requestId) || (value.action !== 'accepted' && value.action !== 'declined')) return reply({ error: 'Invalid request decision.' }, 400);
      const status = await redis<number>(['EVAL', decisionScript, 2, tripKey(id), requestsKey(id), owner, value.requestId, value.action]);
      if (status === 403) return reply({ error: 'Only the host can review requests.' }, 403);
      if (status === 404) return reply({ error: 'Trip or request not found.' }, 404);
      return reply({ updated: true });
    }
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80
      || typeof value.message !== 'string' || !value.message.trim() || value.message.length > 600
      || typeof value.contact !== 'string' || !value.contact.trim() || value.contact.length > 160) {
      return reply({ error: 'Add your name, a short introduction, and contact for the host.' }, 400);
    }
    const entry: RequestData = { id: randomUUID(), name: value.name.trim(), message: value.message.trim(), contact: value.contact.trim(), status: 'pending', createdAt: new Date().toISOString() };
    const status = await redis<number>(['EVAL', joinScript, 2, tripKey(id), requestsKey(id), entry.id, JSON.stringify(entry)]);
    if (status === 404) return reply({ error: 'This trip is no longer open to requests.' }, 404);
    if (status === 409) return reply({ error: 'This trip has reached its request limit.' }, 409);
    return reply({ sent: true }, 201);
  } catch (error) { return fail(error); }
}

export async function DELETE(request: Request) {
  if (!configured()) return reply({ error: 'Community service is not connected.' }, 503);
  if (!sameOrigin(request)) return reply({ error: 'Use Trippin to manage your trip.' }, 403);
  const id = new URL(request.url).searchParams.get('id');
  if (!validId(id)) return reply({ error: 'Invalid trip.' }, 400);
  const owner = ownerHash(request);
  if (!owner) return reply({ error: 'Only the host can unpublish this trip.' }, 403);
  try {
    if (await limited(request)) return reply({ error: 'A few too many requests. Try again in a minute.' }, 429);
    const status = await redis<number>(['EVAL', deleteScript, 3, tripKey(id), requestsKey(id), directoryKey, owner, id]);
    if (status === 403) return reply({ error: 'Only the host can unpublish this trip.' }, 403);
    return reply({ deleted: true });
  } catch (error) { return fail(error); }
}
