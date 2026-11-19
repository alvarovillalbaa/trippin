// T2: real route source with Node Request/Response and authored provider replies.
// No HTTP server, Supabase/JWT verification, real email or network is exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync(process.env.TRIPPIN_AUTH_SOURCE || new URL('../../app/api/auth/route.ts', import.meta.url), 'utf8');
const javascript = stripTypeScriptTypes(source, { mode: 'strip', sourceUrl: 'authored-trippin-route.ts' });
const { POST } = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
const email = 'authored@example.test', password = 'authored-password-123';
const access = 'eyJhbGciOiJIUzI1NiJ9.eyJmaXh0dXJlIjp0cnVlfQ.authored-signature';
const refresh = 'authored-refresh-only-fixture';
const session = { access_token: access, refresh_token: refresh, expires_in: 3600 };
const user = { id: '11111111-1111-4111-8111-111111111111', email,
  email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false, user_metadata: { display_name: 'Authored traveler' } };
function harness(t, handler) {
  const previous = { url: process.env.TRIPPIN_SUPABASE_URL, key: process.env.TRIPPIN_SUPABASE_PUBLISHABLE_KEY, mode: process.env.NODE_ENV, fetch: globalThis.fetch };
  process.env.TRIPPIN_SUPABASE_URL = 'https://authored.supabase.co';
  process.env.TRIPPIN_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_authored_fixture_only_20261115';
  process.env.NODE_ENV = 'production';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const selected = new URL(url);
    assert.equal(selected.origin, 'https://authored.supabase.co');
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    calls.push({ path: selected.pathname + selected.search, init });
    return handler(selected.pathname + selected.search, init, calls.length);
  };
  t.after(() => {
    for (const [key, value] of [['TRIPPIN_SUPABASE_URL', previous.url], ['TRIPPIN_SUPABASE_PUBLISHABLE_KEY', previous.key], ['NODE_ENV', previous.mode]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    globalThis.fetch = previous.fetch;
  });
  return calls;
}
function request(body, headers = {}) {
  return new Request('https://trippin.example.test/api/auth', { method: 'POST',
    headers: { Origin: 'https://trippin.example.test', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('repeated signup gives neutral email and password recovery guidance', async t => {
  harness(t, () => Response.json({ id: user.id, identities: [] }));
  const response = await POST(request({ action: 'signup', email, password }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  const result = await response.json();
  assert.equal(result.user, null);
  assert.match(result.message, /^If this is a new account/);
  assert.match(result.message, /reset your password/);
});

test('password recovery requests one code with generic success', async t => {
  const calls = harness(t, () => Response.json({}));
  const response = await POST(request({ action: 'recover', email }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match((await response.json()).message, /^If an account uses this email/);
  assert.deepEqual(calls.map(call => [call.path, JSON.parse(call.init.body)]), [['/auth/v1/recover', { email }]]);
});

test('only a verified recovery code can change the password and no session reaches the caller', async t => {
  const code = '01234567';
  let valid = false, rejectsPassword = false;
  const calls = harness(t, (path, init) => {
    if (path === '/auth/v1/verify') {
      assert.deepEqual(JSON.parse(init.body), { email, token: code, type: 'recovery' });
      return valid ? Response.json(session) : Response.json({}, { status: 403 });
    }
    assert.equal(init.headers.Authorization, `Bearer ${access}`);
    if (path === '/auth/v1/user') {
      assert.equal(init.method, 'PUT');
      assert.deepEqual(JSON.parse(init.body), { password });
      return rejectsPassword ? Response.json({}, { status: 422 }) : Response.json(user);
    }
    assert.equal(path, '/auth/v1/logout?scope=local');
    return new Response(null, { status: 204 });
  });
  const payload = { action: 'resetPassword', email, code, password };
  assert.equal((await POST(request({ ...payload, code: 'wrong' }))).status, 400);
  assert.equal(calls.length, 0);
  const invalid = await POST(request(payload));
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /invalid or has expired/);
  assert.deepEqual(calls.splice(0).map(call => call.path), ['/auth/v1/verify']);
  valid = true;
  for (const rejected of [false, true]) {
    rejectsPassword = rejected;
    const response = await POST(request(payload));
    assert.equal(response.status, rejected ? 400 : 200);
    assert.equal(response.headers.get('set-cookie'), null);
    const result = await response.text();
    assert.ok([access, refresh, code, password].every(secret => !result.includes(secret)));
    assert.deepEqual(calls.splice(0).map(call => call.path), ['/auth/v1/verify', '/auth/v1/user', '/auth/v1/logout?scope=local']);
  }
});

test('A01 a provider user without confirmed email is never admitted as a session', async t => {
  harness(t, path => Response.json(path.startsWith('/auth/v1/token') ? session : { ...user, email_confirmed_at: null }));
  const response = await POST(request({ action: 'login', email, password }));
  assert.equal(response.status, 400); assert.equal(response.headers.get('set-cookie'), null);
});

test('A02 a secret/service-role configuration is refused before contacting the provider', async t => {
  const calls = harness(t, () => { throw new Error('No provider call is allowed.'); });
  process.env.TRIPPIN_SUPABASE_PUBLISHABLE_KEY = 'sb_secret_authored_invalid_configuration';
  const response = await POST(request({ action: 'session' }));
  assert.equal((await response.json()).available, false); assert.equal(calls.length, 0);
});

test('A03 an array coerced to a valid action cannot become a login', async t => {
  const calls = harness(t, path => Response.json(path.startsWith('/auth/v1/token') ? session : user));
  const response = await POST(request({ action: ['login'], email, password }));
  assert.equal(response.status, 400); assert.equal(calls.length, 0);
});

test('A04 oversized upstream account JSON is refused without a session cookie', async t => {
  harness(t, path => Response.json(path.startsWith('/auth/v1/token') ? session : { ...user, user_metadata: { display_name: 'x'.repeat(70000) } }));
  const response = await POST(request({ action: 'login', email, password }));
  assert.equal(response.status, 503); assert.equal(response.headers.get('set-cookie'), null);
});

test('A05 malformed refresh during logout does not claim confirmed remote revocation', async t => {
  harness(t, () => Response.json({ malformed: true }));
  const response = await POST(request({ action: 'logout' }, { Cookie: 'trippin_rt=' + refresh }));
  const value = await response.json();
  assert.equal(response.status, 200); assert.equal(value.user, null);
  assert.equal(typeof value.message === 'string' && /could not be confirmed/.test(value.message), true);
});

test('A06 verified login keeps tokens only in private host cookies', async t => {
  const calls = harness(t, path => Response.json(path.startsWith('/auth/v1/token') ? session : user));
  const response = await POST(request({ action: 'login', email, password, name: null }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { available: true, user: { id: user.id, email, name: 'Authored traveler' } });
  const cookies = response.headers.getSetCookie(); assert.equal(cookies.length, 2);
  for (const value of cookies) {
    for (const flag of ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure']) assert.ok(value.includes(flag));
    assert.ok(!/Domain=/i.test(value));
  }
  assert.ok(cookies[0].includes('Max-Age=3600')); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(calls.length, 2); assert.equal(calls[1].init.headers.Authorization, 'Bearer ' + access);
});

test('A07 confirmation-pending signup never creates browser session cookies', async t => {
  const calls = harness(t, () => Response.json({ user: { id: user.id, email_confirmed_at: null } }));
  const response = await POST(request({ action: 'signup', email, password, name: 'Authored traveler' }));
  const value = await response.json(); assert.equal(response.status, 200); assert.equal(value.user, null);
  assert.match(value.message, /confirm/); assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(JSON.parse(calls[0].init.body), { email, password, data: { display_name: 'Authored traveler' } });
  assert.equal(calls.length, 1);
});

test('A08 immediate-session signup still requires the verified confirmed user endpoint', async t => {
  const calls = harness(t, path => Response.json(path === '/auth/v1/signup' ? session : user));
  const response = await POST(request({ action: 'signup', email, password }));
  assert.equal((await response.json()).user.id, user.id); assert.equal(calls.length, 2);
});

test('A09 absent, foreign and cross-site origins are refused before provider work', async t => {
  const calls = harness(t, () => { throw Error('No provider'); });
  for (const headers of [{ Origin: 'https://foreign.example.test' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await POST(request({ action: 'session' }, headers))).status, 403);
  }
  const absent = request({ action: 'session' }); absent.headers.delete('origin');
  assert.equal((await POST(absent)).status, 403); assert.equal(calls.length, 0);
});

test('A10 exact JSON media type, valid UTF8, object, size and field allowlists are enforced', async t => {
  const calls = harness(t, () => { throw Error('No provider'); });
  assert.equal((await POST(request({ action: 'session' }, { 'Content-Type': 'application/jsonp' }))).status, 415);
  for (const [body, expected] of [[[], 400], [null, 400], [{ action: 'session', token: access }, 400], [{ action: 'login', email, password, name: 'x'.repeat(17000) }, 413]]) {
    assert.equal((await POST(request(body))).status, expected);
  }
  const bad = new Request('https://trippin.example.test/api/auth', { method: 'POST', headers: { Origin: 'https://trippin.example.test', 'Content-Type': 'application/json' }, body: new Uint8Array([0xff]) });
  assert.equal((await POST(bad)).status, 400); assert.equal(calls.length, 0);
});

test('A11 invalid project URLs and privileged legacy keys never contact a provider', async t => {
  const calls = harness(t, () => { throw Error('No provider'); });
  for (const url of ['http://authored.supabase.co', 'https://authored.supabase.co/auth', 'https://authored.supabase.co?x=1', 'https://authored.supabase.co@foreign.example.test']) {
    process.env.TRIPPIN_SUPABASE_URL = url;
    assert.equal((await (await POST(request({ action: 'session' }))).json()).available, false);
  }
  process.env.TRIPPIN_SUPABASE_URL = 'https://authored.supabase.co';
  process.env.TRIPPIN_SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from('{"role":"service_role"}').toString('base64url') + '.authored';
  assert.equal((await (await POST(request({ action: 'session' }))).json()).available, false); assert.equal(calls.length, 0);
});

test('A12 a legacy anon configuration and existing verified access use only user lookup', async t => {
  const calls = harness(t, () => Response.json(user));
  process.env.TRIPPIN_SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from('{"role":"anon"}').toString('base64url') + '.authored';
  const response = await POST(request({ action: 'session' }, { Cookie: 'trippin_at=' + access }));
  assert.equal((await response.json()).user.id, user.id); assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(calls.map(item => item.path), ['/auth/v1/user']);
});

test('A13 expired access rotates refresh cookies only after user verification', async t => {
  const calls = harness(t, (path, init, count) => count === 1 ? Response.json({}, { status: 401 }) : Response.json(path.startsWith('/auth/v1/token') ? { ...session, refresh_token: refresh + '-rotated' } : user));
  const response = await POST(request({ action: 'session' }, { Cookie: 'trippin_at=' + access + '; trippin_rt=' + refresh }));
  assert.equal((await response.json()).user.id, user.id);
  assert.ok(response.headers.getSetCookie()[1].includes(refresh + '-rotated'));
  assert.deepEqual(calls.map(item => item.path), ['/auth/v1/user', '/auth/v1/token?grant_type=refresh_token', '/auth/v1/user']);
  assert.deepEqual(JSON.parse(calls[1].init.body), { refresh_token: refresh });
});

test('A14 refused refresh clears cookies, but unavailable or malformed refresh retains them', async t => {
  let status = 401, malformed = false;
  harness(t, () => malformed ? Response.json({ invalid: true }) : Response.json({}, { status }));
  const headers = { Cookie: 'trippin_rt=' + refresh };
  const refused = await POST(request({ action: 'session' }, headers));
  assert.equal((await refused.json()).user, null); assert.ok(refused.headers.getSetCookie().every(value => value.includes('Max-Age=0')));
  status = 503;
  for (const invalid of [false, true]) {
    malformed = invalid; const response = await POST(request({ action: 'session' }, headers));
    assert.equal(response.status, 503); assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('A15 anonymous, malformed and invalid-confirmation identities cannot receive cookies', async t => {
  let selected = user;
  harness(t, path => Response.json(path.startsWith('/auth/v1/token') ? session : selected));
  for (const change of [{ is_anonymous: true }, { email_confirmed_at: 'invalid' }, { id: 'not-a-uuid' }, { email: 'invalid' }]) {
    selected = { ...user, ...change }; const response = await POST(request({ action: 'login', email, password }));
    assert.ok([400, 503].includes(response.status)); assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('A16 malformed session tokens, fractions and invalid provider JSON are refused', async t => {
  let selected = session, invalidJson = false;
  harness(t, () => invalidJson ? new Response('{') : Response.json(selected));
  for (const change of [{ expires_in: 0.5 }, { expires_in: -1 }, { access_token: access + '\n' }, { refresh_token: 'short' }]) {
    selected = { ...session, ...change }; const response = await POST(request({ action: 'login', email, password }));
    assert.equal(response.status, 503); assert.equal(response.headers.get('set-cookie'), null);
  }
  invalidJson = true; assert.equal((await POST(request({ action: 'login', email, password }))).status, 503);
});

test('A17 throttling, credential refusal and service errors are bounded and never retried', async t => {
  let status = 429;
  const calls = harness(t, () => new Response('authored sensitive provider text', { status }));
  for (const [code, expected] of [[429, 429], [401, 400], [503, 503], [302, 503]]) {
    status = code; const response = await POST(request({ action: 'login', email, password }));
    assert.equal(response.status, expected); assert.ok(!(await response.text()).includes('sensitive'));
  }
  assert.equal(calls.length, 4);
});

test('A18 logout requires a provider 204 before reporting confirmed local revocation', async t => {
  let status = 204;
  const calls = harness(t, () => status === 204 ? new Response(null, { status }) : Response.json({}, { status }));
  const headers = { Cookie: 'trippin_at=' + access };
  const response = await POST(request({ action: 'logout' }, headers));
  assert.equal((await response.json()).message, undefined);
  assert.ok(response.headers.getSetCookie().every(value => value.includes('Max-Age=0')));
  assert.equal(calls[0].path, '/auth/v1/logout?scope=local');
  for (const code of [200, 503]) {
    status = code; const value = await (await POST(request({ action: 'logout' }, headers))).json();
    assert.match(value.message, /could not be confirmed/);
  }
});

test('A19 unavailable configuration still clears local cookies without claiming remote revocation', async t => {
  const calls = harness(t, () => { throw Error('No provider'); });
  delete process.env.TRIPPIN_SUPABASE_URL;
  const response = await POST(request({ action: 'logout' }, { Cookie: 'trippin_rt=' + refresh }));
  assert.match((await response.json()).message, /could not be confirmed/);
  assert.ok(response.headers.getSetCookie().every(value => value.includes('Max-Age=0'))); assert.equal(calls.length, 0);
});

test('A20 aborted request and oversized streaming upstream cancel without accepting a session', async t => {
  let cancelled = false;
  harness(t, () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; } })));
  const controller = new AbortController(); controller.abort();
  const aborted = new Request('https://trippin.example.test/api/auth', { method: 'POST', headers: { Origin: 'https://trippin.example.test', 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
  assert.equal((await POST(aborted)).status, 408);
  assert.equal((await POST(request({ action: 'login', email, password }))).status, 503); assert.equal(cancelled, true);
});
