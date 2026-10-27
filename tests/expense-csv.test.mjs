// Pure frontend-data checks against both actual CSV APIs. No application,
// browser, filesystem corpus, provider, model or network operation executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const tripModule = new URL('../lib/trip.ts', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === './data' && context.parentURL === tripModule
      ? new URL('../lib/data.ts', import.meta.url).href : specifier, context);
  },
});
const { parseExpenseCsv: live } = await import(new URL('../lib/csv.ts', import.meta.url));
const { parseExpenseCsv: legacy } = await import(tripModule);
const defaultDate = '2026-11-03';
const header = 'title,amount,date,category';
const currencyCsv = currency => `${header},currency\nCoffee,4.50,${defaultDate},food,${currency}`;
const apis = [
  ['live', csv => live(csv)],
  ['legacy', csv => legacy(csv, defaultDate)],
];

test('both APIs reject explicit foreign currencies rather than treating them as EUR', () => {
  for (const [name, parse] of apis) {
    for (const currency of ['USD', 'usd', 'gBp', 'JPY']) {
      assert.throws(() => parse(currencyCsv(currency)), /EUR|currenc/i, `${name} must reject ${currency}`);
    }
  }
});

test('a declared but blank currency is rejected by both APIs', () => {
  for (const [name, parse] of apis) {
    for (const currency of ['', '   ']) {
      assert.throws(() => parse(currencyCsv(currency)), /EUR|currenc/i, `${name} must not guess a declared blank currency`);
    }
  }
});

test('trimmed mixed-case EUR is accepted without conversion', () => {
  for (const [name, parse] of apis) {
    const rows = parse(currencyCsv('  eUr  '));
    assert.equal(rows.length, 1, name);
    assert.equal(rows[0].title, 'Coffee');
    assert.equal(rows[0].amount, 4.5);
    assert.equal(rows[0].date, defaultDate);
    assert.equal(rows[0].category, 'food');
  }
});

test('the existing currency-free template remains valid and the live API stays ID-free', () => {
  const csv = `${header}\nCoffee,4.50,${defaultDate},food\n`;
  assert.deepEqual(live(csv), [{ title: 'Coffee', amount: 4.5, date: defaultDate, category: 'food' }]);
  const rows = legacy(csv, defaultDate);
  assert.equal(rows.length, 1);
  assert.match(rows[0].id, /^expense-/);
  assert.equal(rows[0].amount, 4.5);
});

test('reordered headers, BOM, CRLF, escaped quotes and quoted multiline titles remain valid', () => {
  const csv = '\uFEFFcurrency,category,date,amount,title\r\n'
    + `" eUr ",food,${defaultDate},4.50,"Coffee, ""with friends""\r\nand cake"\r\n`;
  for (const [name, parse] of apis) {
    const rows = parse(csv);
    assert.equal(rows.length, 1, name);
    assert.equal(rows[0].title, 'Coffee, "with friends"\r\nand cake');
    assert.equal(rows[0].amount, 4.5);
    assert.equal(rows[0].date, defaultDate);
    assert.equal(rows[0].category, 'food');
  }
});

test('the live 500,000-character input limit is retained at its boundary', () => {
  const prefix = `${header},notes\nCoffee,4.50,${defaultDate},food,`;
  const exact = prefix + 'x'.repeat(500_000 - prefix.length);
  assert.equal(exact.length, 500_000);
  assert.equal(live(exact)[0].title, 'Coffee');
  assert.throws(() => live(exact + 'x'), /500|smaller|large/i);
});

test('both APIs retain the 500-expense row limit', () => {
  const row = `Coffee,4.50,${defaultDate},food\n`;
  for (const [name, parse] of apis) {
    assert.equal(parse(`${header}\n${row.repeat(500)}`).length, 500, name);
    assert.throws(() => parse(`${header}\n${row.repeat(501)}`), /500/, name);
  }
});

test('the live API retains positive finite amounts up to 1,000,000', () => {
  for (const amount of ['0.01', '4.50', '1000000']) {
    assert.equal(live(`${header}\nCoffee,${amount},${defaultDate},food`)[0].amount, Number(amount));
  }
  for (const amount of ['0', '-1', '1000000.01', 'NaN', 'Infinity', '']) {
    assert.throws(() => live(`${header}\nCoffee,${amount},${defaultDate},food`), /amount|positive|Check/i, amount);
  }
});

test('the live API retains required real YYYY-MM-DD dates', () => {
  assert.equal(live(`${header}\nCoffee,4.50,2028-02-29,food`)[0].date, '2028-02-29');
  for (const date of ['2026-02-29', '2026-02-31', '2026-13-01', '03/11/2026', '']) {
    assert.throws(() => live(`${header}\nCoffee,4.50,${date},food`), /date|Check/i, date);
  }
  assert.throws(() => live('title,amount,category\nCoffee,4.50,food'), /header/i);
});

test('the live API still returns an unknown category for the workspace fallback', () => {
  const rows = live(`${header}\nCoffee,4.50,${defaultDate},authored-unknown-category`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, 'authored-unknown-category');
  assert.equal(Object.hasOwn(rows[0], 'id'), false);
});

test('the legacy API retains semicolons, description, default dates, IDs and its own size limit', () => {
  const csv = 'description;amount;category;currency\nCoffee;4,50;food;eur';
  const first = legacy(csv, defaultDate)[0];
  const second = legacy(csv, defaultDate)[0];
  assert.equal(first.title, 'Coffee');
  assert.equal(first.amount, 4.5);
  assert.equal(first.category, 'food');
  assert.equal(first.date, defaultDate);
  assert.match(first.id, /^expense-/);
  assert.notEqual(first.id, second.id);
  const prefix = `${header},notes\nCoffee,4.50,${defaultDate},food,`;
  const exact = prefix + 'x'.repeat(200_000 - prefix.length);
  assert.equal(legacy(exact, defaultDate).length, 1);
  assert.throws(() => legacy(exact + 'x', defaultDate), /200|smaller|large/i);
});

test('conflicting duplicate currency columns cannot hide USD behind a first EUR value', () => {
  const csv = `${header},currency, CURRENCY \nCoffee,4.50,${defaultDate},food,EUR,USD`;
  for (const [name, parse] of apis) {
    assert.throws(() => parse(csv), /duplicate|ambig|header|currenc|EUR/i, name);
  }
});

test('extra or missing fields cannot hide a conflicting or missing declared currency', () => {
  for (const [name, parse] of apis) {
    for (const row of [`Coffee,4.50,${defaultDate},food,EUR,USD`, `Coffee,4.50,${defaultDate},food`]) {
      assert.throws(() => parse(`${header},currency\n${row}`), /field|column|row|currenc|EUR/i, name);
    }
  }
});

test('a later foreign-currency row rejects the whole parse without replacing existing caller data', () => {
  const csv = `${header},currency\nCoffee,4.50,${defaultDate},food,EUR\nTrain,30,${defaultDate},transport,USD`;
  for (const [name, parse] of apis) {
    const existing = Object.freeze([{ id: 'authored-existing', title: 'Existing expense', amount: 12 }]);
    let prospective = existing;
    assert.throws(() => { prospective = [...existing, ...parse(csv)]; }, /EUR|currenc/i, name);
    assert.strictEqual(prospective, existing, 'Rejected rows never become a partial replacement result.');
    assert.deepEqual(existing, [{ id: 'authored-existing', title: 'Existing expense', amount: 12 }]);
  }
});
