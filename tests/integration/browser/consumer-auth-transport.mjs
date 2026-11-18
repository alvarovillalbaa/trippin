// T2 server-only transport. Imported solely by the isolated acceptance server.
// These opaque fixtures are not signed JWTs or real Supabase identities.
import fs from 'node:fs/promises';
const origin = 'https://authored.supabase.co';
const sessions = new Map(), events = [];
let sequence = 0;
const people = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.test', name: 'Alice' },
  { id: '22222222-2222-4222-8222-222222222222', email: 'bob@example.test', name: 'Bob' },
];
function tokens(user) {
  const n = ++sequence, access = 'authored-access-only-'.padEnd(30, 'x') + n;
  const refresh = 'authored-refresh-only-'.padEnd(30, 'x') + n;
  sessions.set(access, user); sessions.set(refresh, user);
  return { access_token: access, refresh_token: refresh, expires_in: 3600 };
}
globalThis.fetch = async (url, init = {}) => {
  const selected = new URL(typeof url === 'string' ? url : url.url || url.href);
  if (selected.origin !== origin) throw Error('Acceptance server refused external fetch');
  if (init.redirect !== 'error' || init.cache !== 'no-store') throw Error('Unexpected provider request policy');
  const path = selected.pathname + selected.search;
  events.push({ path, method: init.method });
  if (path === '/auth/v1/signup') return Response.json({ user: { id: people[0].id, email_confirmed_at: null } });
  if (path === '/auth/v1/token?grant_type=password') {
    const body = JSON.parse(init.body), user = people.find(person => person.email === body.email);
    if (!user || body.password !== 'authored-password-123') return Response.json({}, { status: 400 });
    return Response.json(tokens(user));
  }
  if (path === '/auth/v1/token?grant_type=refresh_token') {
    const key = JSON.parse(init.body).refresh_token, user = sessions.get(key);
    if (!user) return Response.json({}, { status: 401 });
    sessions.delete(key); return Response.json(tokens(user));
  }
  const access = init.headers.Authorization?.replace(/^Bearer /, ''), user = sessions.get(access);
  if (path === '/auth/v1/user') return user ? Response.json({ id: user.id, email: user.email,
    email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false, user_metadata: { display_name: user.name } }) : Response.json({}, { status: 401 });
  if (path === '/auth/v1/logout?scope=local') {
    if (user) for (const [key, person] of sessions) if (person === user) sessions.delete(key);
    return new Response(null, { status: 204 });
  }
  throw Error('Unexpected authored provider path');
};
export async function closeTransport() {
  await fs.writeFile(process.env.TRIPPIN_NATIVE_OUTPUT + '/provider-paths.json', JSON.stringify({ boundary: 'T2 authored transport, no real provider/JWT/email', events }, null, 2));
  sessions.clear();
}
