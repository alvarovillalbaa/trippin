// T2: execute actual Workspace save/navigation/export callbacks and unload effect.
// Storage, location, downloads and React effects are authored boundaries; no
// browser, React mount, server, provider, account or network operation executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import vm from 'node:vm';
import { legacyWorkspace } from '../factories/legacy-workspace.mjs';

const ts = createRequire(import.meta.url)(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const lib = new URL('../../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib) && /^\.\/[\w-]+$/.test(specifier)) {
    return next(new URL(specifier + '.ts', context.parentURL).href, context);
  }
  return next(specifier, context);
} });
const trip = await import('../../lib/trip.ts');
const source = readFileSync(process.env.TRIPPIN_WORKSPACE_SOURCE || new URL('../../components/workspace.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Workspace');
assert.ok(component?.body, 'Find the actual Workspace component.');
const declarations = new Map(component.body.statements.filter(ts.isVariableStatement).flatMap(statement =>
  statement.declarationList.declarations.filter(node => ts.isIdentifier(node.name))
    .map(node => [node.name.text, node.initializer])));
const names = ['persistCurrentWorkspace', 'leaveWorkspace', 'leaveWithoutSaving', 'exportBackup'];
for (const name of names) assert.ok(declarations.get(name) && ts.isArrowFunction(declarations.get(name)), `Use the actual ${name} callback.`);
const navigation = new Map(), skips = [];
const destinations = new Map([['Trippin home', 'home'], ['Your trips', 'home'], ['Log out', 'logout'], ['Sign in', 'home'], ['Check account status', 'status']]);
function findControls(node) {
  if (ts.isJsxElement(node)) {
    const opening = node.openingElement;
    const attr = name => opening.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name)?.initializer;
    const literal = name => { const value = attr(name); return value && ts.isStringLiteral(value) ? value.text : undefined; };
    const click = attr('onClick'), callback = click && ts.isJsxExpression(click) ? click.expression : undefined;
    if (opening.tagName.getText(ast) === 'button') {
      const label = literal('aria-label') || node.children.filter(ts.isJsxText).map(child => child.text.trim()).filter(Boolean).join(' ');
      if (destinations.has(label)) {
        assert.ok(callback && ts.isArrowFunction(callback), `Find the actual ${label} navigation callback.`);
        assert.equal(navigation.has(label), false, `Navigation control ${label} must be unique.`);
        navigation.set(label, callback);
      }
    }
    if (opening.tagName.getText(ast) === 'a' && literal('className') === 'skip-link') {
      assert.ok(callback && ts.isArrowFunction(callback), 'Use the actual workspace skip callback.'); skips.push(callback);
    }
  }
  ts.forEachChild(node, findControls);
}
findControls(component);
assert.equal(navigation.size, destinations.size); assert.equal(skips.length, 1);
const returned = component.body.statements.find(ts.isReturnStatement)?.expression;
assert.ok(returned && ts.isJsxFragment(returned), 'The account status must remain outside the editor subtree.');
const editor = returned.children.find(node => ts.isJsxElement(node) && node.openingElement.attributes.properties.some(item =>
  ts.isJsxAttribute(item) && item.name.text === 'className' && item.initializer && ts.isStringLiteral(item.initializer)
    && item.initializer.text === 'app-shell consumer-workspace'));
assert.ok(editor, 'Find the actual editable workspace subtree.');
const editorAttribute = name => editor.openingElement.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name)?.initializer?.expression;
const inert = editorAttribute('inert'), busy = editorAttribute('aria-busy');
assert.ok(inert && busy, 'The editor exposes its pending account state.');
const status = returned.children.find(node => ts.isJsxExpression(node) && node.expression && ts.isBinaryExpression(node.expression)
  && node.expression.left.getText(ast) === 'accountBusy' && ts.isJsxElement(node.expression.right)
  && node.expression.right.openingElement.attributes.properties.some(item => ts.isJsxAttribute(item) && item.name.text === 'role'
    && item.initializer && ts.isStringLiteral(item.initializer) && item.initializer.text === 'status'));
assert.ok(status, 'The pending account live status is a sibling of the inert editor.');
const effects = component.body.statements.filter(ts.isExpressionStatement).map(node => node.expression)
  .filter(node => ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[1] && ts.isArrayLiteralExpression(node.arguments[1])
    && node.arguments[1].elements.some(item => ts.isIdentifier(item) && item.text === 'saveError')
    && node.arguments[0]?.getText(ast).includes('beforeunload'));
