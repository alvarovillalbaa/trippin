// T2: actual startup/form-focus source with authored URL, history and account replies.
// No React mount, browser, Auth route, provider, cookies, credentials or network runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const source = readFileSync(new URL('../../components/travel-app.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('travel-app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'TravelApp');
assert.ok(component?.body);
const showForm = component.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'showForm');
let startup, focus, homeError, formError;
const attribute = (node, name) => node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name)?.initializer;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const callback = node.arguments[0], dependencies = node.arguments[1]?.getText(ast);
    if (dependencies === '[]' && callback?.getText(ast).includes("accountRequest({ action: 'session' })")) startup = callback;
    if (dependencies === '[form]') focus = callback;
  }
  if (ts.isJsxElement(node)) {
    const opening = node.openingElement, className = attribute(opening, 'className');
    if (opening.tagName.getText(ast) === 'div' && className?.expression?.getText(ast).includes("'home-notice home-error'")) homeError = node;
    if (opening.tagName.getText(ast) === 'p' && className?.text === 'form-error' && attribute(opening, 'role')?.text === 'alert') formError = node;
  }
  ts.forEachChild(node, visit);
}
visit(component);
assert.ok(startup && focus && showForm && homeError && formError, 'Use the actual return handler and existing error/focus surfaces.');
const scripts = new WeakMap();
function evaluate(node, context) {
  let script = scripts.get(node);
  if (!script) {
    const compiled = ts.transpileModule('module.exports = (' + node.getText(ast) + ');', {
      fileName: 'actual-confirmation-return.tsx', reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
    });
    assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
    script = new vm.Script(compiled.outputText); scripts.set(node, script);
  }
  context.module = { exports: {} }; script.runInContext(context); return context.module.exports;
}
const failure = 'This confirmation link could not be used. Open your latest confirmation email before logging in.';
const guestReply = { available: true, user: null };
const verifiedReply = { available: true, user: { id: '11111111-1111-4111-8111-111111111111', email: 'authored@example.test', name: 'Authored account' } };
const drain = () => new Promise(resolve => setImmediate(resolve));
function harness(href) {
  const location = new URL(href), historyState = { authored: 'preserve existing navigation state' };
  const calls = [], loads = [], errors = [], notices = [], events = [], replacements = [];
  const state = { auth: null, loading: true, uncertain: false, incoming: null, form: null };
  const epoch = { current: 7 }, backupReadGeneration = { current: 3 };
  let resolve, reject, focused = 0, queried = 0, context;
  const response = new Promise((yes, no) => { resolve = yes; reject = no; });
  const history = { state: historyState, replaceState(value, unused, destination) {
    assert.strictEqual(value, historyState); assert.equal(unused, '');
    replacements.push(destination); events.push('scrub'); location.href = new URL(destination, location).href;
  } };
  context = vm.createContext({ Error, URLSearchParams, window: { location }, history, epoch, backupReadGeneration,
    accountRequest(body) { calls.push(JSON.parse(JSON.stringify(body))); events.push('request'); return response; },
    setAuth(value) { state.auth = value; events.push('auth'); },
    setAccountUncertain(value) { state.uncertain = value; events.push('uncertain'); },
    setLoading(value) { state.loading = value; events.push('loading'); },
    setIncoming(value) { state.incoming = value; events.push('incoming'); },
    setNotice(value) { notices.push(value); context.notice = value; events.push('notice'); },
    setError(value) { errors.push(value); context.error = value; events.push('error'); },
    setForm(value) { state.form = value; context.form = value; events.push('form'); }, setRecovery() {},
    load(user) { loads.push(user); events.push('load'); },
    authForm: { current: { querySelector(selector) {
      assert.equal(selector, 'input:not([disabled])'); queried++; return { focus() { focused++; } };
    } } },
    h: (tag, props, ...children) => ({ tag, props, children }), error: '', notice: '', form: null,
    fetch() { throw new Error('Network is forbidden in confirmation-return checks.'); }, module: { exports: {} },
  });
  const cleanup = evaluate(startup, context)();
  return { location, calls, loads, errors, notices, events, replacements, state, epoch, backupReadGeneration, cleanup,
    get focused() { return focused; }, get queried() { return queried; },
    async resolve(value = guestReply) { resolve(value); await drain(); },
    async reject() { reject(new Error('Authored unavailable account reply')); await drain(); },
    homeError() { return evaluate(homeError, context); }, formError() { return evaluate(formError, context); },
    focus() { evaluate(focus, context)(); }, openLogin() { evaluate(showForm, context)('login'); },
  };
}

