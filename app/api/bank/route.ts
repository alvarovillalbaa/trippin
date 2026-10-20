import { analyseBankPreferences, BankError, bankReadiness, createBankLink } from '@/lib/bank';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function GET() { return reply(bankReadiness()); }

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BankError(415, 'invalid_content_type', 'Send a JSON Sandbox request.');
  if (!request.body || Number(request.headers.get('content-length')) > 2048) throw new BankError(413, 'invalid_body', 'The Sandbox request is empty or too large.');
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let raw = '', bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) { await reader.cancel(); throw new BankError(413, 'invalid_body', 'The Sandbox request is too large.'); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally { reader.releaseLock(); }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new BankError(400, 'invalid_body', 'Send a valid JSON Sandbox request.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BankError(400, 'invalid_body', 'Send a JSON object for the Sandbox preview.');
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Use Trippin to request a Sandbox preview.', code: 'invalid_origin' }, 403);
  if (!bankReadiness().enabled) return reply({ error: 'The Plaid Sandbox preview needs server credentials and explicit enablement. Real bank connections are not available.', code: 'setup_required' }, 503);
  try {
    const value = await body(request);
    if (value.action === 'create_link' && value.consent === true) return reply(await createBankLink());
    if (value.action === 'analyse' && value.consent === true) return reply(await analyseBankPreferences(value.publicToken));
    return reply({ error: 'Choose a Sandbox action and confirm consent.', code: 'invalid_request' }, 400);
  } catch (error) {
    if (error instanceof BankError) return reply({ error: error.message, code: error.code }, error.status);
    return reply({ error: 'The Sandbox preview is unavailable. No preferences were imported.', code: 'sandbox_unavailable' }, 503);
  }
}