assert.equal(effects.length, 1, 'Use one actual save-error unload effect.');
function compile(text) {
  const compiled = ts.transpileModule(text, {
    fileName: 'actual-workspace-saving.ts', reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  return new vm.Script(compiled.outputText);
}
const script = compile(names.map(name => `const ${name} = ${declarations.get(name).getText(ast)};`).join('\n')
  + `\nObject.assign(api, { ${names.join(', ')} });`
  + `\napi.navigation = { ${[...navigation].map(([name, callback]) => `${JSON.stringify(name)}: ${callback.getText(ast)}`).join(', ')} };`
  + `\napi.skip = ${skips[0].getText(ast)};`
  + `\napi.editorState = () => ({ inert: ${inert.getText(ast)}, busy: ${busy.getText(ast)} });`);
const unloadScript = compile(`api.beforeUnloadEffect = ${effects[0].arguments[0].getText(ast)};`);
function plan(name = 'Authored initial traveler') {
  const value = legacyWorkspace(); value.profile.name = name;
  return value;
}
function harness(initial = plan()) {
  const storageKey = 'trippin.workspace.v2.guest';
  const values = new Map([[storageKey, trip.serializeWorkspace(initial, 0)]]);
  const settings = { storageMode: 'normal', historyThrows: false };
  const writes = [], replacements = [], notices = [], downloads = [], errors = [], trace = [], departures = [], focused = [];
  const listeners = new Map(), registrations = [], removals = [], api = {};
  let href = 'https://trippin.example.test/?reference=keep#plan=authored';
  const location = { get href() { return href; }, get hash() { return new URL(href).hash; } };
  const history = { state: { authored: true }, replaceState(state, title, target) {
    trace.push('replace');
    if (settings.historyThrows) throw new Error('Authored history refusal');
    href = new URL(target, href).href; replacements.push(href);
  } };
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, serialized) {
      trace.push('write'); writes.push({ key, serialized });
      if (settings.storageMode === 'quota') throw new Error('Authored quota refusal');
      if (settings.storageMode !== 'silent') values.set(key, serialized);
    },
  };
  const scope = {
    ...trip, api, storageKey, localStorage, URL, Error,
    state: initial, workspaceRef: { current: { workspace: initial } },
    pendingPlan: { current: null }, pendingExit: { current: null }, pendingTripEdit: { current: null }, tripEditPending: false, saveError: '', leaveRequested: false,
    departureGeneration: { current: 0 }, backupReadGeneration: { current: 0 }, ready: true, accountBusy: false,
    backupInput: { current: { value: 'selected-backup.json' } }, fileInput: { current: { value: 'selected-expenses.csv' } },
    setSaveError: value => { errors.push(value); scope.saveError = value; },
    setError: value => errors.push(value),
    setLeaveRequested: value => { scope.leaveRequested = value; },
    setToast: value => notices.push(value), notify: value => notices.push(value),
    download: (name, data, type) => downloads.push({ name, data, type }),
    onHome: () => departures.push('home'), onLogout: () => departures.push('logout'), onCheckAccount: () => departures.push('status'),
    document: { getElementById: id => ({ focus() { focused.push(id); } }) },
    window: { location, history,
      addEventListener(type, listener) { registrations.push({ type, listener }); listeners.set(type, listener); },
      removeEventListener(type, listener) { removals.push({ type, listener }); if (listeners.get(type) === listener) listeners.delete(type); },
    },
    fetch() { throw new Error('Network is forbidden in workspace-saving checks.'); },
  };
  const context = vm.createContext(scope); script.runInContext(context); unloadScript.runInContext(context);
  return { api, scope, settings, values, storageKey, writes, replacements, notices, downloads, errors, trace, departures, focused,
    listeners, registrations, removals, get href() { return href; }, set href(value) { href = value; },
    pending() { scope.pendingPlan.current = { tripId: scope.workspaceRef.current.workspace.trips[0].id, hash: '#plan=authored' }; },
    edit(name = 'Authored latest traveler') { const value = structuredClone(scope.workspaceRef.current.workspace); value.profile.name = name; scope.workspaceRef.current.workspace = value; return value; },
  };
}
const generations = h => [h.scope.departureGeneration.current, h.scope.backupReadGeneration.current];

