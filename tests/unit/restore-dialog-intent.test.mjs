// T2: actual restore/close/open/CSV callbacks and workspace commit effect.
// Authored file, React-state, modal and storage boundaries; no React mount or browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import vm from 'node:vm';
import { legacyWorkspace } from '../factories/legacy-workspace.mjs';

const ts = createRequire(import.meta.url)(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const lib = new URL('../../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib) && /^\.\/[\w-]+$/.test(specifier)) return next(new URL(specifier + '.ts', context.parentURL).href, context);
  return next(specifier, context);
} });
const tripApi = await import('../../lib/trip.ts');
const { parseExpenseCsv } = await import('../../lib/csv.ts');
const { createWorkspaceEditor, workspaceReducer } = await import('../../lib/workspace-state.ts');
const ast = ts.createSourceFile('workspace.tsx', readFileSync(new URL('../../components/workspace.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Workspace');
assert.ok(component?.body);
const declarations = component.body.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations);
const locals = new Map(declarations.filter(node => ts.isIdentifier(node.name)).map(node => [node.name.text, node.initializer]));
const categories = ast.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations)
  .find(node => node.name.getText(ast) === 'categories')?.initializer;
assert.ok(categories);
const states = declarations.filter(node => ts.isArrayBindingPattern(node.name) && ts.isCallExpression(node.initializer)
  && node.initializer.expression.getText(ast) === 'useState').map(node => [node.name.elements[0].name.text, node.name.elements[1].name.text]);
const refs = declarations.filter(node => ts.isIdentifier(node.name) && ts.isCallExpression(node.initializer)
  && node.initializer.expression.getText(ast) === 'useRef').map(node => [node.name.text, node.initializer.arguments[0]?.getText(ast)]);
const restoreCallbacks = [], gates = new Map();
function attribute(node, name) { return node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name)?.initializer?.expression; }
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'input' && attribute(node, 'ref')?.getText(ast) === 'backupInput') restoreCallbacks.push(attribute(node, 'onChange'));
  if (ts.isJsxExpression(node) && node.expression && ts.isBinaryExpression(node.expression)
    && node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    && (ts.isJsxElement(node.expression.right) || ts.isJsxSelfClosingElement(node.expression.right))) {
    const condition = node.expression.left.getText(ast);
    for (const modal of ['tripSettings', 'activity', 'booking', 'event']) if (condition.includes(`modal==='${modal}'`)) gates.set(modal, condition);
  }
  ts.forEachChild(node, visit);
}
visit(component);
assert.equal(restoreCallbacks.length, 1); assert.equal(gates.size, 4);
const commitEffects = component.body.statements.filter(ts.isExpressionStatement).map(node => node.expression)
  .filter(node => ts.isCallExpression(node) && node.expression.getText(ast) === 'useLayoutEffect'
    && node.arguments[0]?.getText(ast).includes('workspaceRef.current=workspaceEdit'));
