// T2: actual Workspace callbacks with authored render state, queued reducer
// updates, storage, fetch/JSON acknowledgements and lifecycle cleanup. No React,
// DOM, HTTP route, Redis, browser, model or provider operation executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { webcrypto } from 'node:crypto';
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
    if ([tripModule, editorModule, managementModule, managementStorageModule].includes(context.parentURL) && specifier.startsWith('./')) {
      return nextResolve(new URL(`../lib/${specifier.slice(2)}${specifier.endsWith('.ts') ? '' : '.ts'}`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const tripApi = await import(tripModule);
const editorApi = await import(editorModule);
const managementApi = await import(managementModule);
const managementStorageApi = await import(managementStorageModule);
const sourcePath = process.env.TRIPPIN_WORKSPACE_SOURCE
  || fileURLToPath(new URL('../components/workspace.tsx', import.meta.url));
const ast = ts.createSourceFile(sourcePath, readFileSync(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Workspace');
assert.ok(component?.body, 'Find the actual Workspace function.');
const declarations = component.body.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations);
const locals = new Map(declarations.filter(node => ts.isIdentifier(node.name)).map(node => [node.name.text, node.initializer]));
const moduleVariables = new Map(ast.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations)
  .filter(node => ts.isIdentifier(node.name)).map(node => [node.name.text, node.initializer]));
const hookStates = declarations.filter(node => ts.isArrayBindingPattern(node.name) && ts.isCallExpression(node.initializer)
  && node.initializer.expression.getText(ast) === 'useState').map(node => ({
  name: node.name.elements[0].name.text, setter: node.name.elements[1].name.text,
  initial: node.initializer.arguments[0]?.getText(ast) ?? 'undefined',
}));
const refs = declarations.filter(node => ts.isIdentifier(node.name) && ts.isCallExpression(node.initializer)
  && node.initializer.expression.getText(ast) === 'useRef').map(node => ({
  name: node.name.text, initial: node.initializer.arguments[0]?.getText(ast) ?? 'undefined',
}));
const arrows = new Map();
for (const [name, initializer] of locals) {
  const value = initializer && ts.isCallExpression(initializer) && initializer.expression.getText(ast) === 'useCallback'
    ? initializer.arguments[0] : initializer;
  if (value && ts.isArrowFunction(value)) arrows.set(name, value.getText(ast));
}
const functions = component.body.statements.filter(ts.isFunctionDeclaration);
const moduleFunctions = ast.statements.filter(ts.isFunctionDeclaration).filter(node => node !== component);
function attribute(node, name) {
  return node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name);
}
function expression(value) {
  return value?.initializer && ts.isJsxExpression(value.initializer) ? value.initializer.expression : undefined;
}
const inline = { restore: [], remove: [], save: [] };
function visit(node) {
  if (ts.isJsxSelfClosingElement(node)) {
    const tag = node.tagName.getText(ast);
    if (tag === 'input' && expression(attribute(node, 'ref'))?.getText(ast) === 'backupInput') inline.restore.push(expression(attribute(node, 'onChange')));
    if (tag === 'TripSettings') {
      inline.remove.push(expression(attribute(node, 'onDelete')));
      inline.save.push(expression(attribute(node, 'onSave')));
    }
  }
  ts.forEachChild(node, visit);
}
visit(component);
for (const [name, values] of Object.entries(inline)) assert.equal(values.length, 1, 'Find one actual ' + name + ' callback.');
const effects = [];
for (const statement of component.body.statements) {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
  const call = statement.expression;
  if (!['useEffect', 'useLayoutEffect'].includes(call.expression.getText(ast))) continue;
  const arrow = call.arguments[0];
  if (!arrow || !ts.isArrowFunction(arrow)) continue;
  const deps = call.arguments[1] && ts.isArrayLiteralExpression(call.arguments[1])
    ? call.arguments[1].elements.map(value => value.getText(ast)).join(',') : '';
  if (deps === 'state,ready') effects.push({ kind: 'persist', source: arrow.getText(ast) });
  if (deps === 'workspaceEdit') effects.push({ kind: 'commit', source: arrow.getText(ast) });
  if (arrow.getText(ast).includes('initialized.current')) effects.push({ kind: 'initialize', source: arrow.getText(ast) });
  let mount = false;
  function identify(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && node.left.getText(ast) === 'mountedRef.current' && node.right.kind === ts.SyntaxKind.TrueKeyword) mount = true;
    ts.forEachChild(node, identify);
  }
  identify(arrow);
  if (mount) effects.push({ kind: 'mount', source: arrow.getText(ast) });
}
assert.equal(effects.filter(effect => effect.kind === 'persist').length, 1);
const callbackNames = [...arrows.keys(), ...functions.map(node => node.name.text)];
const factorySource = `module.exports = (state, workspaceEdit, ui) => {
  const { ${hookStates.map(item => item.name).join(',')} } = ui;
  const trip = ${locals.get('trip').getText(ast)};
  ${['shareId', 'shareTrip', 'managedTrip'].filter(name => locals.has(name)).map(name => `const ${name} = ${locals.get(name).getText(ast)};`).join('\n')}
  ${[...arrows].map(([name, value]) => `const ${name} = ${value};`).join('\n')}
  ${functions.map(node => node.getText(ast)).join('\n')}
  return { ${callbackNames.join(',')},
    restore: ${inline.restore[0].getText(ast)}, removeTrip: ${inline.remove[0].getText(ast)}, saveTrip: ${inline.save[0].getText(ast)},
    effects: [${effects.map(effect => `{kind:${JSON.stringify(effect.kind)},run:${effect.source}}`).join(',')}]
  };
};`;
const compiled = ts.transpileModule(moduleFunctions.map(node => node.getText(ast)).join('\n') + '\n' + factorySource, {
  fileName: 'actual-community-callbacks.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
const factoryScript = new vm.Script(compiled.outputText, { filename: 'actual-workspace-community.mocked.cjs' });
const plain = value => JSON.parse(JSON.stringify(value));
const workspaceKey = 'trippin.workspace.v1', managementKey = 'trippin.community-management.v1', ownerKey = 'trippin.owner';
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = () => new Promise(setImmediate);
function authoredLockManager() {
  const calls = [], waiting = [];
  let active = false;
  return {
    calls,
    request(name, options, callback) {
      assert.equal(name, 'trippin.owner.initialize');
      assert.ok(options?.signal, 'The actual initialization lock must be cancellable.');
      const gate = deferred(), job = { name, options, callback, gate, cancelled: false, started: false };
      const abort = () => {
        if (job.started) return;
        job.cancelled = true;
        const error = new Error('Authored queued lock cancellation'); error.name = 'AbortError'; gate.reject(error);
      };
      job.cleanup = () => options.signal.removeEventListener('abort', abort);
      options.signal.addEventListener('abort', abort, { once: true });
      if (options.signal.aborted) abort();
      calls.push(job); waiting.push(job); return gate.promise;
    },
    async grantNext() {
      assert.equal(active, false, 'The authored manager must serialize initialization callbacks.');
      let job;
      while (waiting.length) { const candidate = waiting.shift(); if (!candidate.cancelled) { job = candidate; break; } candidate.cleanup(); }
      if (!job) return false;
      active = true; job.started = true;
      try { job.gate.resolve(await job.callback()); }
      catch (error) { job.gate.reject(error); }
      finally { job.cleanup(); active = false; }
      return true;
    },
  };
}
function workspace() {
  const value = {
    version: 1, selectedTripId: 'community-authored-a',
    profile: { name: 'Authored host', bio: 'Authored profile', homeCity: 'Madrid', interests: ['Architecture'], dailyFoodBudget: 20, dailyTransportBudget: 10, badges: [] },
    trips: ['a', 'b'].map(letter => ({
      id: 'community-authored-' + letter, title: 'Authored trip ' + letter, city: 'Authored City ' + letter.toUpperCase(),
      country: 'Spain', countryCode: 'ES', startDate: '2026-11-03', endDate: '2026-11-03', lat: 40, lng: -3,
      image: '/images/authored.jpg', description: 'Authored itinerary', budget: 500, currency: 'EUR', isPublic: false,
      days: [{ id: 'community-authored-day-' + letter, date: '2026-11-03', label: 'Authored day', activities: [] }],
      expenses: [], bookings: [], companions: [], joinRequests: [],
    })),
  };
  assert.ok(tripApi.isWorkspace(value), 'Authored fixtures must satisfy the real trip model.');
  return value;
}

function harness(initial = workspace(), saved = {}, shared = null) {
  let editor = editorApi.createWorkspaceEditor(plain(initial));
  const durable = shared ?? new Map([[workspaceKey, JSON.stringify(initial)], [ownerKey, 'authored-owner-capability-'.repeat(3)], ...Object.entries(saved)]);
  const events = [], requests = [], queue = [], ui = {}, failures = new Set(), timers = new Map(), backup = { files: [], value: '' };
  let timerID = 0;
  let context, cleanup;
  const forbidden = () => { throw new Error('Unexpected DOM, browser, model or provider operation.'); };
  const bindings = {
    ...tripApi, ...editorApi, ...managementApi, ...managementStorageApi, initial, storageKey: workspaceKey,
    crypto: webcrypto, JSON, Uint8Array, TextEncoder, TextDecoder, Error, URL, URLSearchParams, AbortController,
    window: { location: { origin: 'https://trippin.test', href: 'https://trippin.test/', hash: '', search: '' }, history: { state: null, replaceState: forbidden } },
    navigator: { clipboard: { writeText: forbidden } },
    setTimeout(callback, delay) { const id = ++timerID; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    dispatchWorkspace(action) { queue.push(action); },
    localStorage: {
      get length() { return durable.size; },
      key(index) { return [...durable.keys()][index] ?? null; },
      getItem(key) { events.push({ type: 'read', key }); if (failures.has('read:' + key) || (isManagementKey(key) && failures.has('read:' + managementKey))) throw new Error('Authored storage read failure'); return durable.get(key) ?? null; },
      setItem(key, value) { events.push({ type: 'write-attempt', key, value }); if (failures.has(key) || (isManagementKey(key) && failures.has(managementKey))) throw new Error('Authored storage write failure'); durable.set(key, value); events.push({ type: 'write', key, value }); },
      removeItem(key) { if (failures.has(key) || (isManagementKey(key) && failures.has(managementKey))) throw new Error('Authored storage removal failure'); durable.delete(key); events.push({ type: 'remove', key }); },
    },
    fetch(url, init) {
      assert.ok(String(url).startsWith('/api/community'), 'Only a controlled community request is allowed.');
      if (url === '/api/community' && !init) {
        events.push({ type: 'initialize-fetch', url });
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ available: true, trips: [] }) });
      }
      const gate = deferred(), call = { url, init, gate,
        respond(body, status = 200) { gate.resolve({ ok: status >= 200 && status < 300, status, json: async () => body }); },
        json(status = 200) { const body = deferred(); gate.resolve({ ok: status >= 200 && status < 300, status, json: () => body.promise }); return body; },
      };
      requests.push(call); events.push({ type: 'fetch', url, init }); return gate.promise;
    },
  };
  context = vm.createContext(bindings);
  for (const name of ['COMMUNITY_TIMEOUT_MS']) if (moduleVariables.has(name)) context[name] = new vm.Script('(' + moduleVariables.get(name).getText(ast) + ')').runInContext(context);
  context.state = editor.workspace; context.workspaceEdit = editor;
  for (const item of hookStates) {
    ui[item.name] = new vm.Script('(' + item.initial + ')').runInContext(context);
    if (typeof ui[item.name] === 'function') ui[item.name] = ui[item.name]();
    context[item.setter] = value => {
      ui[item.name] = typeof value === 'function' ? value(ui[item.name]) : value;
      events.push({ type: 'ui', name: item.name, value: ui[item.name] });
    };
  }
  for (const item of refs) context[item.name] = { current: new vm.Script('(' + item.initial + ')').runInContext(context) };
  context.backupInput.current = backup;
  context.module = { exports: {} }; factoryScript.runInContext(context);
  const render = () => context.module.exports(editor.workspace, editor, ui);
  function flush() {
    const before = editor;
    while (queue.length) editor = editorApi.workspaceReducer(editor, queue.shift());
    context.state = editor.workspace; context.workspaceEdit = editor;
    if (before !== editor) {
      const effects = render().effects;
      for (const effect of effects) if (effect.kind === 'commit') effect.run();
      if (before.workspace !== editor.workspace) for (const effect of effects) if (effect.kind === 'persist') effect.run();
    }
  }
  const mount = () => { for (const effect of render().effects) { if (effect.kind === 'commit') effect.run(); if (effect.kind === 'mount') cleanup = effect.run(); } };
  mount();
  return { ui, context, events, requests, durable, storage: context.localStorage, failures, queue, backup, timers, render, flush, mount,
    get workspace() { return editor.workspace; }, get editor() { return editor; },
    unmount() { if (cleanup) cleanup(); else if (context.mountedRef) context.mountedRef.current = false; },
    async initialize() { for (const effect of render().effects) if (effect.kind === 'initialize') effect.run(); flush(); await tick(); },
    replace(value) { render().setState(value); flush(); },
    async settle(pending) { await pending; flush(); },
    restore(value, gate) {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      backup.files = [{ size: bytes.byteLength, async arrayBuffer() { if (gate) await gate.promise; return bytes.slice().buffer; } }]; backup.value = 'authored-backup.json';
      return render().restore({ currentTarget: backup, target: backup });
    },
  };
}

