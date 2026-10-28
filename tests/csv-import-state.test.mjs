// Actual Workspace arrows/effects with a controlled state-update queue. This
// adapter executes no React, DOM, browser, backend, model or network operation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const tripModule = new URL('../lib/trip.ts', import.meta.url).href;
const editorModule = new URL('../lib/workspace-state.ts', import.meta.url).href;
const managementModule = new URL('../lib/community-management.ts', import.meta.url).href;
const managementStorageModule = new URL('../lib/community-management-storage.ts', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === managementStorageModule && specifier === './community-management') {
      return nextResolve(managementModule, context);
    }
    if (context.parentURL === tripModule && specifier === './data') {
      return nextResolve(new URL('../lib/data.ts', import.meta.url).href, context);
    }
    if (context.parentURL === editorModule && ['./trip', './types', './csv'].includes(specifier)) {
      return nextResolve(new URL(`../lib/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const tripApi = await import(tripModule);
const csvApi = await import(new URL('../lib/csv.ts', import.meta.url));
const managementApi = await import(managementModule);
const managementStorageApi = await import(managementStorageModule);
const sourcePath = process.env.TRIPPIN_WORKSPACE_SOURCE
  || fileURLToPath(new URL('../components/workspace.tsx', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const ast = ts.createSourceFile('workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Workspace');
assert.ok(component?.body, 'Find the actual Workspace function.');
function declarations(statements) {
  return new Map(statements.filter(ts.isVariableStatement).flatMap(statement =>
    statement.declarationList.declarations.filter(item => ts.isIdentifier(item.name))
      .map(item => [item.name.text, item.initializer])));
}
const local = declarations(component.body.statements), moduleVariables = declarations(ast.statements);
const reducerMode = local.has('setState');
// The immutable old source has no editor module or reducer. Its real useState
// setter is the controlled boundary, not a missing-export test failure.
const editorApi = reducerMode ? await import(editorModule) : null;
if (reducerMode) {
  assert.equal(typeof editorApi.createWorkspaceEditor, 'function');
  assert.equal(typeof editorApi.workspaceReducer, 'function');
}
function arrow(name) {
  let value = local.get(name);
  if (value && ts.isCallExpression(value) && value.expression.getText(ast) === 'useCallback') value = value.arguments[0];
  assert.ok(value && ts.isArrowFunction(value), `Extract the actual ${name} arrow.`);
  return value.getText(ast);
}
function attribute(node, name) {
  return node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name);
}
const backupArrows = [];
function findBackup(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'input') {
    const ref = attribute(node, 'ref')?.initializer;
    if (ref && ts.isJsxExpression(ref) && ref.expression?.getText(ast) === 'backupInput') {
      const change = attribute(node, 'onChange')?.initializer;
      if (change && ts.isJsxExpression(change)) backupArrows.push(change.expression);
    }
  }
  ts.forEachChild(node, findBackup);
}
findBackup(component);
assert.equal(backupArrows.length, 1);
assert.ok(ts.isArrowFunction(backupArrows[0]));
const effects = [];
for (const statement of component.body.statements) {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
  const call = statement.expression;
  if (call.expression.getText(ast) !== 'useEffect' || !call.arguments[1] || !ts.isArrayLiteralExpression(call.arguments[1])) continue;
  const dependency = call.arguments[1].elements.map(value => value.getText(ast)).join(',');
  if (dependency === 'state,ready') effects.push({ kind: 'persist', arrow: call.arguments[0].getText(ast) });
  if (dependency === 'workspaceEdit.csvNotice') effects.push({ kind: 'notice', arrow: call.arguments[0].getText(ast) });
}
assert.equal(effects.filter(effect => effect.kind === 'persist').length, 1);
if (reducerMode) assert.deepEqual(effects.map(effect => effect.kind), ['notice', 'persist']);
const factorySource = `module.exports = (state, workspaceEdit) => {
  const trip = ${local.get('trip').getText(ast)};
  const categories = ${moduleVariables.get('categories').getText(ast)};
  const notify = ${arrow('notify')};
  const setState = ${reducerMode ? arrow('setState') : 'baselineStateSetter'};
  ${['refreshManagement', 'preserveManagement'].filter(name => local.has(name)).map(name => `const ${name} = ${arrow(name)};`).join('\n  ')}
  const updateTrip = ${arrow('updateTrip')};
  const importCsv = ${arrow('importCsv')};
  return { importCsv, updateTrip, setState,
    restore: ${backupArrows[0].getText(ast)},
    effects: [${effects.map(effect => `{kind:${JSON.stringify(effect.kind)}, run:${effect.arrow}}`).join(',')}]
  };
};`;
const compiled = ts.transpileModule(factorySource, {
  fileName: 'actual-csv-handlers.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
const factoryScript = new vm.Script(compiled.outputText, { filename: 'actual-workspace-csv.mocked.cjs' });

const plain = value => JSON.parse(JSON.stringify(value));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function sameWorkspace(actual, expected, message = 'The complete workspace must match.') {
  assert.equal(digest(actual), digest(expected), message);
}
function workspace(expenseCount = 0, tripCount = 2) {
  const value = tripApi.initialWorkspace(), template = value.trips[0];
  value.profile.name = 'Authored CSV owner';
  value.trips = Array.from({ length: tripCount }, (_, index) => ({
    ...structuredClone(template), id: `csv-owned-trip-${index}`, city: `Authored City ${index}`,
    isPublic: false, companions: [], joinRequests: [],
    expenses: Array.from({ length: index === 0 ? expenseCount : 0 }, (_, item) => ({
      id: `kept-expense-${index}-${item}`, title: `Kept expense ${item}`, amount: 1,
      date: template.startDate, category: 'other',
    })),
  }));
  value.selectedTripId = value.trips[0].id;
  assert.ok(tripApi.isWorkspace(value), 'The authored starting workspace must satisfy the real model.');
  return plain(value);
}
function nearLimitWorkspace() {
  const value = workspace(0, 9), template = value.trips[0].days[0].activities[0];
  for (const item of value.trips) {
    for (const day of item.days) day.activities = [];
    item.days[0].activities = Array.from({ length: 60 }, (_, index) => ({
      ...structuredClone(template), id: `csv-owned-stop-${index}`, description: '',
    }));
  }
  let remaining = 1_999_900 - JSON.stringify(value).length;
  for (const item of value.trips) for (const activity of item.days[0].activities) {
    const length = Math.min(4000, remaining);
    activity.description = 'x'.repeat(length);
    remaining -= length;
  }
  assert.equal(remaining, 0);
  assert.equal(JSON.stringify(value).length, 1_999_900);
  assert.ok(tripApi.isWorkspace(value));
  return value;
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function csvText(prefix, count) {
  return 'title,amount,date,category,currency\n' + Array.from({ length: count }, (_, index) =>
    `${prefix}-${index},2,2026-10-22,food,EUR\n`).join('');
}
function csvFile(prefix, count = 1, { gate, failure = false, text = csvText(prefix, count) } = {}) {
  return {
    name: `${prefix}.csv`, async text() {
      if (gate) await gate.promise;
      if (failure) throw new Error('Authored CSV read failure');
      return text;
    },
  };
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function editorSnapshot(editor) {
  return {
    workspace: digest(editor.workspace),
    identities: editor.tripIdentities ? [...editor.tripIdentities] : null,
    nextIdentity: editor.nextIdentity ?? null, notice: editor.csvNotice ?? null,
  };
}
function harness(initial = workspace()) {
  let editor = reducerMode ? editorApi.createWorkspaceEditor(plain(initial)) : { workspace: plain(initial) };
  let durable = JSON.stringify(initial), toast = '', failStorage = false;
  const queue = [], input = { files: [], value: '' }, backup = { files: [], value: '' };
  const calls = { notices: [], writes: [], transitions: [], effectOrder: [] };
  const key = 'trippin.workspace.v1';
  const forbidden = () => { throw new Error('A browser, provider, model or network boundary was called.'); };
  const setToast = message => { toast = String(message); calls.notices.push(toast); };
  const context = vm.createContext({
    ...tripApi, ...editorApi, ...managementApi, ...managementStorageApi, parseExpenseCsv: csvApi.parseExpenseCsv,
    baselineStateSetter: update => queue.push({ kind: 'update', update }),
    dispatchWorkspace: action => queue.push({ kind: 'action', action }),
    setToast, fileInput: { current: input }, csvReadGeneration: { current: 0 },
    backupInput: { current: backup }, backupReadGeneration: { current: 0 }, pendingPlan: { current: null },
    workspaceRef: { current: editor },
    setManagedTrips() {}, setManagementError() {},
    ready: true, storageKey: key, Uint8Array, TextEncoder, TextDecoder, Error, JSON,
    setDayIndex() {}, setSelected() {}, fetch: forbidden,
    localStorage: {
      length: 0,
      key() { return null; },
      getItem(storageKey) {
        if (storageKey === managementApi.COMMUNITY_MANAGEMENT_KEY) return null;
        assert.equal(storageKey, key); return durable;
      },
      setItem(storageKey, serialized) {
        assert.equal(storageKey, key);
        calls.writes.push(serialized);
        if (failStorage) throw new Error('Authored storage quota failure');
        durable = serialized;
      },
    },
    window: { location: { href: 'https://trippin.test/', hash: '' }, history: { state: null, replaceState: forbidden } },
    URL,
  });
  context.module = { exports: {} };
  factoryScript.runInContext(context);
  const render = () => {
    context.workspaceRef.current = editor;
    return context.module.exports(editor.workspace, editor);
  };
  function apply(before, entry) {
    if (reducerMode) return editorApi.workspaceReducer(before, entry.action);
    assert.equal(entry.kind, 'update');
    return { workspace: typeof entry.update === 'function' ? entry.update(before.workspace) : entry.update };
  }
  function flush({ replay = false } = {}) {
    const beforeBatch = editor;
    while (queue.length) {
      const entry = queue.shift(), before = editor;
      if (replay) {
        freeze(before.workspace);
        const untouched = editorSnapshot(before), notices = calls.notices.length, writes = calls.writes.length;
        const first = apply(before, entry), second = apply(before, entry);
        assert.deepEqual(editorSnapshot(first), editorSnapshot(second), 'Replaying an actual update against the same prestate must be deterministic.');
        assert.deepEqual(editorSnapshot(before), untouched, 'An actual reducer/updater must not mutate its input.');
        assert.equal(calls.notices.length, notices, 'No notification side effect belongs inside a replayable updater.');
        assert.equal(calls.writes.length, writes, 'No storage side effect belongs inside a replayable updater.');
        editor = second;
      } else editor = apply(before, entry);
      calls.transitions.push({ entry, before, after: editor });
    }
    if (beforeBatch === editor) return;
    for (const effect of render().effects) {
      const changed = effect.kind === 'notice'
        ? beforeBatch.csvNotice !== editor.csvNotice : beforeBatch.workspace !== editor.workspace;
      if (changed) { calls.effectOrder.push(effect.kind); effect.run(); }
    }
  }
  return {
    calls, input, render, flush,
    get workspace() { return editor.workspace; }, get editor() { return editor; },
    get durable() { return durable; }, get toast() { return toast; },
    start(file, from = render()) {
      input.files = [file]; input.value = file.name;
      return from.importCsv(file);
    },
    edit(update) { render().setState(update); flush(); },
    setStorageFailure() { failStorage = true; },
    async restore(value) {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      const file = { name: 'authored-restoration.json', size: bytes.byteLength, async arrayBuffer() { return bytes.slice().buffer; } };
      backup.files = [file]; backup.value = file.name;
      await render().restore({ target: backup, currentTarget: backup });
      flush();
    },
  };
}
const importedNotices = h => h.calls.notices.filter(message => /\bexpenses imported\b/i.test(message));
const target = h => h.workspace.trips.find(item => item.id === 'csv-owned-trip-0');
function durableMatches(h) { sameWorkspace(JSON.parse(h.durable), h.workspace, 'The durable workspace must match the accepted UI workspace.'); }
function accepted(h, value) { if (reducerMode) assert.equal(h.editor.csvNotice?.accepted, value); }

test('overlapping 980 plus 15 plus 15 reads accept only the first completion in either order', async () => {
  const scenarios = [];
  for (const order of [[0, 1], [1, 0]]) {
    const initial = workspace(980), h = harness(initial), captured = h.render();
    const gates = [deferred(), deferred()];
    const pending = gates.map((gate, index) => h.start(csvFile(`batch-${index}`, 15, { gate }), captured));
    gates[order[0]].resolve(); await pending[order[0]]; h.flush();
    const firstCount = target(h).expenses.length;
    gates[order[1]].resolve(); await pending[order[1]]; h.flush();
    scenarios.push({ initial, h, order, firstCount });
  }
  // Finish both schedules before asserting so a failing baseline exercises
  // both actual read-completion orders, not just the first failure.
  for (const { initial, h, order, firstCount } of scenarios) {
    assert.equal(firstCount, 995);
    assert.equal(target(h).expenses.length, 995);
    sameWorkspace(target(h).expenses.slice(0, 980), initial.trips[0].expenses);
    assert.ok(target(h).expenses.slice(980).every(row => row.title.startsWith(`batch-${order[0]}-`)));
    assert.equal(importedNotices(h).length, 1);
    assert.ok(h.calls.notices.some(message => /1,?000|limit|capacity/i.test(message)));
    assert.ok(tripApi.isWorkspace(h.workspace)); accepted(h, false); durableMatches(h);
  }
});

test('coalesced completed reads recheck each queued import against the state actually produced', async () => {
  const h = harness(workspace(980)), captured = h.render(), first = deferred(), second = deferred();
  const a = h.start(csvFile('first', 15, { gate: first }), captured);
  const b = h.start(csvFile('second', 15, { gate: second }), captured);
  first.resolve(); await a; second.resolve(); await b;
  h.flush();
  assert.equal(target(h).expenses.length, 995);
  assert.ok(target(h).expenses.slice(980).every(row => row.title.startsWith('first-')));
  assert.equal(importedNotices(h).length, 0, 'The coalesced final notice must report the rejected last request.');
  assert.match(h.toast, /1,?000|limit|capacity/i); accepted(h, false); durableMatches(h);
});

test('overlapping imports that both fit preserve both sets of rows once', async () => {
  const initial = workspace(980), h = harness(initial), captured = h.render(), first = deferred(), second = deferred();
  const a = h.start(csvFile('fits-a', 5, { gate: first }), captured);
  const b = h.start(csvFile('fits-b', 7, { gate: second }), captured);
  first.resolve(); second.resolve(); await Promise.all([a, b]); h.flush();
  assert.equal(target(h).expenses.length, 992);
  sameWorkspace(target(h).expenses.slice(0, 980), initial.trips[0].expenses);
  assert.equal(target(h).expenses.filter(row => row.title.startsWith('fits-a-')).length, 5);
  assert.equal(target(h).expenses.filter(row => row.title.startsWith('fits-b-')).length, 7);
  assert.equal(new Set(target(h).expenses.map(row => row.id)).size, 992);
  accepted(h, true); durableMatches(h);
});

test('a deleted target quietly preserves the remaining workspace instead of reporting import success', async () => {
  const h = harness(), gate = deferred(), pending = h.start(csvFile('deleted', 2, { gate }));
  h.edit(current => ({ ...current, trips: current.trips.slice(1), selectedTripId: current.trips[1].id }));
  const kept = plain(h.workspace), durable = h.durable, before = h.editor;
  gate.resolve(); await pending; h.flush();
  sameWorkspace(h.workspace, kept); assert.equal(h.durable, durable);
  assert.equal(importedNotices(h).length, 0); assert.equal(h.input.value, '');
  if (reducerMode) assert.equal(h.editor, before, 'A stale/missing identity returns the exact editor container.');
});

test('deleting an unrelated trip keeps the pending target identity usable', async () => {
  const h = harness(), gate = deferred(), pending = h.start(csvFile('retained-target', 2, { gate }));
  h.edit(current => ({ ...current, trips: [current.trips[0]] }));
  gate.resolve(); await pending; h.flush();
  assert.equal(h.workspace.trips.length, 1); assert.equal(target(h).expenses.length, 2);
  assert.equal(importedNotices(h).length, 1); accepted(h, true); durableMatches(h);
});

test('deleting then recreating the same trip ID does not revive its old import ticket', async () => {
  const h = harness(), gate = deferred(), pending = h.start(csvFile('old-incarnation', 2, { gate }));
  const replacement = plain(target(h)); replacement.title = 'Explicitly recreated trip';
  h.edit(current => ({ ...current, trips: current.trips.slice(1), selectedTripId: current.trips[1].id }));
  h.edit(current => ({ ...current, trips: [...current.trips, replacement], selectedTripId: replacement.id }));
  const expected = plain(h.workspace), before = h.editor;
  gate.resolve(); await pending; h.flush();
  sameWorkspace(h.workspace, expected); assert.equal(importedNotices(h).length, 0); durableMatches(h);
  if (reducerMode) assert.equal(h.editor, before);
});

test('pending imports preserve newer trip edits and append to their original target after selection changes', async () => {
  const h = harness(workspace(1)), gate = deferred(), pending = h.start(csvFile('original-target', 2, { gate }));
  h.edit(current => ({
    ...current, selectedTripId: current.trips[1].id,
    trips: current.trips.map((item, index) => index ? { ...item, title: 'Other trip also edited' } : {
      ...item, title: 'Newer title must survive', city: 'Updated target city',
      expenses: [...item.expenses, { ...item.expenses[0], id: 'concurrent-owned-expense', title: 'Concurrent expense' }],
    }),
  }));
  const edited = plain(h.workspace);
  gate.resolve(); await pending; h.flush();
  assert.equal(target(h).title, 'Newer title must survive'); assert.equal(target(h).city, 'Updated target city');
  sameWorkspace(target(h).expenses.slice(0, 2), edited.trips[0].expenses);
  assert.equal(target(h).expenses.length, 4);
  sameWorkspace(h.workspace.trips[1], edited.trips[1]);
  assert.equal(h.workspace.selectedTripId, edited.selectedTripId); accepted(h, true); durableMatches(h);
});

test('a target filled by a concurrent edit rejects the entire pending CSV import', async () => {
  const h = harness(workspace(980)), gate = deferred(), pending = h.start(csvFile('too-late', 15, { gate }));
  const full = workspace(1000).trips[0].expenses;
  h.edit(current => ({ ...current, trips: current.trips.map((item, index) => index ? item : { ...item, expenses: full }) }));
  const expected = plain(h.workspace);
  gate.resolve(); await pending; h.flush();
  sameWorkspace(h.workspace, expected); assert.equal(importedNotices(h).length, 0);
  assert.match(h.toast, /1,?000|limit|capacity/i); accepted(h, false); durableMatches(h);
});

test('an import exceeding the whole-workspace character limit is rejected atomically', async () => {
  const initial = nearLimitWorkspace(), h = harness(initial);
  await h.start(csvFile('x'.repeat(155), 10)); h.flush();
  sameWorkspace(h.workspace, initial);
  assert.equal(importedNotices(h).length, 0);
  assert.ok(h.toast.length > 0); accepted(h, false); durableMatches(h);
});

test('a successful actual backup restore invalidates a pending CSV even when its target ID survives', async () => {
  const h = harness(), gate = deferred(), pending = h.start(csvFile('before-restore', 2, { gate }));
  const restored = workspace(3); restored.profile.name = 'Restored authored owner';
  restored.trips[0].title = 'Replacement with the same scalar ID';
  await h.restore(restored);
  const notices = h.calls.notices.slice(), before = h.editor;
  gate.resolve(); await pending; h.flush();
  sameWorkspace(h.workspace, restored); assert.deepEqual(h.calls.notices, notices);
  assert.equal(importedNotices(h).length, 0); durableMatches(h);
  if (reducerMode) assert.equal(h.editor, before);
});

test('a pending CSV read error cannot overwrite feedback after actual backup replacement', async () => {
  const h = harness(), gate = deferred(), pending = h.start(csvFile('stale-read-error', 1, { gate, failure: true }));
  const restored = workspace(3); restored.profile.name = 'Restored before late read error';
  await h.restore(restored);
  const notices = h.calls.notices.slice(), before = h.editor;
  gate.resolve(); await pending; h.flush();
  sameWorkspace(h.workspace, restored); assert.deepEqual(h.calls.notices, notices); durableMatches(h);
  if (reducerMode) assert.equal(h.editor, before);
});

test('parser rejection preserves current data and permits reselecting the same filename', async () => {
  const initial = workspace(2), h = harness(initial);
  const invalid = csvFile('same-file', 1, { text: 'title,amount,date,category,currency\nRejected,4,2026-10-22,food,USD\n' });
  await h.start(invalid); h.flush();
  sameWorkspace(h.workspace, initial); durableMatches(h);
  assert.equal(importedNotices(h).length, 0); assert.equal(h.input.value, ''); accepted(h, false);
  await h.start(csvFile('same-file', 1)); h.flush();
  assert.equal(target(h).expenses.length, 3); assert.equal(h.input.value, '');
  assert.equal(importedNotices(h).length, 1); accepted(h, true); durableMatches(h);
});

test('file read rejection preserves current data and permits a same-file retry', async () => {
  const initial = workspace(2), h = harness(initial);
  await h.start(csvFile('read-retry', 1, { failure: true })); h.flush();
  sameWorkspace(h.workspace, initial); durableMatches(h);
  assert.equal(importedNotices(h).length, 0); assert.equal(h.input.value, ''); accepted(h, false);
  await h.start(csvFile('read-retry', 1)); h.flush();
  assert.equal(target(h).expenses.length, 3); assert.equal(h.input.value, '');
  assert.equal(importedNotices(h).length, 1); accepted(h, true); durableMatches(h);
});

test('older cleanup cannot clear the newer pending input and does not discard either valid import', async () => {
  const h = harness(), first = deferred(), second = deferred();
  const a = h.start(csvFile('older-input', 1, { gate: first }));
  const newer = csvFile('newer-input', 1, { gate: second }), b = h.start(newer);
  first.resolve(); await a; h.flush();
  const whileSecondPending = h.input.value;
  second.resolve(); await b; h.flush();
  assert.equal(whileSecondPending, newer.name);
  assert.equal(h.input.value, ''); assert.equal(target(h).expenses.length, 2);
  assert.deepEqual(target(h).expenses.map(row => row.title), ['older-input-0', 'newer-input-0']);
  durableMatches(h);
});

test('actual reducer or functional updater replay is deterministic and produces no commit side effects', async () => {
  const h = harness(workspace(2));
  await h.start(csvFile('replayed', 2));
  h.flush({ replay: true });
  assert.equal(target(h).expenses.length, 4);
  assert.equal(new Set(target(h).expenses.map(row => row.id)).size, 4);
  assert.equal(importedNotices(h).length, 1);
  if (reducerMode) assert.deepEqual(h.calls.effectOrder, ['notice', 'persist']);
  durableMatches(h);
});

test('the actual persistence effect leaves quota failure as the final visible notice', async () => {
  const initial = workspace(2), h = harness(initial), durable = h.durable;
  h.setStorageFailure();
  await h.start(csvFile('quota', 1)); h.flush();
  assert.equal(target(h).expenses.length, 3);
  assert.equal(h.durable, durable);
  assert.match(h.toast, /could not save|export.*backup/i);
  assert.ok(h.calls.writes.length > 0);
  if (reducerMode) assert.deepEqual(h.calls.effectOrder, ['notice', 'persist']);
});
