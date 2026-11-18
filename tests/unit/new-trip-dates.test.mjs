// T2: actual date feedback and field callbacks with authored values.
// No React mount, browser, provider, account or network operation runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const lib = new URL('../../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib) && /^\.\/[\w-]+$/.test(specifier)) return next(new URL(specifier + '.ts', context.parentURL).href, context);
  return next(specifier, context);
} });
const { getTripDays } = await import('../../lib/trip.ts');
const ast = ts.createSourceFile('new-trip-form.tsx', readFileSync(new URL('../../components/new-trip-form.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'NewTripForm');
assert.ok(component?.body);
const memo = component.body.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations)
  .find(node => node.name.getText(ast) === 'dateRange')?.initializer?.arguments?.[0];
assert.ok(memo, 'Find the actual date feedback calculation.');
const dates = [], feedback = [];
const attribute = (node, name) => node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name)?.initializer;
const expression = (node, name) => attribute(node, name)?.expression;
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'input' && attribute(node, 'type')?.text === 'date') dates.push(node);
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'p' && expression(node.openingElement, 'id')?.getText(ast) === '`${id}-dates`') feedback.push(node);
  ts.forEachChild(node, visit);
}
visit(component);
assert.equal(dates.length, 2); assert.equal(feedback.length, 1, 'Use one actual range announcement.');
function evaluate(source, scope) {
  const compiled = ts.transpileModule('module.exports = (' + source + ');', {
    fileName: 'actual-new-trip-dates.tsx', reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
  });
  assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  const context = vm.createContext({ Error, ...scope, module: { exports: {} }, h: (tag, props, ...children) => ({ tag, props, children }) });
  new vm.Script(compiled.outputText).runInContext(context);
  return context.module.exports;
}
function check(startDate, endDate) {
  const scope = { startDate, endDate, getTripDays, id: 'authored-form' };
  const dateRange = evaluate(memo.getText(ast), scope)();
  const rendered = evaluate(feedback[0].getText(ast), { ...scope, dateRange });
  const fields = dates.map(node => ({
    invalid: evaluate(expression(node, 'aria-invalid').getText(ast), { dateRange }),
    describedBy: evaluate(expression(node, 'aria-describedby').getText(ast), scope),
  }));
  assert.equal(rendered.props.role, 'status');
  assert.equal(rendered.props.id, 'authored-form-dates');
  assert.deepEqual(fields.map(field => field.describedBy), ['authored-form-dates', 'authored-form-dates']);
  return { dateRange, text: rendered.children.join(''), fields };
}

test('the default weekend announces its valid inclusive day count without an error', () => {
  const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['localDate', 'upcomingWeekend'].includes(node.name?.text));
  const weekend = evaluate('() => { ' + helpers.map(node => node.getText(ast)).join('\n') + '; return upcomingWeekend(); }', {})();
  const result = check(weekend.start, weekend.end);
  assert.equal(result.dateRange.days, 4); assert.equal(result.dateRange.error, '');
  assert.equal(result.text, '4 days, ready to shape. Trips can be up to 31 days.');
  assert.deepEqual(result.fields.map(field => field.invalid), [false, false]);
});

test('incomplete date fields give guidance without declaring a range error', () => {
  for (const [start, end] of [['', '2026-11-20'], ['2026-11-20', ''], ['', '']]) {
    const result = check(start, end);
    assert.equal(result.dateRange.days, null); assert.equal(result.dateRange.error, '');
    assert.match(result.text, /^Choose your first and last day/);
    assert.deepEqual(result.fields.map(field => field.invalid), [false, false]);
  }
});

test('a last day before the first day announces the actual validation failure beside both fields', () => {
  const result = check('2026-11-23', '2026-11-20');
  assert.equal(result.dateRange.days, null); assert.match(result.text, /on or after/);
  assert.deepEqual(result.fields.map(field => field.invalid), [true, true]);
});

test('the 31-day limit distinguishes valid inclusive ranges from a 32-day selection', () => {
  const valid = check('2026-12-01', '2026-12-31');
  assert.equal(valid.dateRange.days, 31); assert.equal(valid.dateRange.error, '');
  const invalid = check('2026-12-01', '2027-01-01');
  assert.equal(invalid.dateRange.days, null); assert.match(invalid.text, /31 days or fewer/);
  assert.deepEqual(invalid.fields.map(field => field.invalid), [true, true]);
});

test('same-day and leap-day trips keep valid inclusive counts and singular wording', () => {
  const same = check('2026-11-20', '2026-11-20');
  assert.equal(same.dateRange.days, 1); assert.match(same.text, /^1 day, /);
  const leap = check('2028-02-28', '2028-03-01');
  assert.equal(leap.dateRange.days, 3); assert.equal(leap.dateRange.error, '');
});

test('editing either field preserves the other selected date', () => {
  for (const [index, target] of ['first', 'last'].entries()) {
    const changes = [];
    const change = evaluate(expression(dates[index], 'onChange').getText(ast), {
      setStartDate: value => changes.push(['first', value]), setEndDate: value => changes.push(['last', value]),
    });
    change({ target: { value: '2026-12-14' } });
    assert.deepEqual(changes, [[target, '2026-12-14']]);
  }
});