async function setup(initial = workspace(), saved = {}, shared = null) {
  const h = harness(initial, saved, shared); await h.initialize(); return h;
}
const isManagementKey = key => key === managementKey || key.startsWith(managementKey + ':');
const managementEntries = h => [...h.durable].filter(([key]) => isManagementKey(key)).sort(([left], [right]) => left.localeCompare(right));
const records = h => managementStorageApi.readManagedStorage(h.storage).records;
const record = (h, id = 'community-authored-a') => records(h).find(item => item.id === id);
const target = (h, id = 'community-authored-a') => h.workspace.trips.find(item => item.id === id);
function startPublish(h, id = h.workspace.selectedTripId) {
  h.render().open('share', id);
  const pending = h.render().publish();
  return { pending, request: h.requests.at(-1), id };
}
function ackPublication(operation, body = { published: true, id: operation.id }) { operation.request.respond(body, 201); }
async function settleBlocked(h, pending) {
  // An old callback may incorrectly send the forbidden request. Resolve that
  // authored boundary before asserting its count, rather than hanging baseline.
  for (const request of h.requests) request.respond({ error: 'Authored request that should have been blocked' }, 503);
  await h.settle(pending);
}
function onlyOtherTrip() {
  const value = workspace(); value.trips = [value.trips[1]]; value.selectedTripId = value.trips[0].id; return value;
}

