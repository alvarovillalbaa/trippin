// T2: actual landing callbacks with authored file/storage/React boundaries.
// No React rendering, browser, Auth endpoint, provider or network is exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import vm from 'node:vm';
import { legacyWorkspace } from '../factories/legacy-workspace.mjs';

const require = createRequire(import.meta.url);
const ts = require(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const lib = new URL('../../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib) && /^\.\/[\w-]+$/.test(specifier)) return next(new URL(specifier + '.ts', context.parentURL).href, context);
  return next(specifier, context);
} });
const trip = await import('../../lib/trip.ts');
const accounts = await import('../../lib/account-workspace.ts');
const source = readFileSync(process.env.TRIPPIN_TRAVEL_SOURCE || new URL('../../components/travel-app.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('travel-app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length, 0);
const matches = [];
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === 'input') {
    const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
    const value = name => attributes.find(item => item.name.text === name)?.initializer?.expression;
    if (value('ref')?.getText(parsed) === 'backup') matches.push(value('onChange'));
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.equal(matches.length, 1, 'Use the actual landing backup callback.');
function compile(expression) {
  const compiled = ts.transpileModule(`module.exports = (${expression});`, {
    fileName: 'actual-travel-backup.ts', reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  return new vm.Script(compiled.outputText);
}
const script = compile(matches[0].getText(parsed));
const component = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'TravelApp');
const navigation = new Map(component.body.statements.filter(ts.isFunctionDeclaration)
  .filter(node => ['showForm', 'openSavedTrip', 'enter', 'create'].includes(node.name?.text))
  .map(node => [node.name.text, compile(node.getText(parsed))]));
function plan(name) {
  const value = legacyWorkspace();
  value.profile.name = name;
  return value;
}
function file(value) {
  const bytes = new TextEncoder().encode(trip.serializeWorkspace(value));
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { size: bytes.byteLength, arrayBuffer: () => promise,
    finish: () => resolve(bytes.slice().buffer), fail: () => reject(new Error('Authored delayed read failure')) };
}
function harness(initial = trip.initialWorkspace()) {
  const values = new Map(), writes = [], states = [], errors = [], views = [], forms = [];
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes.push({ key, value }); values.set(key, value); },
    removeItem: key => values.delete(key) };
  accounts.saveAccountWorkspace(storage, null, initial); writes.length = 0;
  const scope = { ...trip, ...accounts, localStorage: storage, auth: { user: null }, workspace: initial,
    epoch: { current: 0 }, backupReadGeneration: { current: 0 },
    working: { current: false }, Uint8Array, Error,
    setWorkspace: value => { states.push(value); scope.workspace = value; }, setInTrip: value => views.push(value),
    setForm: value => forms.push(value), setSharedPlan() {}, setRecovery() {},
    load: user => { const value = accounts.readAccountWorkspace(storage, user); scope.setWorkspace(value); return value; },
    setError: value => errors.push(value), module: { exports: {} },
    fetch() { throw new Error('Network is forbidden in this frontend check.'); } };
  const context = vm.createContext(scope); script.runInContext(context);
  const restore = context.module.exports, actions = {};
  for (const [name, driver] of navigation) { driver.runInContext(context); actions[name] = context.module.exports; }
  return { scope, storage, writes, states, errors, views, forms, actions,
    read(value, input = { files: value ? [value] : [], value: 'selected' }) { return { input, done: restore({ currentTarget: input }) }; } };
}

test('a slower earlier backup cannot overwrite the latest selected backup', async () => {
  const h = harness(), a = file(plan('Older selection')), b = file(plan('Latest selection'));
  const first = h.read(a), second = h.read(b);
  b.finish(); await second.done; const committed = h.storage.getItem(accounts.accountWorkspaceKey(null));
  a.finish(); await first.done;
  assert.equal(h.storage.getItem(accounts.accountWorkspaceKey(null)) === committed, true, 'The latest committed backup bytes must survive.');
  assert.equal(h.states.length, 1); assert.equal(h.states[0].profile.name, 'Latest selection');
});

