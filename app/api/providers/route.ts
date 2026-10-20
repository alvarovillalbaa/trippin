import { discoverEvents, lookupFlight, ProviderError, providerReadiness } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function GET() {
  // Configuration presence is not evidence that credentials or access are valid.
  return reply(providerReadiness());
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ProviderError(415, 'invalid_content_type', 'Send a JSON lookup request.');
  if (Number(request.headers.get('content-length')) > 4096 || !request.body) throw new ProviderError(413, 'invalid_body', 'The lookup request is too large or empty.');
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let raw = '', bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) { await reader.cancel(); throw new ProviderError(413, 'invalid_body', 'The lookup request is too large.'); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally { reader.releaseLock(); }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new ProviderError(400, 'invalid_body', 'Send a valid JSON lookup request.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProviderError(400, 'invalid_body', 'Send a JSON object for the lookup.');
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Use Trippin to request provider data.', code: 'invalid_origin' }, 403);
  try {
    const body = await readBody(request);
    if (body.provider === 'flightaware') return reply(await lookupFlight(body.identifier, body.date));
    if (body.provider === 'ticketmaster') return reply(await discoverEvents(body.city, body.size));
    return reply({ error: 'Choose a supported provider.', code: 'invalid_provider' }, 400);
  } catch (error) {
    if (error instanceof ProviderError) return reply({ error: error.message, code: error.code }, error.status);
    return reply({ error: 'This lookup is temporarily unavailable.', code: 'lookup_unavailable' }, 503);
  }
}