test('publication durably records minimal uncertain management data before its POST', async () => {
  const initial = workspace(); initial.trips[0].expenses = [{ id: 'private-expense', title: 'Private receipt', amount: 8, date: initial.trips[0].startDate, category: 'food' }];
  const h = await setup(initial), operation = startPublish(h), entry = record(h);
  assert.deepEqual(entry, { id: operation.id, title: initial.trips[0].title, city: initial.trips[0].city, status: 'uncertain' });
  assert.deepEqual(Object.keys(entry).sort(), ['city', 'id', 'status', 'title']);
  const saved = h.events.findIndex(event => event.type === 'write' && isManagementKey(event.key));
  const sent = h.events.findIndex(event => event.type === 'fetch' && event.init?.method === 'POST');
  assert.ok(saved >= 0 && saved < sent, 'The recovery reference must be durable before publication can leave the browser.');
  const body = JSON.parse(operation.request.init.body); assert.equal(body.trip.id, operation.id);
  assert.deepEqual(body.trip.expenses, []); assert.deepEqual(body.trip.bookings, []);
  ackPublication(operation); await h.settle(operation.pending);
});

test('management storage refusal prevents a publication request and preserves private state', async () => {
  const h = await setup(), before = plain(h.workspace); h.failures.add(managementKey);
  const operation = startPublish(h); await settleBlocked(h, operation.pending);
  assert.equal(h.requests.length, 0); assert.deepEqual(h.workspace, before); assert.equal(h.ui.busy, false);
  assert.equal(managementEntries(h).length, 0); assert.ok(h.ui.error || h.ui.managementError);
});

