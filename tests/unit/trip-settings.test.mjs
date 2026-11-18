// T2: actual deletion callbacks and eligibility expression with authored state/storage.
// No React mount, DOM, browser, Auth, backend, provider or network operation runs.
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
const { persistWorkspace, serializeWorkspace, isWorkspace } = await import('../../lib/trip.ts');

function parse(path, name) {
  const ast = ts.createSourceFile(name + '.tsx', readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(component?.body, 'Find the actual ' + name + ' component.');
  return { ast, component };
}
const editor = parse(new URL('../../components/workspace.tsx', import.meta.url), 'Workspace');
const settings = parse(new URL('../../components/trip-settings.tsx', import.meta.url), 'TripSettings');
const deleteTrip = editor.component.body.statements.filter(ts.isVariableStatement)
  .flatMap(node => node.declarationList.declarations).find(node => node.name.getText(editor.ast) === 'deleteTrip')?.initializer;
const remove = settings.component.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'remove');
const published = settings.component.body.statements.filter(ts.isVariableStatement)
  .flatMap(node => node.declarationList.declarations).find(node => node.name.getText(settings.ast) === 'published')?.initializer;
const eligibility = [];
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(editor.ast) === 'TripSettings') {
    eligibility.push(node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === 'canDelete')?.initializer?.expression);
  }
  ts.forEachChild(node, visit);
}
visit(editor.component);
assert.equal(eligibility.length, 1, 'Use the actual settings deletion gate.');
assert.ok(deleteTrip && remove && published && eligibility[0]);
function compile(expression) {
  const compiled = ts.transpileModule(`module.exports = (${expression});`, {
    fileName: 'actual-trip-deletion.ts', reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  return new vm.Script(compiled.outputText);
}
const deletionScript = compile(deleteTrip.getText(editor.ast));
const removeScript = compile(remove.getText(settings.ast));
const eligibilityScript = compile(eligibility[0].getText(editor.ast));
const publishedScript = compile(published.getText(settings.ast));
function evaluate(script, scope) {
  // Both real components share one Error realm in the app; preserve it across VM callbacks.
  const context = vm.createContext({ Error, ...scope, module: { exports: {} } });
  script.runInContext(context);
  return context.module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
function harness({ count = 1, records = [], confirmed = true, publicTrip = false, publicationStatus, write = 'normal' } = {}) {
  const workspace = legacyWorkspace();
  workspace.trips = workspace.trips.slice(0, count);
  if (workspace.trips.length < count) {
    const copy = structuredClone(workspace.trips[0]); copy.id = 'other-private-trip'; workspace.trips.push(copy);
  }
  workspace.trips.forEach(trip => { trip.isPublic = false; });
  workspace.selectedTripId = workspace.trips[0].id;
  const trip = workspace.trips[0]; trip.isPublic = publicTrip;
  const workspaceEdit = { workspace, tripIdentities: new Map(workspace.trips.map((trip, index) => [trip.id, index + 1])) };
  const storageKey = 'trippin.workspace.guest.v2', before = serializeWorkspace(workspace, 0);
  const values = new Map([[storageKey, before], ['trippin.workspace.v1', 'preserved legacy bytes']]);
  const errors = [], emptied = [], writes = [], updates = [], events = [];
  const scope = {
    trip, workspaceEdit, workspaceRef: { current: workspaceEdit }, storageKey, persistWorkspace,
    preserveManagement: () => scope.records, records,
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem(key, value) { writes.push({ key, value }); if (write === 'throw') throw new Error('Authored quota failure'); if (write !== 'silent') values.set(key, value); },
    },
    onEmpty(value) { events.push('empty'); emptied.push(plain(value)); assert.equal(values.get(storageKey), serializeWorkspace(value, 0), 'Persist before handing the empty space to its owner.'); },
    setState: updater => updates.push(plain(updater(workspace))),
    setDayIndex() {}, setSelected() {}, close() {}, notify() {},
  };
  const parentDelete = evaluate(deletionScript, scope);
  const canDelete = evaluate(eligibilityScript, { state: workspace, managedTrips: records });
  const isPublished = evaluate(publishedScript, { trip, publicationStatus });
  const removeTrip = evaluate(removeScript, { published: isPublished, canDelete, deleteConfirmed: confirmed, setError: value => errors.push(value), onDelete: parentDelete });
  return { workspace, scope, values, storageKey, before, errors, emptied, writes, updates, events, canDelete, removeTrip, parentDelete };
}

test('the actual settings gate permits a last private trip with no management entries', () => {
  assert.equal(harness().canDelete, true);
  for (const status of ['published', 'uncertain', 'unpublished']) {
    const records = [{ id: 'other-managed-trip', status }];
    assert.equal(harness({ records }).canDelete, false, 'Keep the profile reachable for ' + status + ' management.');
    assert.equal(harness({ records, count: 2 }).canDelete, true);
  }
});

test('confirmed last-trip deletion saves an empty portable space before returning home', () => {
  const h = harness();
  h.removeTrip();
  assert.equal(h.emptied.length, 1); assert.equal(h.writes.length, 1);
  const saved = JSON.parse(h.values.get(h.storageKey));
  assert.equal(isWorkspace(saved), true); assert.deepEqual(saved.trips, []); assert.equal(saved.selectedTripId, '');
  assert.deepEqual(saved.profile, h.workspace.profile);
  assert.deepEqual(h.emptied[0], saved); assert.deepEqual(h.updates, []);
  assert.equal(h.values.get('trippin.workspace.v1'), 'preserved legacy bytes');
  assert.deepEqual(h.errors, ['']);
});

test('last-trip deletion still needs explicit confirmation', () => {
  const h = harness({ confirmed: false }); h.removeTrip();
  assert.match(h.errors.at(-1), /Confirm/); assert.equal(h.writes.length, 0); assert.equal(h.emptied.length, 0);
  assert.equal(h.values.get(h.storageKey), h.before);
});

test('remaining management entries explain the block and preserve the private trip', () => {
  const h = harness({ records: [{ id: 'managed-recovery', status: 'uncertain' }] }); h.removeTrip();
  assert.match(h.errors.at(-1), /Review public plans.*last private trip/);
  assert.equal(h.writes.length, 0); assert.equal(h.emptied.length, 0); assert.equal(h.values.get(h.storageKey), h.before);
});

for (const options of [{ publicTrip: true }, { publicationStatus: 'published' }]) {
  test('a published trip cannot be deleted: ' + JSON.stringify(options), () => {
    const h = harness(options); h.removeTrip();
    assert.match(h.errors.at(-1), /Unpublish/); assert.equal(h.writes.length, 0); assert.equal(h.emptied.length, 0);
  });
}

for (const write of ['throw', 'silent']) {
  test('a ' + write + ' storage failure keeps the last trip open and reports failure', () => {
    const h = harness({ write }); h.removeTrip();
    assert.match(h.errors.at(-1), /could not be removed/); assert.equal(h.emptied.length, 0);
    assert.equal(h.values.get(h.storageKey), h.before);
  });
}

test('management discovered after opening settings is rechecked before an empty save', () => {
  const h = harness(); assert.equal(h.canDelete, true);
  h.scope.records.push({ id: 'late-recovery', status: 'uncertain' }); h.removeTrip();
  assert.match(h.errors.at(-1), /Review public plans.*last private trip/);
  assert.equal(h.writes.length, 0); assert.equal(h.emptied.length, 0);
});

test('a replaced trip identity cannot be deleted through older settings', () => {
  const h = harness();
  h.scope.workspaceRef.current = { ...h.scope.workspaceEdit, tripIdentities: new Map([[h.workspace.trips[0].id, 99]]) };
  h.removeTrip(); assert.match(h.errors.at(-1), /trip changed/);
  assert.equal(h.writes.length, 0); assert.equal(h.emptied.length, 0);
});

test('deleting one of several trips retains its sibling and management access', () => {
  const h = harness({ count: 2, records: [{ id: 'recovery', status: 'uncertain' }] }); h.removeTrip();
  assert.equal(h.emptied.length, 0); assert.equal(h.updates.length, 1);
  assert.deepEqual(h.updates[0].trips, h.workspace.trips.slice(1));
  assert.equal(h.updates[0].selectedTripId, h.workspace.trips[1].id);
});