assert.equal(commitEffects.length, 1, 'Use the actual committed workspace-ref effect.');
function compile(source) {
  const compiled = ts.transpileModule(source, { fileName: 'actual-restore-dialog-intent.ts', reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  return new vm.Script(compiled.outputText);
}
const names = ['close', 'open', 'beginCustomAlternative', 'importCsv'];
const script = compile(`const categories=${categories.getText(ast)};\n` + names.map(name => `const ${name}=${locals.get(name).getText(ast)};`).join('\n')
  + '\nObject.assign(api, {' + names.join(',') + ',restore:' + restoreCallbacks[0].getText(ast)
  + ',commit:' + commitEffects[0].arguments[0].getText(ast) + ',gates:{'
  + [...gates].map(([name, condition]) => JSON.stringify(name) + ':()=>Boolean(' + condition + ')').join(',') + '}});');
const plain = value => JSON.parse(JSON.stringify(value));
function delayedFile(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : tripApi.serializeWorkspace(value, 0));
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { size: bytes.byteLength, arrayBuffer: () => promise, finish: () => resolve(bytes.slice().buffer), fail: () => reject(new Error('Authored read failure')) };
}
function harness() {
  const initial = legacyWorkspace(), storageKey = 'trippin.workspace.v2.guest';
  let editor = createWorkspaceEditor(initial);
  const before = tripApi.serializeWorkspace(initial, 0), values = new Map([[storageKey, before]]);
  const settings = { storage: 'normal', management: false }, trace = [], notices = [], replacements = [], empty = [], api = {};
  const scope = { ...tripApi, parseExpenseCsv, Error, Uint8Array, api, storageKey,
    workspaceEdit: editor, state: editor.workspace, trip: editor.workspace.trips[0], initialState: initial,
    preserveManagement() { if (settings.management) throw new Error('Authored management refusal'); return []; },
    localStorage: { getItem: key => values.get(key) ?? null, setItem(key, value) {
      trace.push('write'); if (settings.storage === 'quota') throw new Error('Authored quota refusal');
      if (settings.storage !== 'silent') values.set(key, value);
    } },
    onEmpty(value) { trace.push('empty'); empty.push(plain(value)); },
    notify: value => notices.push(value),
    fetch() { throw new Error('Network is forbidden in restore intent checks.'); },
  };
  for (const [name, setter] of states) {
    scope[name] = null;
    scope[setter] = value => { scope[name] = typeof value === 'function' ? value(scope[name]) : value; if (name === 'modal' && value === null) trace.push('close'); };
  }
  for (const [name, initialValue] of refs) {
    scope[name] = { current: initialValue === 'workspaceEdit' ? editor : initialValue === 'true' ? true : initialValue === 'false' ? false : /^\d+$/.test(initialValue || '') ? Number(initialValue) : null };
  }
  scope.fileInput.current = { value: 'authored-expenses.csv' };
  scope.setState = update => {
    trace.push(typeof update === 'function' ? 'update' : 'replace');
    editor = workspaceReducer(editor, { type: 'update', update });
    scope.workspaceEdit = editor; scope.state = editor.workspace; scope.trip = editor.workspace.trips.find(item => item.id === editor.workspace.selectedTripId);
    if (typeof update !== 'function') replacements.push(plain(editor.workspace));
    api.commit();
  };
  scope.dispatchWorkspace = action => {
    editor = workspaceReducer(editor, action); scope.workspaceEdit = editor; scope.state = editor.workspace;
    scope.trip = editor.workspace.trips.find(item => item.id === editor.workspace.selectedTripId); api.commit();
  };
  const context = vm.createContext(scope); script.runInContext(context);
  function openDraft(kind) {
    if (kind === 'activity' || kind === 'custom') scope.setEditing(editor.workspace.trips[0].days[0].activities[0]);
    if (kind === 'booking') scope.setEditingBooking(editor.workspace.trips[0].bookings[0]);
    if (kind === 'event') scope.setEventDraft({ id: 'authored-event-draft', title: 'Old event draft' });
    api.open(kind === 'custom' ? 'alternatives' : kind);
    if (kind === 'custom') api.beginCustomAlternative();
    scope.setError('Authored unsaved draft');
  }
  return { initial, before, scope, api, settings, trace, notices, replacements, empty, values,
    get editor() { return editor; }, openDraft,
    begin(file, input = { files: [file], value: 'authored-backup.json' }) { scope.backupInput.current = input; return api.restore({ currentTarget: input }); },
    restored() { const value = plain(initial); value.profile.name = 'Restored traveler'; value.trips[0].title = 'Same-ID restored trip'; value.trips[0].budget = 777; return value; },
  };
}
function intent(h) {
  return { modal: h.scope.modal, editing: h.scope.editing, editingBooking: h.scope.editingBooking,
    customAlternativeFor: h.scope.customAlternativeFor, eventDraft: h.scope.eventDraft,
    ticket: h.scope.customAlternativeTicket.current, epoch: h.scope.modalEpoch.current, error: h.scope.error };
}

for (const kind of ['tripSettings', 'activity', 'booking', 'custom', 'event']) test(`a slow same-ID restore closes the ${kind} draft after verified persistence`, async () => {
  const h = harness(), restored = h.restored(), file = delayedFile(restored), done = h.begin(file);
  h.openDraft(kind); const oldEpoch = h.scope.modalEpoch.current;
  h.scope.pendingTripEdit.current = { ticket: { requestId: 77 }, onSuccess() { throw new Error('A replaced modal must not acknowledge its old edit.'); } };
  h.scope.setTripEditPending(true);
  assert.equal(h.api.gates[kind === 'custom' ? 'activity' : kind](), true);
  file.finish(); await done;
  assert.deepEqual(h.replacements, [restored]); assert.equal(h.values.get(h.scope.storageKey), tripApi.serializeWorkspace(restored, 0));
  assert.ok(h.trace.indexOf('write') < h.trace.indexOf('close')); assert.ok(h.trace.indexOf('close') < h.trace.indexOf('replace'));
  assert.equal(h.scope.modalEpoch.current, oldEpoch + 1);
  for (const value of [h.scope.modal, h.scope.editing, h.scope.editingBooking, h.scope.customAlternativeFor, h.scope.eventDraft, h.scope.customAlternativeTicket.current, h.scope.pendingTripEdit.current]) assert.equal(value, null);
  assert.equal(h.scope.tripEditPending, false);
  assert.equal(h.api.gates[kind === 'custom' ? 'activity' : kind](), false, 'The old child/form is outside its actual rendering condition.');
  assert.notEqual(h.editor.tripIdentities.get(restored.trips[0].id), 1);
});

test('successful empty restore also closes drafts before handing off the empty space', async () => {
  const h = harness(), restored = tripApi.initialWorkspace('Authored empty restore'), file = delayedFile(restored), done = h.begin(file);
  h.openDraft('booking'); file.finish(); await done;
  assert.deepEqual(h.empty, [restored]); assert.ok(h.trace.indexOf('write') < h.trace.indexOf('close')); assert.ok(h.trace.indexOf('close') < h.trace.indexOf('empty'));
  assert.equal(h.scope.editingBooking, null); assert.equal(h.replacements.length, 0);
});

test('invalid/read/management/write failures preserve the open draft and original workspace', async () => {
  for (const failure of ['invalid', 'read', 'management', 'quota', 'silent']) {
    const h = harness(), file = delayedFile(failure === 'invalid' ? '{broken' : h.restored()), done = h.begin(file);
    h.openDraft('custom'); const before = plain(intent(h));
    if (failure === 'management') h.settings.management = true;
    if (['quota', 'silent'].includes(failure)) h.settings.storage = failure;
    if (failure === 'read') file.fail(); else file.finish(); await done;
    assert.deepEqual(plain(intent(h)), before); assert.equal(h.trace.includes('close'), false);
    assert.equal(h.values.get(h.scope.storageKey), h.before); assert.equal(h.replacements.length, 0); assert.equal(h.empty.length, 0);
    assert.ok(h.notices.at(-1));
  }
});

test('a stale earlier read cannot close a draft while the latest read is pending', async () => {
  const h = harness(), old = delayedFile(h.restored()), latest = delayedFile('{broken');
  const first = h.begin(old), second = h.begin(latest); h.openDraft('tripSettings');
  const before = plain(intent(h)); old.finish(); await first;
  assert.deepEqual(plain(intent(h)), before); assert.equal(h.trace.includes('close'), false); assert.equal(h.replacements.length, 0);
  latest.finish(); await second; assert.deepEqual(plain(intent(h)), before); assert.equal(h.values.get(h.scope.storageKey), h.before);
});

test('ordinary CSV arrival and functional edits keep the draft and its trip identity open', async () => {
  const h = harness(); h.openDraft('custom'); const before = plain(intent(h)), identity = h.editor.tripIdentities.get(h.initial.trips[0].id);
  await h.api.importCsv({ text: async () => 'title,amount,date,category\nAuthored arrival,4.50,' + h.initial.trips[0].startDate + ',food\n' });
  h.scope.setState(current => ({ ...current, profile: { ...current.profile, bio: 'Newer unrelated profile edit' } }));
  assert.deepEqual(plain(intent(h)), before); assert.equal(h.trace.includes('close'), false);
  assert.equal(h.editor.tripIdentities.get(h.initial.trips[0].id), identity);
  assert.equal(h.editor.workspace.trips[0].expenses.at(-1).title, 'Authored arrival');
  assert.equal(h.editor.workspace.profile.bio, 'Newer unrelated profile edit'); assert.equal(h.api.gates.activity(), true);
});