test('unreadable existing management data is kept and prevents publication', async () => {
  const raw = '{"version":99,"trips":[]}', key = managementKey + ':attempt:authored-invalid';
  const h = await setup(workspace(), { [key]: raw });
  const operation = startPublish(h); await settleBlocked(h, operation.pending);
  assert.equal(h.requests.length, 0); assert.equal(h.durable.get(key), raw); assert.equal(target(h).isPublic, false);
});

test('two synchronous publication callbacks send one POST', async () => {
  const h = await setup(); h.render().open('share'); const callbacks = h.render(), first = callbacks.publish(), second = callbacks.publish();
  const count = h.requests.length, busy = h.ui.busy;
  for (const request of h.requests) request.respond({ published: true, id: h.workspace.selectedTripId }, 201);
  await Promise.all([first, second]); h.flush(); assert.equal(count, 1); assert.equal(busy, true);
  assert.equal(h.ui.busy, false);
});

test('an exact first publication acknowledgment confirms its management entry and latest private edits', async () => {
  const h = await setup(), operation = startPublish(h);
  h.render().updateTrip(value => ({ ...value, title: 'Newer private title', budget: 712 })); h.flush();
  ackPublication(operation); await h.settle(operation.pending);
  assert.equal(record(h)?.status, 'published'); assert.equal(target(h).isPublic, true);
  assert.equal(target(h).title, 'Newer private title'); assert.equal(target(h).budget, 712);
  assert.equal(h.ui.shareUrl, 'https://trippin.test/?trip=' + operation.id);
});

