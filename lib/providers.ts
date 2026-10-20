type JsonObject = Record<string, unknown>;
import type {ActivityCategory} from './types';

export type ProviderName = 'flightaware' | 'ticketmaster';
export type FlightLookupResult = Awaited<ReturnType<typeof lookupFlight>>;
export type EventSearchResult = Awaited<ReturnType<typeof discoverEvents>>;

export class ProviderError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

const sources = { flightaware: 'FlightAware AeroAPI', ticketmaster: 'Ticketmaster Discovery' } as const;
const dayMs = 86_400_000;

export function providerReadiness() {
  return {
    checkedAt: new Date().toISOString(),
    providers: {
      flightaware: readiness('flightaware', process.env.FLIGHTAWARE_API_KEY),
      ticketmaster: readiness('ticketmaster', process.env.TICKETMASTER_API_KEY),
    },
  };
}

function readiness(provider: ProviderName, key: string | undefined) {
  const configured = Boolean(key?.trim());
  return { source: sources[provider], configured, status: configured ? 'configured' : 'setup_required' };
}

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown, limit = 200): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit) || null;
}

function instant(value: unknown): string | null {
  const valueText = text(value, 40);
  return valueText && Number.isFinite(Date.parse(valueText)) ? new Date(valueText).toISOString() : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function externalUrl(value: unknown): string | null {
  const valueText = text(value, 2000);
  if (!valueText) return null;
  try {
    const url = new URL(valueText);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.protocol = 'https:';
    for (const key of ['apikey', 'api_key', 'access_token', 'token']) url.searchParams.delete(key);
    return url.toString();
  } catch { return null; }
}

function credential(provider: ProviderName): string {
  const key = (provider === 'flightaware' ? process.env.FLIGHTAWARE_API_KEY : process.env.TICKETMASTER_API_KEY)?.trim();
  if (!key) throw new ProviderError(503, 'setup_required', `${sources[provider]} is not connected. Add its server credential to enable live lookups.`);
  return key;
}

async function providerJson(url: URL, headers: Record<string, string> = {}): Promise<JsonObject> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) throw new ProviderError(503, 'provider_access_required', 'The provider could not authorize this lookup. Check its credential and account access.');
      if (response.status === 429) throw new ProviderError(429, 'provider_rate_limited', 'The provider lookup limit has been reached. Try again later.');
      throw new ProviderError(502, 'provider_unavailable', 'The provider could not complete this lookup. Please try again later.');
    }
    // Bound the response as well as the request; do not forward upstream error bodies.
    if (!response.body) throw new Error('Empty provider response');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = '', bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1_000_000) { await reader.cancel(); throw new Error('Provider response too large'); }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid provider response');
    return object(data);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) throw new ProviderError(504, 'provider_timeout', 'The provider took too long to respond. Please try again.');
    throw new ProviderError(502, 'provider_unavailable', 'The provider is temporarily unavailable. Please try again later.');
  }
}

function airport(value: unknown) {
  const data = object(value);
  return { code: text(data.code_iata, 12) || text(data.code, 12), name: text(data.name), city: text(data.city), timezone: text(data.timezone, 80) };
}

