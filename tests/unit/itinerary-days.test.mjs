// T2: actual day callbacks/attributes with authored keyboard and focus fixtures.
// No React mount, browser, provider, account, backend or network operation runs.
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
const declarations = component.body.statements.filter(ts.isVariableStatement)
  .flatMap(node => node.declarationList.declarations);
const selectDay = declarations.find(node => node.name.getText(ast) === 'selectDay')?.initializer;
const handleDayKey = declarations.find(node => node.name.getText(ast) === 'handleDayKey')?.initializer;
assert.ok(selectDay && handleDayKey, 'Execute both actual day controls.');

function attribute(node, name) {
  return node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name)?.initializer;
}
const tabs = [], panels = [], lists = [];
function visit(node) {
  if (ts.isJsxOpeningElement(node)) {
    const role = attribute(node, 'role')?.text;
    if (role === 'tab') tabs.push(node);
    if (role === 'tabpanel') panels.push(node);
    if (role === 'tablist') lists.push(node);
  }
  ts.forEachChild(node, visit);
}
visit(component);
assert.equal(tabs.length, 1, 'Use the actual mapped day tab.');
assert.equal(panels.length, 1, 'Use the actual timeline panel.');
assert.equal(lists.length, 1, 'Use the actual trip-day tab list.');
const tab = tabs[0], panel = panels[0];