for (const body of [{ published: false, id: 'community-authored-a' }, { published: true, id: 'wrong-authored-id' }, {}]) {
  test('an incomplete or wrong-trip acknowledgment preserves uncertainty: ' + JSON.stringify(body), async () => {
    const h = await setup(), operation = startPublish(h); ackPublication(operation, body); await h.settle(operation.pending);
    assert.equal(record(h)?.status, 'uncertain'); assert.equal(target(h).isPublic, false); assert.equal(h.ui.shareUrl, '');
  });
}

for (const outcome of ['http', 'network', 'json']) test(`a lost ${outcome} acknowledgment stays manageable after reload`, async () => {
  const h = await setup(), operation = startPublish(h);
  if (outcome === 'http') operation.request.respond({ error: 'Authored unavailable response' }, 503);
  else if (outcome === 'network') operation.request.gate.reject(new Error('Authored lost response'));
  else { const body = operation.request.json(); await tick(); body.reject(new Error('Authored JSON failure')); }
  await h.settle(operation.pending); assert.equal(record(h)?.status, 'uncertain'); assert.equal(target(h).isPublic, false);
  const reloaded = await setup(JSON.parse(h.durable.get(workspaceKey)), Object.fromEntries(h.durable));
  assert.equal(record(reloaded)?.status, 'uncertain'); assert.ok(reloaded.ui.managedTrips?.some(item => item.id === operation.id));
});

test('a later successful publish cannot erase an earlier unknown publication attempt', async () => {
  const h = await setup(), first = startPublish(h); first.request.gate.reject(new Error('Authored unknown attempt')); await h.settle(first.pending);
  const second = startPublish(h); ackPublication(second); await h.settle(second.pending);
  assert.equal(record(h)?.status, 'uncertain'); assert.equal(target(h).isPublic, true);
});

test('closing and deleting the private trip during publication preserves its recovery entry', async () => {
  const h = await setup(), operation = startPublish(h); h.render().close(); h.render().open('tripSettings');
  h.render().removeTrip(); h.flush();
  assert.equal(target(h), undefined); assert.equal(record(h)?.status, 'uncertain');
  ackPublication(operation); await h.settle(operation.pending);
  assert.equal(target(h), undefined, 'A late acknowledgment cannot recreate a deleted private trip.');
  assert.equal(record(h)?.status, 'published'); assert.ok(h.ui.managedTrips?.some(item => item.id === operation.id));
  assert.equal(h.ui.shareUrl, '', 'A closed share dialog must not receive a late link.');
});