test('a failed confirmation return is scrubbed before status lookup and shown as a sanitized alert', async () => {
  const clean = 'https://trippin.example/?trip=authored-public&from=confirmation%20check';
  const h = harness(clean + '#error=access_denied&error_code=otp_expired&error_description=AUTHORED-PRIVATE-DESCRIPTION');
  assert.equal(h.location.href, clean); assert.deepEqual(h.replacements, ['/?trip=authored-public&from=confirmation%20check']);
  assert.ok(h.events.indexOf('scrub') < h.events.indexOf('request'));
  assert.deepEqual(h.calls, [{ action: 'session' }]); assert.equal(h.state.auth, null); assert.deepEqual(h.loads, []);
  assert.equal(h.errors.at(-1), failure); assert.deepEqual(h.notices, ['']); assert.equal(h.state.incoming, true);
  const rendered = h.homeError(); assert.equal(rendered.props.role, 'alert'); assert.equal(rendered.props.className, 'home-notice home-error');
  assert.deepEqual(rendered.children, [failure]);
  await h.resolve(); assert.equal(h.errors.at(-1), failure); assert.equal(h.state.auth.user, null);
  assert.deepEqual(h.loads, [null]); assert.equal(h.state.loading, false);
});

test('empty, hostile and unexpected provider errors never surface raw descriptions or fragment credentials', async () => {
  for (const fragment of ['#error=', '#error=unexpected&error_description=%3Cimg%20src=x%20onerror=alert(1)%3E',
    '#error=access_denied&access_token=AUTHORED-NOT-A-REAL-TOKEN&error_description=AUTHORED-SECRET']) {
    const h = harness('https://trippin.example/' + fragment);
    assert.equal(h.location.hash, ''); assert.equal(h.errors.at(-1), failure);
    assert.equal(h.homeError().children.join(''), failure); assert.deepEqual(h.calls, [{ action: 'session' }]);
    await h.resolve(); assert.deepEqual(h.loads, [null]);
  }
});

test('a credential fragment keeps confirmation guidance but cannot supply an authenticated account', async () => {
  const h = harness('https://trippin.example/?from=email#access_token=AUTHORED-NOT-A-REAL-TOKEN&refresh_token=AUTHORED-REFRESH');
  assert.equal(h.location.href, 'https://trippin.example/?from=email'); assert.deepEqual(h.errors, []);
  assert.deepEqual(h.notices, ['Return to Log in after confirming your email.']);
  assert.equal(h.state.auth, null); assert.deepEqual(h.loads, []); assert.deepEqual(h.calls, [{ action: 'session' }]);
  await h.resolve(); assert.equal(h.state.auth.user, null); assert.deepEqual(h.loads, [null]);
});

test('ordinary, shared-plan and public-trip URL intent stays byte-exact', async () => {
  for (const [href, incoming] of [
    ['https://trippin.example/?from=ordinary%20check#map=2', false],
    ['https://trippin.example/?from=shared%20check#plan=AUTHORED-OPAQUE-PLAN', true],
    ['https://trippin.example/?trip=authored-public&from=public%20check#section', true],
  ]) {
    const h = harness(href); assert.equal(h.location.href, href); assert.deepEqual(h.replacements, []);
    assert.deepEqual(h.errors, []); assert.deepEqual(h.notices, []); assert.equal(h.state.incoming, incoming);
    await h.resolve(); assert.equal(h.location.href, href);
  }
});

test('an existing verified session remains the only source of account identity after a failed return', async () => {
  const h = harness('https://trippin.example/#error=access_denied&user_id=AUTHORED-FORGED-IDENTITY');
  await h.resolve(verifiedReply);
  assert.strictEqual(h.state.auth, verifiedReply); assert.strictEqual(h.loads[0], verifiedReply.user);
  assert.deepEqual(h.calls, [{ action: 'session' }]); assert.equal(h.errors.at(-1), failure);
  assert.equal(h.state.uncertain, false); assert.equal(h.state.loading, false);
});

test('an unavailable account lookup retains uncertain-session handling without replaying credentials', async () => {
  const h = harness('https://trippin.example/#error=access_denied'); await h.reject();
  assert.equal(h.location.hash, ''); assert.equal(h.state.uncertain, true); assert.equal(h.state.loading, false);
  assert.match(h.errors.at(-1), /Account status could not be checked/); assert.deepEqual(h.loads, [null]);
  assert.deepEqual(h.calls, [{ action: 'session' }]);
});

test('unmount fences late lookup success and failure after the confirmation message is handled', async () => {
  for (const outcome of ['resolve', 'reject']) {
    const h = harness('https://trippin.example/#error=access_denied');
    h.cleanup(); const events = h.events.slice(); assert.equal(h.epoch.current, 8);
    await h[outcome](verifiedReply);
    assert.deepEqual(h.events, events); assert.deepEqual(h.loads, []); assert.equal(h.state.auth, null);
    assert.equal(h.errors.at(-1), failure); assert.equal(h.state.loading, true);
  }
});

test('opening Log in retains the sanitized error in the existing dialog and focuses its first field', async () => {
  const h = harness('https://trippin.example/#error=access_denied'); await h.resolve();
  h.focus(); assert.equal(h.queried, 0); assert.equal(h.focused, 0); assert.equal(h.state.form, null);
  h.openLogin(); h.focus();
  assert.equal(h.state.form, 'login'); assert.equal(h.backupReadGeneration.current, 4);
  assert.equal(h.queried, 1); assert.equal(h.focused, 1);
  const rendered = h.formError(); assert.equal(rendered.props.role, 'alert'); assert.equal(rendered.props.className, 'form-error');
  assert.deepEqual(rendered.children, [failure]); assert.deepEqual(h.calls, [{ action: 'session' }]);
});
