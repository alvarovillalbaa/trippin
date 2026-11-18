export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCESS = 'trippin_at', REFRESH = 'trippin_rt';
type User = { id: string; email: string; name: string };
type Session = { access_token: string; refresh_token: string; expires_in: number };
class AuthFailure extends Error { readonly status: number; constructor(status: number) { super('Account request failed.'); this.status = status; } }
function publicKey(key: string) {
  if (key.length < 20 || key.length > 4096 || /\s|[\u0000-\u001f\u007f]/.test(key)) return false;
  if (/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key)) return true;
  if (key.startsWith('sb_')) return false;
  try {
    const parts = key.split('.');
    // Key classification is configuration validation, not JWT authentication.
    return parts.length === 3 && parts.every(part => /^[a-zA-Z0-9_-]+$/.test(part))
      && JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon';
  } catch { return false; }
}
function configuration() {
  try {
    const url = new URL(process.env.TRIPPIN_SUPABASE_URL || '');
    const key = process.env.TRIPPIN_SUPABASE_PUBLISHABLE_KEY || '';
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !publicKey(key)) return null;
    return { url: url.origin + '/auth/v1', key };
  } catch { return null; }
}
function cookie(request: Request, name: string) {
  const raw = request.headers.get('cookie')?.split(';').find(item => item.trim().startsWith(name + '='));
  if (!raw) return '';
  try { const value = decodeURIComponent(raw.trim().slice(name.length + 1)); return value.length <= 8000 && !/[\s\u0000-\u001f\u007f]/.test(value) ? value : ''; } catch { return ''; }
}
function reply(request: Request, body: object, status = 200, session?: Session | null) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store', Pragma: 'no-cache', Vary: 'Cookie' });
  if (session !== undefined) {
    const secure = new URL(request.url).protocol === 'https:' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
    for (const [name, value, age] of [[ACCESS, session?.access_token || '', session ? session.expires_in : 0],
      [REFRESH, session?.refresh_token || '', session ? 60 * 60 * 24 * 30 : 0]] as const) {
      headers.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`);
    }
  }
  return Response.json(body, { status, headers });
}
async function provider(config: NonNullable<ReturnType<typeof configuration>>, path: string, body?: object, access?: string) {
  const signal = AbortSignal.timeout(5000);
  const response = await fetch(config.url + path, { method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
    signal, headers: { apikey: config.key, 'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new AuthFailure(response.status); }
  if (path.startsWith('/logout')) {
    if (response.status !== 204) { void response.body?.cancel().catch(() => {}); throw new AuthFailure(502); }
    return {};
  }
  if (response.status === 204) return {};
  return readObject(response.body, 65536, 502, 503, signal);
}
function sessionValue(value: Record<string, unknown>): Session | null {
  const token = (input: unknown, minimum: number): input is string => typeof input === 'string' && input.length > minimum && input.length <= 8000 && !/[\s\u0000-\u001f\u007f]/.test(input);
  return token(value.access_token, 20) && token(value.refresh_token, 10)
    && typeof value.expires_in === 'number' && Number.isSafeInteger(value.expires_in) && value.expires_in > 0
    ? { access_token: value.access_token, refresh_token: value.refresh_token, expires_in: Math.min(86400, value.expires_in) } : null;
}
async function verifiedUser(config: NonNullable<ReturnType<typeof configuration>>, access: string): Promise<User> {
  const value = await provider(config, '/user', undefined, access);
  if (typeof value.id !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value.id) || typeof value.email !== 'string' || value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) throw new AuthFailure(502);
  if (value.is_anonymous === true || typeof value.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(value.email_confirmed_at))) throw new AuthFailure(403);
  const metadata = value.user_metadata as Record<string, unknown> | undefined;
  return { id: value.id.toLowerCase(), email: value.email, name: typeof metadata?.display_name === 'string' ? metadata.display_name.slice(0, 100) : '' };
}
async function readObject(stream: ReadableStream<Uint8Array> | null, maximum: number, malformedStatus: number, timeoutStatus: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new AuthFailure(timeoutStatus);
  const reader = stream?.getReader(); if (!reader) throw new AuthFailure(malformedStatus);
  const chunks: Uint8Array[] = []; let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => reject(new AuthFailure(timeoutStatus));
    timer = setTimeout(cancel, 5000); signal?.addEventListener('abort', cancel, { once: true });
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]); if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new AuthFailure(malformedStatus === 400 ? 413 : malformedStatus);
      chunks.push(value);
    }
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { clearTimeout(timer); if (cancel) signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new AuthFailure(malformedStatus); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthFailure(malformedStatus);
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return reply(request, { error: 'Open Trippin directly to manage your account.' }, 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(request, { error: 'Use a JSON account request.' }, 415);
  try {
    const body = await readObject(request.body, 16384, 400, 408, request.signal), action = body.action;
    if (typeof action !== 'string' || !['session', 'signup', 'login', 'logout'].includes(action)) throw new AuthFailure(400);
    const fields = action === 'signup' || action === 'login' ? ['action', 'email', 'password', 'name'] : ['action'];
    if (Object.keys(body).some(key => !fields.includes(key))) throw new AuthFailure(400);
    const config = configuration();
    if (action === 'logout') {
      let access = cookie(request, ACCESS); const refresh = cookie(request, REFRESH);
      let revoked = !access && !refresh;
      if (config && !revoked) {
        try {
          if (!access && refresh) {
            const refreshed = sessionValue(await provider(config, '/token?grant_type=refresh_token', { refresh_token: refresh }));
            if (!refreshed) throw new AuthFailure(502);
            access = refreshed.access_token;
          }
          if (access) await provider(config, '/logout?scope=local', {}, access);
          revoked = true;
        } catch { revoked = false; }
      }
      return reply(request, { available: Boolean(config), user: null,
        ...(revoked ? {} : { message: 'Signed out of this browser. Remote session revocation could not be confirmed.' }) }, 200, null);
    }
    if (!config) return reply(request, { available: false, user: null, error: 'Accounts are not connected yet. You can still plan privately on this device.' }, action === 'session' ? 200 : 503);
    if (action === 'session') {
      const access = cookie(request, ACCESS), refresh = cookie(request, REFRESH);
      if (access) {
        try { return reply(request, { available: true, user: await verifiedUser(config, access) }); }
        catch (error) { if (!(error instanceof AuthFailure) || ![400, 401, 403].includes(error.status)) throw error; }
      }
      if (!refresh) return reply(request, { available: true, user: null }, 200, null);
      try {
        const session = sessionValue(await provider(config, '/token?grant_type=refresh_token', { refresh_token: refresh }));
        if (!session) throw new AuthFailure(502);
        const user = await verifiedUser(config, session.access_token);
        return reply(request, { available: true, user }, 200, session);
      } catch (error) {
        if (!(error instanceof AuthFailure) || ![400, 401, 403].includes(error.status)) throw error;
        return reply(request, { available: true, user: null }, 200, null);
      }
    }
    const email = typeof body.email === 'string' ? body.email.trim() : '', password = body.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < (action === 'signup' ? 10 : 1) || password.length > 128) {
      return reply(request, { error: 'Use a valid email and password. New passwords need 10–128 characters.' }, 400);
    }
    if (body.name !== undefined && body.name !== null && (typeof body.name !== 'string' || body.name.length > 100)) throw new AuthFailure(400);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const result = await provider(config, action === 'signup' ? '/signup' : '/token?grant_type=password',
      { email, password, ...(action === 'signup' ? { data: { display_name: name } } : {}) });
    const session = sessionValue(result);
    if (!session) {
      if (action !== 'signup') throw new AuthFailure(502);
      const created = result.user && typeof result.user === 'object' ? result.user as Record<string, unknown> : result;
      if (typeof created.id !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(created.id)) throw new AuthFailure(502);
      // Do not infer an authenticated user from an unconfirmed signup response.
      return reply(request, { available: true, user: null, message: 'Check your email to confirm your account, then log in.' });
    }
    const user = await verifiedUser(config, session.access_token);
    return reply(request, { available: true, user }, 200, session);
  } catch (error) {
    const status = error instanceof AuthFailure ? error.status : 503;
    return reply(request, { error: status === 429 ? 'Too many account attempts. Please wait before trying again.'
      : [400, 401, 403, 422].includes(status) ? 'The account request could not be completed. Check your details and email confirmation.'
        : status === 413 ? 'The account request is too large.' : status === 408 ? 'The account request took too long. Please try again.' : 'The account service is unavailable. Please try again.' },
    [429, 413, 408].includes(status) ? status : [400, 401, 403, 422].includes(status) ? 400 : 503);
  }
}