test('deletion refuses to discard the private trip when management preservation fails', async () => {
  const h = await setup(); h.render().updateTrip(value => ({ ...value, isPublic: true })); h.flush();
  h.render().open('tripSettings'); const before = plain(h.workspace), journal = managementEntries(h);
  h.failures.add(managementKey); assert.throws(() => h.render().removeTrip(), /storage write failure/); h.flush();
  assert.deepEqual(plain(h.workspace), before); assert.deepEqual(managementEntries(h), journal);
});

test('a backup read begun before publication retains the newer recovery entry at replacement commit', async () => {
  const h = await setup(), gate = deferred(), restore = h.restore(onlyOtherTrip(), gate), operation = startPublish(h);
  gate.resolve(); await h.settle(restore);
  assert.equal(target(h), undefined); assert.equal(record(h)?.status, 'uncertain');
  ackPublication(operation); await h.settle(operation.pending);
  assert.equal(target(h), undefined); assert.equal(record(h)?.status, 'published'); assert.equal(h.workspace.trips.length, 1);
});

test('a backup excluding a known public trip leaves it available in global management', async () => {
  const initial = workspace(); initial.trips[0].isPublic = true;
  const h = await setup(initial); await h.settle(h.restore(onlyOtherTrip()));
  assert.equal(target(h), undefined); assert.equal(record(h)?.status, 'published');
  assert.ok(h.ui.managedTrips?.some(item => item.id === 'community-authored-a'));
  h.render().open('share', 'community-authored-a'); const pending = h.render().unpublish(), request = h.requests.at(-1);
  assert.equal(request.url, '/api/community?id=community-authored-a'); assert.equal(request.init.method, 'DELETE');
  request.respond({ deleted: true }); await h.settle(pending); assert.equal(record(h), undefined);
});

test('restore preserves the private and durable workspace if management cannot be saved', async () => {
  const h = await setup(), before = plain(h.workspace), durable = h.durable.get(workspaceKey), journal = managementEntries(h);
  const incoming = onlyOtherTrip(); incoming.trips[0].isPublic = true;
  h.failures.add(managementKey); await h.settle(h.restore(incoming));
  assert.deepEqual(h.workspace, before); assert.equal(h.durable.get(workspaceKey), durable); assert.deepEqual(managementEntries(h), journal);
});

test('a backup read completed after unmount cannot write, notify or clear its captured chooser', async () => {
  const h = await setup(), gate = deferred(), before = plain(h.workspace), pending = h.restore(onlyOtherTrip(), gate);
  h.unmount(); const durable = h.durable.get(workspaceKey), inputValue = h.backup.value;
  const writes = h.events.filter(event => event.type === 'write').length;
  const notices = h.events.filter(event => event.type === 'ui' && event.name === 'toast').length;
  gate.resolve(); await h.settle(pending);
  assert.deepEqual(h.workspace, before); assert.equal(h.durable.get(workspaceKey), durable);
  assert.equal(h.events.filter(event => event.type === 'write').length, writes);
  assert.equal(h.events.filter(event => event.type === 'ui' && event.name === 'toast').length, notices);
  assert.equal(h.backup.value, inputValue);
});

test('publication acknowledgment cannot mark a restored same-ID trip public', async () => {
  const h = await setup(), operation = startPublish(h), replacement = workspace(); replacement.trips[0].title = 'Restored new incarnation';
  await h.settle(h.restore(replacement)); ackPublication(operation); await h.settle(operation.pending);
  assert.equal(target(h).title, 'Restored new incarnation'); assert.equal(target(h).isPublic, false); assert.equal(record(h)?.status, 'published');
});

test('an old operation cannot update a new share dialog or clear its pending busy state', async () => {
  const h = await setup(), old = startPublish(h); h.unmount(); h.mount();
  h.render().selectTrip('community-authored-b'); h.flush(); const latest = startPublish(h);
  ackPublication(old); await h.settle(old.pending);
  assert.equal(h.ui.busy, true); assert.equal(h.ui.shareUrl, ''); assert.equal(target(h).isPublic, false);
  ackPublication(latest); await h.settle(latest.pending);
  assert.equal(h.ui.busy, false); assert.equal(target(h, 'community-authored-b').isPublic, true);
  assert.equal(h.ui.shareUrl, 'https://trippin.test/?trip=community-authored-b');
});