test('an earlier failed read cannot replace a later success with an error', async () => {
  const h = harness(), a = file(plan('Older selection')), b = file(plan('Latest selection'));
  const first = h.read(a), second = h.read(b);
  b.finish(); await second.done; a.fail(); await first.done;
  assert.deepEqual(h.errors, ['']); assert.equal(h.states.length, 1);
});

test('an empty new file selection invalidates a pending older read', async () => {
  const h = harness(), a = file(plan('Cancelled selection')), first = h.read(a);
  await h.read(null).done; a.finish(); await first.done;
  assert.equal(h.writes.length, 0); assert.equal(h.states.length, 0); assert.equal(h.errors.length, 0);
});

test('an existing account epoch change refuses a late read before any write', async () => {
  const h = harness(), a = file(plan('Previous space')), first = h.read(a);
  h.scope.epoch.current++; a.finish(); await first.done;
  assert.equal(h.writes.length, 0); assert.equal(h.states.length, 0);
});

for (const form of ['trip', 'login', 'signup']) test(`opening the ${form} form cancels a late backup without replacing its draft`, async () => {
  const h = harness(), a = file(plan('Superseded backup')), first = h.read(a);
  h.actions.showForm(form); a.finish(); await first.done;
  assert.equal(h.writes.length, 0); assert.equal(h.states.length, 0);
  assert.deepEqual(h.forms, [form]); assert.deepEqual(h.views, []);
});

test('opening a saved trip preserves its selected identity after a delayed read', async () => {
  const initial = plan('Existing plans'), h = harness(initial), a = file(plan('Old backup')), first = h.read(a);
  h.actions.openSavedTrip(initial.trips.at(-1));
  const selected = h.scope.workspace.selectedTripId, count = h.states.length;
  a.finish(); await first.done;
  assert.equal(h.scope.workspace.selectedTripId, selected); assert.equal(h.states.length, count);
  assert.equal(h.writes.length, 0); assert.deepEqual(h.views, [true]);
});

test('entering existing trips invalidates the landing read before mounting their editor', async () => {
  const h = harness(plan('Saved plans')), a = file(plan('Old backup')), first = h.read(a);
  await h.actions.enter(); const opened = h.scope.workspace, count = h.states.length;
  a.finish(); await first.done;
  assert.equal(h.scope.workspace, opened); assert.equal(h.states.length, count);
  assert.equal(h.writes.length, 0); assert.deepEqual(h.views, [true]);
});

test('a newly saved trip survives an earlier pending backup', async () => {
  const h = harness(), a = file(plan('Old backup')), first = h.read(a);
  const created = structuredClone(plan('New trip').trips[0]); created.id = 'authored-created-trip';
  h.actions.create(created);
  const committed = h.storage.getItem(accounts.accountWorkspaceKey(null)), count = h.writes.length;
  a.finish(); await first.done;
  assert.equal(h.storage.getItem(accounts.accountWorkspaceKey(null)) === committed, true);
  assert.equal(h.writes.length, count); assert.equal(h.scope.workspace.selectedTripId, created.id);
});

test('a stale completion cannot clear a newer selection on the same file input', async () => {
  const h = harness(), a = file(plan('Old backup')), b = file(plan('New backup'));
  const input = { files: [a], value: 'old-file' }, first = h.read(a, input);
  input.files = [b]; input.value = 'new-file'; const second = h.read(b, input);
  a.finish(); await first.done; assert.equal(input.value, 'new-file');
  b.finish(); await second.done; assert.equal(input.value, '');
  assert.equal(h.states.length, 1); assert.equal(h.states[0].profile.name, 'New backup');
});

test('a refused durable write never opens or replaces the landing workspace', async () => {
  const h = harness(), a = file(plan('Unsaved backup')), previous = h.scope.workspace;
  h.storage.setItem = () => { throw new Error('Authored quota refusal'); };
  const first = h.read(a); a.finish(); await first.done;
  assert.equal(h.scope.workspace, previous); assert.deepEqual(h.views, []);
  assert.deepEqual(h.errors, ['Authored quota refusal']); assert.equal(first.input.value, '');
});
