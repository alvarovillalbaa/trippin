// T2: actual map-switch callbacks with authored React/ref/scroll boundaries.
// No layout, native focus, browser, Leaflet, provider, tile, server or network
// operation executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const source = readFileSync(new URL('../../components/workspace.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Workspace');
assert.ok(component?.body);
const toggle = component.body.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations)
  .find(node => ts.isIdentifier(node.name) && node.name.text === 'toggleMobileMap')?.initializer;
assert.ok(toggle && ts.isArrowFunction(toggle), 'Use the actual mobile map switch.');
const effects = component.body.statements.filter(ts.isExpressionStatement).map(node => node.expression)
  .filter(node => ts.isCallExpression(node) && node.expression.getText(ast) === 'useLayoutEffect'
    && node.arguments[1] && ts.isArrayLiteralExpression(node.arguments[1])
    && node.arguments[1].elements.some(item => ts.isIdentifier(item) && item.text === 'mobileMap')
    && node.arguments[0]?.getText(ast).includes('mapSwitchRequested'));
assert.equal(effects.length, 1, 'Use the actual post-render map-switch handoff.');
function attribute(element, name) {
  return element.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name)?.initializer;
}
function literal(element, name) {
  const value = attribute(element, name); return value && ts.isStringLiteral(value) ? value.text : undefined;
}
function expression(element, name) {
  const value = attribute(element, name); return value && ts.isJsxExpression(value) ? value.expression : undefined;
}
const controls = [];
function visit(node) {
  if (ts.isJsxOpeningElement(node)) controls.push(node);
  ts.forEachChild(node, visit);
}
visit(component);
const switchButton = controls.filter(node => literal(node, 'className') === 'mobile-map-toggle primary');
assert.equal(switchButton.length, 1);
const expanded = expression(switchButton[0], 'aria-expanded');
assert.ok(expanded, 'The visible switch exposes its map state.');
const controlledId = literal(switchButton[0], 'aria-controls');
assert.ok(controlledId);
const panel = controls.filter(node => literal(node, 'id') === controlledId);
assert.equal(panel.length, 1, 'The switch controls the actual map container.');
assert.match(expression(panel[0], 'className')?.getText(ast) || '', /show-mobile-map/);
const workspace = controls.filter(node => literal(node, 'className') === 'trip-workspace');
assert.equal(workspace.length, 1);
assert.equal(expression(workspace[0], 'ref')?.getText(ast), 'tripPanels');
assert.equal(expression(switchButton[0], 'onClick')?.getText(ast), 'toggleMobileMap');
function compile(text) {
  const compiled = ts.transpileModule(text, {
    fileName: 'actual-workspace-map.ts', reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  return new vm.Script(compiled.outputText);
}
const script = compile(`api.toggle = ${toggle.getText(ast)}; api.settle = ${effects[0].arguments[0].getText(ast)}; api.expanded = () => (${expanded.getText(ast)});`);
function harness(initial = false) {
  const scrolls = [], focuses = [], changes = [], button = { id: 'authored-switch' }, api = {};
  const document = { activeElement: button };
  const pane = { scrollIntoView: options => scrolls.push(options.block), focus() { focuses.push('panel'); document.activeElement = pane; } };
  const scope = { api, mobileMap: initial, mapSwitchRequested: { current: false }, tripPanels: { current: pane }, document,
    setMobileMap(update) { scope.mobileMap = typeof update === 'function' ? update(scope.mobileMap) : update; changes.push(scope.mobileMap); },
    fetch() { throw new Error('Network is forbidden in map-switch checks.'); },
  };
  script.runInContext(vm.createContext(scope));
  return { api, scope, scrolls, focuses, changes, button, document };
}

test('showing the map records user intent and waits for the updated content before scrolling', () => {
  const h = harness(); h.api.toggle();
  assert.equal(h.scope.mobileMap, true); assert.equal(h.scope.mapSwitchRequested.current, true);
  assert.deepEqual(h.changes, [true]); assert.deepEqual(h.scrolls, []);
  h.api.settle(); assert.deepEqual(h.scrolls, ['start']); assert.equal(h.scope.mapSwitchRequested.current, false);
});

test('returning to the itinerary aligns its content without stealing the switch focus', () => {
  const h = harness(true); h.api.toggle(); h.api.settle();
  assert.equal(h.scope.mobileMap, false); assert.deepEqual(h.scrolls, ['start']);
  assert.deepEqual(h.focuses, []); assert.equal(h.document.activeElement, h.button);
  h.api.settle(); assert.deepEqual(h.scrolls, ['start']);
});

test('initial rendering and ordinary map resets never scroll without a user switch', () => {
  const h = harness(); h.api.settle(); h.scope.mobileMap = true; h.api.settle(); h.scope.mobileMap = false; h.api.settle();
  assert.deepEqual(h.scrolls, []); assert.deepEqual(h.focuses, []);
});

test('a disappearing itinerary container consumes switch intent without a stale later scroll', () => {
  const h = harness(); h.api.toggle(); const panel = h.scope.tripPanels.current;
  h.scope.tripPanels.current = null; assert.doesNotThrow(() => h.api.settle());
  assert.equal(h.scope.mapSwitchRequested.current, false);
  h.scope.tripPanels.current = panel; h.api.settle(); assert.deepEqual(h.scrolls, []);
});

test('the actual visible switch exposes the same state as the controlled map', () => {
  const h = harness(); assert.equal(h.api.expanded(), false);
  h.api.toggle(); assert.equal(h.api.expanded(), true);
  h.api.toggle(); assert.equal(h.api.expanded(), false);
});

const mapSource = readFileSync(new URL('../../components/trip-map.tsx', import.meta.url), 'utf8');
const mapAst = ts.createSourceFile('trip-map.tsx', mapSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(mapAst.parseDiagnostics.length, 0);
const mapControls = [];
function visitMap(node) { if (ts.isJsxOpeningElement(node)) mapControls.push(node); ts.forEachChild(node, visitMap); }
visitMap(mapAst);
const muted = mapControls.find(node => literal(node, 'className') === 'map-layers icon-button'); assert.ok(muted);
const pressed = expression(muted, 'aria-pressed'), muteClick = expression(muted, 'onClick'); assert.ok(pressed && muteClick);
const muteScript = compile(`api.pressed = () => (${pressed.getText(mapAst)}); api.toggle = ${muteClick.getText(mapAst)};`);
test('muted map colors expose their actual pressed state', () => {
  const api = {}, scope = { api, mode: 'street', setMode(value) { scope.mode = value; } };
  muteScript.runInContext(vm.createContext(scope)); assert.equal(api.pressed(), false);
  api.toggle(); assert.equal(api.pressed(), true); api.toggle(); assert.equal(api.pressed(), false);
});