test('closing share and selecting another trip does not retarget the in-flight publication', async () => {
  const h = await setup(), operation = startPublish(h); h.render().close(); h.render().selectTrip('community-authored-b'); h.flush(); h.render().open('share');
  ackPublication(operation); await h.settle(operation.pending);
  assert.equal(target(h).isPublic, true); assert.equal(target(h, 'community-authored-b').isPublic, false);
  assert.equal(h.ui.shareUrl, ''); assert.equal(record(h)?.status, 'published');
});

test('a known published record is removed only after an exact successful DELETE acknowledgment', async () => {
  const initial = workspace(); initial.trips[0].isPublic = true;
  const h = await setup(initial); h.render().open('share'); const pending = h.render().unpublish();
  assert.equal(record(h)?.status, 'published'); h.requests.at(-1).respond({ deleted: true }); await h.settle(pending);
  assert.equal(record(h), undefined); assert.equal(target(h).isPublic, false);
});

test('DELETE after an unknown POST retains its uncertain recovery reference', async () => {
  const initial = workspace(), entry = initial.trips[0], h = await setup(initial);
  managementStorageApi.reserveManagedPublication(h.storage, entry, '11111111-1111-4111-8111-111111111111');
  h.render().open('share', entry.id); const pending = h.render().unpublish(); h.requests.at(-1).respond({ deleted: true }); await h.settle(pending);
  assert.equal(record(h)?.status, 'uncertain'); assert.ok(h.ui.managedTrips?.some(item => item.id === entry.id));
});

for (const outcome of ['http', 'network', 'json', 'wrong-ack']) test(`a ${outcome} DELETE acknowledgment cannot remove a known recovery reference`, async () => {
  const initial = workspace(); initial.trips[0].isPublic = true;
  const h = await setup(initial); h.render().open('share'); const pending = h.render().unpublish(), request = h.requests.at(-1);
  if (outcome === 'http') request.respond({ error: 'Authored rejection' }, 503);
  else if (outcome === 'network') request.gate.reject(new Error('Authored lost response'));
  else if (outcome === 'json') { const body = request.json(); await tick(); body.reject(new Error('Authored bad JSON')); }
  else request.respond({ deleted: false });
  await h.settle(pending); assert.equal(record(h)?.status, 'published'); assert.equal(target(h).isPublic, true);
});

test('management storage read refusal sends no DELETE', async () => {
  const initial = workspace(); initial.trips[0].isPublic = true;
  const h = await setup(initial); h.failures.add('read:' + managementKey); h.render().open('share'); await settleBlocked(h, h.render().unpublish());
  h.failures.clear();
  assert.equal(h.requests.length, 0); assert.equal(record(h)?.status, 'published'); assert.equal(target(h).isPublic, true);
});

test('a failed journal removal after DELETE keeps the reference available for retry', async () => {
  const initial = workspace(); initial.trips[0].isPublic = true;
  const h = await setup(initial); h.render().open('share'); const pending = h.render().unpublish(); h.failures.add(managementKey);
  h.requests.at(-1).respond({ deleted: true }); await h.settle(pending);
  assert.equal(record(h)?.status, 'published'); assert.ok(h.ui.managedTrips?.some(item => item.id === 'community-authored-a'));
});

test('publication timeout preserves uncertainty and ignores a later success response', async () => {
  const h = await setup(), operation = startPublish(h), timer = [...h.timers.values()][0];
  assert.ok(timer, 'Community operations need an authored observable deadline.'); assert.equal(timer.delay, 20_000); timer.callback(); await h.settle(operation.pending);
  assert.equal(record(h)?.status, 'uncertain'); assert.equal(target(h).isPublic, false); assert.equal(h.ui.busy, false);
  ackPublication(operation); await tick(); h.flush(); assert.equal(record(h)?.status, 'uncertain'); assert.equal(target(h).isPublic, false);
});