export async function lookupFlight(identifier: unknown, date?: unknown) {
  if (typeof identifier !== 'string') throw new ProviderError(400, 'invalid_identifier', 'Enter an airline flight number, such as LH1801 or DLH1801.');
  const ident = identifier.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$/.test(ident)) throw new ProviderError(400, 'invalid_identifier', 'Enter an airline flight number, such as LH1801 or DLH1801.');
  const url = new URL(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}`);
  url.searchParams.set('ident_type', 'designator');
  url.searchParams.set('max_pages', '1');
  if (date !== undefined) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ProviderError(400, 'invalid_date', 'Use a flight date in YYYY-MM-DD format.');
    const start = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date) throw new ProviderError(400, 'invalid_date', 'Enter a valid flight date.');
    const today = new Date().setUTCHours(0, 0, 0, 0);
    if (start.getTime() < today - 9 * dayMs || start.getTime() > today + dayMs) throw new ProviderError(400, 'unsupported_date', 'Flight status lookup supports UTC dates from nine days ago through tomorrow.');
    url.searchParams.set('start', start.toISOString());
    url.searchParams.set('end', new Date(start.getTime() + dayMs).toISOString());
  }
  const data = await providerJson(url, { 'x-apikey': credential('flightaware') });
  if (!Array.isArray(data.flights)) throw new ProviderError(502, 'provider_unavailable', 'The flight provider returned an unreadable result.');
  const flights = data.flights.slice(0, 12).map(value => {
    const flight = object(value);
    return {
      id: text(flight.fa_flight_id),
      identifier: text(flight.ident_iata, 16) || text(flight.ident, 16),
      identifierIcao: text(flight.ident_icao, 16),
      status: text(flight.status),
      origin: airport(flight.origin), destination: airport(flight.destination),
      scheduledDeparture: instant(flight.scheduled_out) || instant(flight.scheduled_off),
      estimatedDeparture: instant(flight.estimated_out) || instant(flight.estimated_off),
      actualDeparture: instant(flight.actual_out) || instant(flight.actual_off),
      scheduledArrival: instant(flight.scheduled_in) || instant(flight.scheduled_on),
      estimatedArrival: instant(flight.estimated_in) || instant(flight.estimated_on),
      actualArrival: instant(flight.actual_in) || instant(flight.actual_on),
      cancelled: typeof flight.cancelled === 'boolean' ? flight.cancelled : null,
      diverted: typeof flight.diverted === 'boolean' ? flight.diverted : null,
    };
  }).filter(flight => flight.id && flight.identifier);
  return { source: sources.flightaware, mode: 'live' as const, fetchedAt: new Date().toISOString(), identifier: ident, date: date ?? null, flights, moreAvailable: data.flights.length > 12 || Boolean(object(data.links).next) };
}

function calendarDate(value: unknown): value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}

function coordinate(value:unknown,maximum:number):number|null {
  if(typeof value!=='number'&&(typeof value!=='string'||!value.trim()))return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)&&Math.abs(parsed)<=maximum?parsed:null;
}

function eventCategory(segment:string|null,genre:string|null):ActivityCategory {
  const classification=`${segment||''} ${genre||''}`.toLowerCase();
  if(/food|drink|culinary|tasting/.test(classification))return 'food';
  if(/running|cycling|outdoor/.test(classification))return 'outdoors';
  if(/music|concert|jazz|dance|club/.test(classification))return 'nightlife';
  if(/arts|theatre|theater|film|museum|comedy/.test(classification))return 'culture';
  return 'community';
}

export async function discoverEvents(city: unknown, size: unknown = 8, options: {startDate?:unknown;endDate?:unknown;countryCode?:unknown} = {}) {
  if (typeof city !== 'string' || city.trim().length < 2 || city.trim().length > 80 || !/^[\p{L}\p{M}\p{N} .,'’()\-]+$/u.test(city.trim())) throw new ProviderError(400, 'invalid_city', 'Enter a city name between 2 and 80 characters.');
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > 12) throw new ProviderError(400, 'invalid_size', 'Request between 1 and 12 events.');
  const {startDate,endDate,countryCode}=options;
  const hasDates=startDate!==undefined||endDate!==undefined;
  if(hasDates&&(!calendarDate(startDate)||!calendarDate(endDate)||endDate<startDate||Date.parse(endDate)-Date.parse(startDate)>30*dayMs))throw new ProviderError(400,'invalid_dates','Choose valid trip dates spanning up to 31 days.');
  if(countryCode!==undefined&&(typeof countryCode!=='string'||!/^[A-Z]{2}$/.test(countryCode)))throw new ProviderError(400,'invalid_country','Use a two-letter country code.');
  const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
  url.searchParams.set('apikey', credential('ticketmaster'));
  url.searchParams.set('city', city.trim());
  if(typeof countryCode==='string')url.searchParams.set('countryCode',countryCode);
  url.searchParams.set('size', String(size));
  url.searchParams.set('sort', 'date,asc');
  if(hasDates){
    url.searchParams.set('localStartDateTime',`${startDate}T00:00:00,${endDate}T23:59:59`);
    url.searchParams.set('includeTBA','no');
    url.searchParams.set('includeTBD','no');
  }else url.searchParams.set('startDateTime', new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
  const data = await providerJson(url);
  const embedded = object(data._embedded);
  const total = number(object(data.page).totalElements);
  if (total === null || total < 0 || (embedded.events !== undefined && !Array.isArray(embedded.events))) throw new ProviderError(502, 'provider_unavailable', 'The event provider returned an unreadable result.');
  const events = (Array.isArray(embedded.events) ? embedded.events : []).slice(0, size).map(value => {
    const event = object(value), dates = object(event.dates), start = object(dates.start);
    const venues = object(event._embedded).venues;
    const venue = object(Array.isArray(venues) ? venues[0] : undefined);
    const classification=object(Array.isArray(event.classifications)?event.classifications[0]:undefined);
    const segment=text(object(classification.segment).name,80),genre=text(object(classification.genre).name,80);
    const price = object(Array.isArray(event.priceRanges) ? event.priceRanges[0] : undefined);
    const min = number(price.min), max = number(price.max), rawCurrency = text(price.currency, 3)?.toUpperCase();
    const currency=rawCurrency&&/^[A-Z]{3}$/.test(rawCurrency)?rawCurrency:null;
    return {
      id: text(event.id,160), title: text(event.name, 200), category:eventCategory(segment,genre),
      date: text(start.localDate, 10), time: text(start.localTime, 12), startsAt: instant(start.dateTime),
      dateToBeAnnounced: Boolean(start.dateTBA || start.dateTBD), timeToBeAnnounced: Boolean(start.timeTBA || start.noSpecificTime),
      timezone: text(dates.timezone, 80), status: text(object(dates.status).code, 40),
      location: { venue: text(venue.name), city: text(object(venue.city).name), country: text(object(venue.country).countryCode, 2),lat:coordinate(object(venue.location).latitude,90),lng:coordinate(object(venue.location).longitude,180) },
      url: externalUrl(event.url),
      price: min !== null && min >= 0 && currency ? { min, max: max !== null && max >= min ? max : null, currency, isFinalTotal: false } : null,
    };
  }).filter(event => event.id && event.title&&(!hasDates||(calendarDate(event.date)&&event.date>=String(startDate)&&event.date<=String(endDate)&&!event.dateToBeAnnounced)));
  return { source: sources.ticketmaster, mode: 'live' as const, fetchedAt: new Date().toISOString(), city: city.trim(), startDate:startDate??null,endDate:endDate??null,countryCode:countryCode??null,events, moreAvailable: total > events.length };
}