const scripts = new WeakMap();
function evaluate(node, scope) {
  assert.ok(node, 'The actual callback or attribute must exist.');
  let script = scripts.get(node);
  if (!script) {
    const result = ts.transpileModule(`module.exports = (${node.getText(ast)});`, {
      fileName: 'actual-itinerary-days.ts', reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    assert.equal((result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
    script = new vm.Script(result.outputText);
    scripts.set(node, script);
  }
  const context = vm.createContext({ ...scope, module: { exports: {} } });
  script.runInContext(context);
  return context.module.exports;
}
function value(node, name, scope = {}) {
  const item = attribute(node, name);
  assert.ok(item, `Find the actual ${name} attribute.`);
  return ts.isStringLiteral(item) ? item.text : evaluate(item.expression, scope);
}
function harness(count = 31, start = 0) {
  let dayIndex = start, selected = 'authored-selected-stop';
  const changes = [], focus = [], queries = [];
  const trip = { days: Array.from({ length: count }, (_, index) => ({ id: `authored-day-${index}` })) };
  const choose = evaluate(selectDay, {
    setDayIndex(index) { changes.push(['day', index]); dayIndex = index; },
    setSelected(next) { changes.push(['selected', next]); selected = next; },
  });
  const keydown = evaluate(handleDayKey, { trip, selectDay: choose });
  const buttons = trip.days.map((_, index) => ({ focus() { focus.push(index); } }));
  const parentElement = { querySelectorAll(selector) {
    queries.push(selector); assert.equal(selector, '[role="tab"]'); return buttons;
  } };
  return {
    trip, changes, focus, queries, choose, keydown,
    get dayIndex() { return dayIndex; }, get selected() { return selected; },
    event(key, modifiers = {}) {
      let prevented = 0;
      return { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers,
        currentTarget: { parentElement }, preventDefault() { prevented++; }, get prevented() { return prevented; } };
    },
  };
}
function handled(h, key, from, target, modifiers = {}) {
  const event = h.event(key, modifiers);
  h.keydown(event, from);
  assert.equal(event.prevented, 1);
  assert.equal(h.dayIndex, target);
  assert.equal(h.selected, null);
  assert.deepEqual(h.changes, [['day', target], ['selected', null]]);
  assert.deepEqual(h.focus, [target]);
  assert.equal(h.queries.length, 1);
}

test('selecting any of 31 days or the single day clears the previously selected stop', () => {
  for (const count of [1, 31]) for (let index = 0; index < count; index++) {
    const h = harness(count);
    h.choose(index);
    assert.equal(h.dayIndex, index); assert.equal(h.selected, null);
    assert.deepEqual(h.changes, [['day', index], ['selected', null]]);
    assert.deepEqual(h.focus, []);
  }
});

test('ArrowRight visits every day and wraps the final day to the first', () => {
  for (let index = 0; index < 31; index++) handled(harness(31, index), 'ArrowRight', index, index === 30 ? 0 : index + 1);
  handled(harness(1), 'ArrowRight', 0, 0);
});

test('ArrowLeft visits every day and wraps the first day to the final day', () => {
  for (let index = 0; index < 31; index++) handled(harness(31, index), 'ArrowLeft', index, index === 0 ? 30 : index - 1);
  handled(harness(1), 'ArrowLeft', 0, 0);
});

test('Home and End select and focus the corresponding boundary from every day', () => {
  for (const count of [1, 31]) for (let index = 0; index < count; index++) {
    handled(harness(count, index), 'Home', index, 0);
    handled(harness(count, index), 'End', index, count - 1);
  }
});

test('Up, Down, Tab and other unhandled keys preserve state, focus and browser defaults', () => {
  for (const key of ['ArrowUp', 'ArrowDown', 'Tab', 'Enter', ' ', 'Escape', 'PageUp', 'PageDown', 'a']) {
    const h = harness(31, 15), event = h.event(key);
    h.keydown(event, 15);
    assert.equal(event.prevented, 0, key); assert.equal(h.dayIndex, 15, key);
    assert.equal(h.selected, 'authored-selected-stop', key);
    assert.deepEqual(h.changes, []); assert.deepEqual(h.focus, []); assert.deepEqual(h.queries, []);
  }
});

test('Alt, Control and Meta shortcuts stay untouched while Shift keeps ordinary day navigation', () => {
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    const h = harness(31, 15), event = h.event(key, { [modifier]: true });
    h.keydown(event, 15);
    assert.equal(event.prevented, 0, `${modifier} ${key}`); assert.equal(h.dayIndex, 15);
    assert.equal(h.selected, 'authored-selected-stop');
    assert.deepEqual(h.changes, []); assert.deepEqual(h.focus, []); assert.deepEqual(h.queries, []);
  }
  handled(harness(31, 15), 'ArrowRight', 15, 16, { shiftKey: true });
});

test('actual tab click and key callbacks pass their own mapped day index', () => {
  for (let i = 0; i < 31; i++) {
    const clicked = harness();
    value(tab, 'onClick', { i, selectDay: clicked.choose })();
    assert.equal(clicked.dayIndex, i); assert.equal(clicked.selected, null);
    const keyed = harness(31, i), event = keyed.event('ArrowRight');
    value(tab, 'onKeyDown', { i, handleDayKey: keyed.keydown })(event);
    assert.equal(keyed.dayIndex, i === 30 ? 0 : i + 1);
    assert.equal(event.prevented, 1);
    assert.deepEqual(keyed.focus, [keyed.dayIndex]);
  }
});

test('roving focus and selected state match the focusable timeline panel for all 31 days', () => {
  assert.equal(value(lists[0], 'aria-label'), 'Trip days');
  assert.equal(value(panel, 'id'), 'day-plan'); assert.equal(value(panel, 'tabIndex'), 0);
  for (const count of [1, 31]) for (let dayIndex = 0; dayIndex < count; dayIndex++) {
    let tabbable = 0, selectedId;
    for (let i = 0; i < count; i++) {
      const scope = { i, dayIndex };
      const selected = value(tab, 'aria-selected', scope), tabIndex = value(tab, 'tabIndex', scope);
      assert.equal(selected, i === dayIndex);
      assert.equal(tabIndex, i === dayIndex ? 0 : -1);
      assert.equal(value(tab, 'aria-controls', scope), value(panel, 'id'));
      if (tabIndex === 0) { tabbable++; selectedId = value(tab, 'id', scope); }
    }
    assert.equal(tabbable, 1);
    assert.equal(value(panel, 'aria-labelledby', { dayIndex }), selectedId);
  }
});