test('two tabs publishing the same trip preserve the other pending attempt after the first acknowledgment', async () => {
  const firstTab = await setup(), secondTab = await setup(workspace(), {}, firstTab.durable);
  const first = startPublish(firstTab), second = startPublish(secondTab);
  assert.equal(record(firstTab)?.status, 'uncertain');
  ackPublication(first); await firstTab.settle(first.pending);
  assert.equal(record(firstTab)?.status, 'uncertain', 'One acknowledgment cannot erase another tab\'s unknown POST.');
  ackPublication(second); await secondTab.settle(second.pending);
  assert.equal(record(firstTab)?.status, 'published'); assert.equal(record(secondTab)?.status, 'published');
  const attempts = managementEntries(firstTab).filter(([key]) => key.startsWith(managementKey + ':attempt:'));
  assert.equal(attempts.length, 2, 'Independent attempts need independently owned durable keys.');
});

test('two first-use tabs serialize owner initialization and publish with the same saved capability', async () => {
  const firstTab = await setup(); firstTab.durable.delete(ownerKey);
  const secondTab = await setup(workspace(), {}, firstTab.durable), locks = authoredLockManager();
  firstTab.context.navigator.locks = locks; secondTab.context.navigator.locks = locks;
  const first = startPublish(firstTab), second = startPublish(secondTab);
  assert.equal(locks.calls.length, 2); assert.equal(firstTab.requests.length + secondTab.requests.length, 0);
  assert.equal(await locks.grantNext(), true); assert.equal(await locks.grantNext(), true); await tick();
  assert.equal(firstTab.requests.length, 1); assert.equal(secondTab.requests.length, 1);
  const owner = firstTab.durable.get(ownerKey); assert.match(owner, /^[a-zA-Z0-9_-]{40,160}$/);
  assert.equal(firstTab.requests[0].init.headers['x-trip-owner'], owner);
  assert.equal(secondTab.requests[0].init.headers['x-trip-owner'], owner);
  assert.equal([...firstTab.events, ...secondTab.events].filter(event => event.type === 'write' && event.key === ownerKey).length, 1);
  firstTab.requests[0].respond({ published: true, id: first.id }, 201);
  secondTab.requests[0].respond({ published: true, id: second.id }, 201);
  await firstTab.settle(first.pending); await secondTab.settle(second.pending);
});

test('a fresh owner without lock support sends nothing and creates no management reference', async () => {
  const h = await setup(); h.durable.delete(ownerKey); delete h.context.navigator.locks;
  const operation = startPublish(h); await settleBlocked(h, operation.pending);
  assert.equal(h.requests.length, 0); assert.equal(h.durable.has(ownerKey), false);
  assert.equal(managementEntries(h).length, 0); assert.equal(target(h).isPublic, false); assert.ok(h.ui.error);
});

test('an existing publishing owner works synchronously without lock support', async () => {
  const h = await setup(), owner = h.durable.get(ownerKey); delete h.context.navigator.locks;
  const operation = startPublish(h);
  assert.equal(h.requests.length, 1); assert.equal(operation.request.init.headers['x-trip-owner'], owner);
  assert.equal(h.events.filter(event => event.type === 'write' && event.key === ownerKey).length, 0);
  ackPublication(operation); await h.settle(operation.pending);
  assert.equal(target(h).isPublic, true); assert.equal(h.ui.shareUrl, 'https://trippin.test/?trip=' + operation.id);
});

test('unmount while waiting for owner initialization cannot reserve or publish afterward', async () => {
  const h = await setup(), locks = authoredLockManager(); h.durable.delete(ownerKey); h.context.navigator.locks = locks;
  const operation = startPublish(h); assert.equal(locks.calls.length, 1); assert.equal(h.requests.length, 0);
  h.unmount(); await h.settle(operation.pending);
  assert.equal(locks.calls[0].options.signal.aborted, true); assert.equal(await locks.grantNext(), false);
  assert.equal(h.requests.length, 0); assert.equal(h.durable.has(ownerKey), false); assert.equal(managementEntries(h).length, 0);
});