for (const mode of ['quota', 'silent']) test(`${mode} storage refusal keeps durable data, pending link and persistent save error`, () => {
  const h = harness(), before = h.values.get(h.storageKey), latest = h.edit(); h.pending();
  h.settings.storageMode = mode;
  assert.equal(h.api.persistCurrentWorkspace(), 'unsaved');
  assert.equal(h.values.get(h.storageKey), before);
  assert.equal(h.scope.workspaceRef.current.workspace, latest);
  assert.ok(h.scope.saveError.length > 0);
  assert.equal(h.replacements.length, 0); assert.match(h.href, /#plan=authored$/);
  assert.equal(h.scope.pendingPlan.current.tripId, latest.trips[0].id);
  assert.deepEqual(generations(h), [0, 0]);
});

test('retry saves the newest in-memory edits and clears the save error only after durable success', () => {
  const h = harness(); h.settings.storageMode = 'quota'; h.edit('First unsaved edit');
  assert.equal(h.api.persistCurrentWorkspace(), 'unsaved');
  const latest = h.edit('Newer edit made before retry'); h.settings.storageMode = 'normal';
  assert.equal(h.api.persistCurrentWorkspace(), 'saved');
  assert.equal(h.values.get(h.storageKey), trip.serializeWorkspace(latest, 0));
  assert.equal(h.scope.saveError, '');
  assert.deepEqual(generations(h), [0, 0]);
});

test('a shared fragment is consumed only after the current workspace is saved', () => {
  const h = harness(); const latest = h.edit(); h.pending();
  assert.equal(h.api.persistCurrentWorkspace(), 'saved');
  assert.equal(h.values.get(h.storageKey), trip.serializeWorkspace(latest, 0));
  assert.deepEqual(h.trace, ['write', 'replace']);
  assert.equal(h.href, 'https://trippin.example.test/?reference=keep');
  assert.equal(h.scope.pendingPlan.current, null);
});

test('saving a pending import preserves a newer, different URL fragment', () => {
  const h = harness(); h.edit(); h.pending(); h.href = 'https://trippin.example.test/?reference=keep#newer-intent';
  assert.equal(h.api.persistCurrentWorkspace(), 'saved');
  assert.equal(h.replacements.length, 0);
  assert.equal(h.href, 'https://trippin.example.test/?reference=keep#newer-intent');
  assert.equal(h.scope.pendingPlan.current, null);
});

test('a history refusal retains the shared link without misreporting a failed durable save', () => {
  const h = harness(), latest = h.edit(); h.pending(); h.settings.historyThrows = true;
  assert.equal(h.api.persistCurrentWorkspace(), 'link-retained');
  assert.equal(h.values.get(h.storageKey), trip.serializeWorkspace(latest, 0));
  assert.equal(h.scope.saveError, ''); assert.match(h.href, /#plan=authored$/);
});

test('navigation is blocked when its fresh save attempt fails', () => {
  const h = harness(); h.edit(); h.settings.storageMode = 'quota'; let departures = 0;
  h.api.leaveWorkspace(() => { departures++; });
  assert.equal(h.writes.length, 1); assert.equal(departures, 0);
  assert.ok(h.scope.saveError); assert.equal(h.scope.leaveRequested, true);
  assert.equal(typeof h.scope.pendingExit.current, 'function');
  assert.deepEqual(generations(h), [0, 0]);
});

test('navigation saves the latest edits before handing control to its destination', () => {
  const h = harness(), latest = h.edit(); let departures = 0;
  h.api.leaveWorkspace(() => {
    assert.equal(h.values.get(h.storageKey), trip.serializeWorkspace(latest, 0));
    assert.deepEqual(generations(h), [1, 1]); departures++;
  });
  assert.equal(departures, 1); assert.equal(h.scope.saveError, '');
});

test('saved data with an uncleared shared link still permits navigation', () => {
  const h = harness(); h.pending(); h.settings.historyThrows = true; let departures = 0;
  h.api.leaveWorkspace(() => { departures++; });
  assert.equal(departures, 1); assert.equal(h.scope.saveError, '');
  assert.deepEqual(generations(h), [1, 1]);
});

test('leaving without saving requires a pending navigation request and one explicit follow-up action', () => {
  const h = harness(); h.api.leaveWithoutSaving();
  assert.equal(h.writes.length, 0); assert.equal(h.scope.pendingExit.current, null);
  assert.deepEqual(generations(h), [0, 0]);
  h.edit(); h.settings.storageMode = 'quota'; const destinations = [];
  h.api.leaveWorkspace(() => destinations.push('earlier destination'));
  h.api.leaveWorkspace(() => destinations.push('latest destination'));
  assert.deepEqual(destinations, []); const count = h.writes.length, warning = h.scope.saveError;
  assert.deepEqual(generations(h), [0, 0]);
  h.api.leaveWithoutSaving();
  assert.deepEqual(destinations, ['latest destination']);
  assert.equal(h.writes.length, count); assert.equal(h.scope.saveError, warning);
  assert.equal(h.scope.pendingExit.current, null); assert.equal(h.scope.leaveRequested, false);
  assert.deepEqual(generations(h), [1, 1]);
  h.api.leaveWithoutSaving(); assert.deepEqual(destinations, ['latest destination']);
  assert.deepEqual(generations(h), [1, 1]);
});

test('a successful retry cancels the stale request to leave without saving', () => {
  const h = harness(); h.edit(); h.settings.storageMode = 'quota'; let departures = 0;
  h.api.leaveWorkspace(() => { departures++; });
  assert.equal(h.scope.leaveRequested, true);
  h.settings.storageMode = 'normal'; h.edit('Latest saved retry');
  assert.equal(h.api.persistCurrentWorkspace(), 'saved');
  assert.equal(h.scope.pendingExit.current, null); assert.equal(h.scope.leaveRequested, false);
  h.api.leaveWithoutSaving(); assert.equal(departures, 0);
  assert.deepEqual(generations(h), [0, 0]);
});

test('file selections clear only on actual departure, before saved or explicit destination handoff', () => {
  const h = harness(), selections = () => [h.scope.backupInput.current.value, h.scope.fileInput.current.value];
  const selected = ['selected-backup.json', 'selected-expenses.csv'];
  h.api.leaveWithoutSaving(); assert.deepEqual(selections(), selected);
  h.edit(); h.settings.storageMode = 'quota'; let departures = 0;
  const destination = () => { assert.deepEqual(selections(), ['', '']); departures++; };
  h.api.leaveWorkspace(destination); assert.deepEqual(selections(), selected); assert.equal(departures, 0);
  h.settings.storageMode = 'normal'; assert.equal(h.api.persistCurrentWorkspace(), 'saved');
  assert.deepEqual(selections(), selected);
  h.api.leaveWithoutSaving(); assert.deepEqual(selections(), selected); assert.equal(departures, 0);
  h.api.leaveWorkspace(destination); assert.deepEqual(selections(), ['', '']); assert.equal(departures, 1);
  h.scope.backupInput.current.value = selected[0]; h.scope.fileInput.current.value = selected[1];
  h.edit('Another unsaved edit'); h.settings.storageMode = 'quota'; h.api.leaveWorkspace(destination);
  assert.deepEqual(selections(), selected); assert.equal(departures, 1);
  h.api.leaveWithoutSaving(); assert.deepEqual(selections(), ['', '']); assert.equal(departures, 2);
});

for (const [label, destination] of destinations) test(`${label} actually uses the save guard before leaving its workspace`, () => {
  const h = harness(); h.edit(); h.settings.storageMode = 'quota';
  h.api.navigation[label]();
  assert.equal(h.writes.length, 1); assert.deepEqual(h.departures, []);
  assert.equal(h.scope.leaveRequested, true);
  assert.deepEqual(generations(h), [0, 0]);
  h.api.leaveWithoutSaving(); assert.deepEqual(h.departures, [destination]);
  assert.deepEqual(generations(h), [1, 1]);
});

test('export uses the latest memory state without treating a download as a durable save', () => {
  const h = harness(), before = h.values.get(h.storageKey);
  h.settings.storageMode = 'quota'; h.edit('Unsaved before export');
  h.api.persistCurrentWorkspace(); const warning = h.scope.saveError, count = h.writes.length;
  const latest = h.edit('Latest exported changes'); h.api.exportBackup();
  assert.equal(h.downloads.length, 1);
  const exported = trip.parseWorkspaceBackup(new TextEncoder().encode(h.downloads[0].data));
  assert.deepEqual(exported, latest);
  assert.equal(h.scope.saveError, warning); assert.equal(h.values.get(h.storageKey), before);
  assert.equal(h.writes.length, count); assert.equal(h.replacements.length, 0);
  assert.deepEqual(generations(h), [0, 0]);
});

test('a refused download preserves the save warning and does not navigate or retry storage', () => {
  const h = harness(); h.edit(); h.settings.storageMode = 'quota'; h.api.persistCurrentWorkspace();
  const warning = h.scope.saveError, count = h.writes.length;
  h.scope.download = () => { throw new Error('Authored download refusal'); };
  h.api.exportBackup();
  assert.equal(h.scope.saveError, warning); assert.equal(h.writes.length, count);
  assert.deepEqual(h.departures, []); assert.equal(h.downloads.length, 0);
  assert.match(h.notices.at(-1), /Authored download refusal/);
  assert.deepEqual(generations(h), [0, 0]);
});

test('workspace skip navigation moves focus without consuming a pending shared fragment', () => {
  const h = harness(); h.pending(); const before = h.href;
  let prevented = false;
  h.api.skip({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.deepEqual(h.focused, ['main-content']);
  assert.equal(h.href, before); assert.equal(h.replacements.length, 0); assert.equal(h.writes.length, 0);
  assert.equal(h.scope.pendingPlan.current.hash, '#plan=authored');
  assert.deepEqual(generations(h), [0, 0]);
});

test('editor interaction is fenced while opening or awaiting an account reply', () => {
  const h = harness();
  for (const [ready, accountBusy, expected] of [[true, false, false], [false, false, true], [true, true, true], [false, true, true]]) {
    h.scope.ready = ready; h.scope.accountBusy = accountBusy;
    const actual = h.api.editorState();
    assert.equal(actual.inert, expected); assert.equal(actual.busy, expected);
  }
});

test('clean workspaces install no unload warning', () => {
  const h = harness();
  assert.equal(h.api.beforeUnloadEffect(), undefined);
  assert.equal(h.registrations.length, 0); assert.equal(h.listeners.size, 0);
});

test('pending manual admission requests an unload warning before a save error exists', () => {
  const h = harness(); h.scope.tripEditPending = true;
  const cleanup = h.api.beforeUnloadEffect();
  assert.equal(h.registrations.length, 1);
  let prevented = 0;
  const event = { returnValue: undefined, preventDefault() { prevented++; } };
  h.listeners.get('beforeunload')(event);
  assert.equal(prevented, 1); assert.equal(event.returnValue, '');
  cleanup(); assert.equal(h.listeners.size, 0);
});

test('a pending manual admission cannot be skipped by a fresh navigation save', () => {
  const h = harness(); h.scope.pendingTripEdit.current = { ticket: { requestId: 1 } };
  h.api.leaveWorkspace(() => h.departures.push('unexpected'));
  assert.deepEqual(h.departures, []); assert.equal(h.writes.length, 0);
  assert.equal(h.scope.leaveRequested, false); assert.match(h.errors.at(-1), /still being applied/);
});

test('unsaved-data unload warning prevents departure and removes its exact listener on cleanup', () => {
  const h = harness(); h.edit(); h.settings.storageMode = 'quota'; h.api.persistCurrentWorkspace();
  const cleanup = h.api.beforeUnloadEffect();
  assert.equal(typeof cleanup, 'function'); assert.equal(h.registrations.length, 1);
  assert.equal(h.registrations[0].type, 'beforeunload');
  let prevented = 0;
  const event = { returnValue: 'unset', preventDefault() { prevented++; } };
  h.listeners.get('beforeunload')(event);
  assert.equal(prevented, 1); assert.equal(event.returnValue, '');
  cleanup(); assert.equal(h.listeners.size, 0); assert.equal(h.removals.length, 1);
  assert.equal(h.removals[0].type, 'beforeunload');
  assert.equal(h.removals[0].listener, h.registrations[0].listener);
  h.settings.storageMode = 'normal'; assert.equal(h.api.persistCurrentWorkspace(), 'saved');
  assert.equal(h.api.beforeUnloadEffect(), undefined); assert.equal(h.registrations.length, 1);
});
