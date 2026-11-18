// T2: actual entry callbacks with authored focus/URL boundaries.
// No React mount, browser, account endpoint, cookies or network is exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const source = readFileSync(new URL('../../components/travel-app.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('travel-app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
let skip, focus;
function visit(node) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'a') {
    const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
    if (attributes.some(item => item.name.text === 'className' && item.initializer?.text === 'skip-link')) {
      assert.equal(skip, undefined, 'Use the unique landing skip link.');
      skip = attributes.find(item => item.name.text === 'onClick')?.initializer?.expression;
    }
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[1]?.getText(ast) === '[form]') focus = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(skip, 'Execute the actual skip callback.');
assert.ok(focus, 'Execute the actual form-mode focus effect.');
function callback(node, scope) {
  const result = ts.transpileModule(`module.exports = (${node.getText(ast)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const context = vm.createContext({ ...scope, module: { exports: {} } });
  new vm.Script(result.outputText).runInContext(context);
  return context.module.exports;
}

const lib = new URL('../../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib) && /^\.\/[\w-]+$/.test(specifier)) return next(new URL(specifier + '.ts', context.parentURL).href, context);
  return next(specifier, context);
} });
globalThis.fetch = () => { throw new Error('Network is forbidden in entry-navigation checks.'); };
const { createTrip, initialWorkspace, publicTripSnapshot, importSharedPlan } = await import('../../lib/trip.ts');
const authored = createTrip('lisbon', '2026-12-02', '2026-12-03', 'Authored shared itinerary');
const plan = Buffer.from(JSON.stringify(publicTripSnapshot(authored))).toString('base64');

for (const [name, href] of [
  ['private itinerary', `https://trippin.example/?from=authored%20check#plan=${plan}`],
  ['public itinerary', 'https://trippin.example/?trip=authored-public&from=authored%20check'],
  ['ordinary home', 'https://trippin.example/'],
]) test(`skipping navigation preserves the complete ${name} URL`, () => {
  const location = new URL(href);
  let focused = 0, prevented = false;
  const click = callback(skip, { document: { getElementById(id) {
    assert.equal(id, 'travel-content'); return { focus() { focused++; } };
  } } });
  click({ preventDefault() { prevented = true; } });
  if (!prevented) location.hash = '#travel-content'; // Native anchor default.
  assert.equal(focused, 1);
  assert.equal(location.href, href);
  if (name === 'private itinerary') {
    const result = importSharedPlan(initialWorkspace(), location.href);
    assert.equal(result.status, 'imported');
    assert.equal(result.workspace.trips[0].title, authored.title);
  }
});

for (const form of ['login', 'signup']) test(`switching to ${form} hands focus to its first enabled field`, () => {
  let focused = 0;
  callback(focus, { form, authForm: { current: { querySelector(selector) {
    assert.equal(selector, 'input:not([disabled])'); return { focus() { focused++; } };
  } } } })();
  assert.equal(focused, 1);
});

test('trip forms and closing account forms keep their own focus behavior', () => {
  for (const form of ['trip', null]) callback(focus, { form, authForm: { current: { querySelector() {
    assert.fail('An unrelated form must not move account focus.');
  } } } })();
  callback(focus, { form: 'login', authForm: { current: null } })();
});
