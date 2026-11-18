// T2: execute actual controller functions with authored React/form/fetch replies.
// No rendering, server, cookies, provider, JWT verification or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const text = readFileSync(new URL('../../components/travel-app.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('travel-app.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'TravelApp');
const names = ['recoverAccount', 'checkAccount', 'submitAuth', 'logout'];
const functions = component.body.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
assert.equal(functions.length, names.length);
const top = ast.statements.filter(n => n.name && ['AccountReplyError', 'accountRequest'].includes(n.name.text));
assert.equal(top.length, 2);
const script = new vm.Script(ts.transpileModule([...top, ...functions].map(n => n.getText(ast)).join('\n') + '\nObject.assign(api, {checkAccount,submitAuth,logout});', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText);
const alice = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.test', name: 'Alice' };
const bob = { id: '22222222-2222-4222-8222-222222222222', email: 'bob@example.test', name: 'Bob' };
function harness(replies) {
  const calls = [], loads = [], errors = [], notices = [], forms = [], api = {};
  const scope = { api, form: 'login', accountUncertain: false, epoch: { current: 0 }, working: { current: false },
    Error, Object, AbortSignal,
    accountWorkspaceKey(user) { if (user && !/^[a-f0-9-]{36}$/.test(user.id)) throw Error('Invalid identity'); },
    FormData: class { get(name) { return { email: alice.email, password: 'authored-password', name: null }[name]; } },
    async fetch(url, init) {
      assert.equal(url, '/api/auth'); calls.push(JSON.parse(init.body));
      const next = replies.shift(); assert.ok(next, 'No implicit request replay is allowed.');
      if (typeof next === 'function') return next();
      if (next instanceof Error) throw next;
      return Response.json(next.body ?? next, { status: next.status || 200 });
    },
    load: user => { loads.push(user); return {}; }, setAuth: value => { scope.auth = value; },
    setAccountUncertain: value => { scope.accountUncertain = value; },
    setPending: value => { scope.pending = value; }, setError: value => errors.push(value),
    setNotice: value => notices.push(value), setForm: value => forms.push(value), setInTrip() {}, setSharedPlan() {},
  };
  script.runInContext(vm.createContext(scope));
  return { scope, calls, loads, errors, notices, forms, api, submit: () => api.submitAuth({ preventDefault() {}, currentTarget: {} }) };
}
test('R01 a lost login reply queries current session without replaying credentials', async () => {
  const h = harness([Error('lost reply'), { available: true, user: bob }]); await h.submit();
  assert.deepEqual(h.calls.map(v => v.action), ['login', 'session']);
  assert.deepEqual(Object.keys(h.calls[1]), ['action']); assert.equal(h.loads[0].id, bob.id);
  assert.equal(h.scope.accountUncertain, false); assert.equal(h.scope.working.current, false);
});
test('R02 unconfirmed logout with a still-active account keeps that account namespace', async () => {
  const h = harness([Error('lost reply'), { available: true, user: alice }]); await h.api.logout();
  assert.equal(h.loads[0].id, alice.id); assert.match(h.errors.at(-1), /still signed in/);
  assert.deepEqual(h.calls.map(v => v.action), ['logout', 'session']);
});
test('R03 lost logout followed by no current session reports only browser sign-out', async () => {
  const h = harness([Error('lost reply'), { available: true, user: null }]); await h.api.logout();
  assert.equal(h.loads[0], null); assert.match(h.notices.at(-1), /remote revocation is not confirmed/);
});
test('R04 malformed success and transient server replies use fresh status recovery', async () => {
  for (const reply of [{ available: true, user: alice, access_token: 'forbidden' }, { status: 503, body: { error: 'Unavailable' } }]) {
    const h = harness([reply, { available: true, user: null }]); await h.submit();
    assert.deepEqual(h.calls.map(v => v.action), ['login', 'session']); assert.equal(h.loads[0], null);
  }
});
test('R05 failed recovery blocks credential replay until a successful explicit status check', async () => {
  const h = harness([Error('lost'), Error('status unavailable'), { available: true, user: alice }]);
  await h.submit(); assert.equal(h.scope.accountUncertain, true); await h.submit(); assert.equal(h.calls.length, 2);
  await h.api.checkAccount(); assert.equal(h.scope.accountUncertain, false); assert.equal(h.loads[0].id, alice.id);
  assert.equal(h.notices.at(-1), 'Account status checked.');
});
test('R06 a newer account epoch refuses an older recovery before loading data', async () => {
  let finish;
  const h = harness([Error('lost'), () => new Promise(resolve => { finish = resolve; })]);
  const pending = h.submit();
  for (let n = 0; n < 10 && !finish; n++) await Promise.resolve();
  assert.ok(finish); h.scope.epoch.current++;
  finish(Response.json({ available: true, user: alice })); await pending;
  assert.equal(h.loads.length, 0); assert.equal(h.forms.length, 0);
});
test('R07 concurrent local submits are fenced while a request is pending', async () => {
  let finish;
  const h = harness([() => new Promise(resolve => { finish = resolve; })]);
  const pending = h.submit(); await h.submit(); assert.equal(h.calls.length, 1);
  finish(Response.json({ available: true, user: alice })); await pending;
  assert.equal(h.loads.length, 1);
});
test('R08 a known credential refusal neither retries nor changes the data namespace', async () => {
  const h = harness([{ status: 400, body: { error: 'Check your details.' } }]); await h.submit();
  assert.equal(h.calls.length, 1); assert.equal(h.loads.length, 0); assert.equal(h.scope.accountUncertain, false);
  assert.equal(h.errors.at(-1), 'Check your details.');
});
