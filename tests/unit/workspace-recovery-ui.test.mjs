// T2: actual TravelApp recovery callbacks and account helpers, with authored
// files, storage, locks, React state and download DOM. No browser/Auth/network.
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
const trip = await import('../../lib/trip.ts');
const accounts = await import('../../lib/account-workspace.ts');
const source = readFileSync(new URL('../../components/travel-app.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('travel-app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'TravelApp');
assert.ok(component?.body);
const functionNames = ['load', 'showForm', 'openSavedTrip', 'downloadRecoveryJSON', 'downloadSavedData',
  'downloadRecoveryArchives', 'cancelRecovery', 'downloadSelectedRecovery', 'confirmRecovery'];
const functions = new Map(component.body.statements.filter(ts.isFunctionDeclaration)
  .filter(node => functionNames.includes(node.name?.text)).map(node => [node.name.text, node]));
assert.equal(functions.size, functionNames.length);
const attribute = (node, name) => node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name)?.initializer;
const textOf = node => node.children.filter(ts.isJsxText).map(child => child.text).join('').trim();
function enclosingExpression(node) {
  for (let parent = node.parent; parent; parent = parent.parent) if (ts.isJsxExpression(parent)) return parent.expression;
}
let fileChange, picker, recoverySurface, archiveSurface;
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'input' && attribute(node, 'ref')?.expression?.getText(ast) === 'backup') fileChange = attribute(node, 'onChange').expression;
  if (ts.isJsxElement(node)) {
    const opening = node.openingElement;
    if (opening.tagName.getText(ast) === 'button' && textOf(node) === 'Restore your own backup') picker = attribute(opening, 'onClick').expression;
    if (opening.tagName.getText(ast) === 'button' && textOf(node) === 'Download original recovery archives') archiveSurface = enclosingExpression(node);
    if (opening.tagName.getText(ast) === 'Dialog' && attribute(opening, 'title')?.text === 'Recover your saved travel space') recoverySurface = enclosingExpression(node);
  }
  ts.forEachChild(node, visit);
}
visit(component);
assert.ok(fileChange && picker && recoverySurface && archiveSurface, 'Use the actual picker, confirmation and archive UI.');
const scripts = new WeakMap();
function evaluate(node, context) {
  let script = scripts.get(node);
  if (!script) {
    const compiled = ts.transpileModule('module.exports = (' + node.getText(ast) + ');', {
      fileName: 'actual-workspace-recovery.tsx', reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
    });
    assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
    script = new vm.Script(compiled.outputText); scripts.set(node, script);
  }
  context.module = { exports: {} }; script.runInContext(context); return context.module.exports;
}
const alice = { id: '11111111-1111-4111-8111-111111111111', name: 'Authored Alice', email: 'alice@example.test' };
const bob = { id: '22222222-2222-4222-8222-222222222222', name: 'Authored Bob', email: 'bob@example.test' };
const corrupt = '{"authored-corrupt":"\ud800"';
function plan(name = 'Selected recovery backup') {
  const value = legacyWorkspace(); value.profile.name = name; return value;
}
function memory(entries = []) {
  const values = new Map(entries), writes = [], events = [];
  return { values, writes, events, get length() { return values.size; }, key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { events.push(['read', key]); return values.get(key) ?? null; },
    setItem(key, raw) { events.push(['write', key]); writes.push({ key, raw }); values.set(key, raw); },
    removeItem(key) { throw new Error('Recovery must not remove authored data: ' + key); } };
}
function delayedFile(value = plan(), raw) {
  const bytes = raw === undefined ? new TextEncoder().encode(trip.serializeWorkspace(value)) : new TextEncoder().encode(raw);
  let resolve, reject, reads = 0;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { size: bytes.byteLength, get reads() { return reads; }, arrayBuffer() { reads++; return promise; },
    finish() { resolve(bytes.slice().buffer); }, fail() { reject(new Error('Authored file read failure')); } };
}
function deferredLocks() {
  const calls = [];
  return { calls, request(name, options, callback) {
    let resolve, reject;
    const done = new Promise((yes, no) => { resolve = yes; reject = no; });
    calls.push({ name, options, release() { try { resolve(callback()); } catch (error) { reject(error); } } });
    return done;
  } };
}
const immediateLocks = { request(name, options, callback) { return Promise.resolve().then(callback); } };
function harness({ user = null, storage = memory([[accounts.accountWorkspaceKey(user), corrupt]]), locks = immediateLocks } = {}) {
  const states = [], recoveries = [], errors = [], notices = [], pending = [], views = [], forms = [], downloads = [], urls = [], timers = [], captures = [];
  let id = 0, clicks = 0;
  const context = vm.createContext({ ...trip, ...accounts, Error, Uint8Array, Blob,
    localStorage: storage, auth: { user }, key: accounts.accountWorkspaceKey(user), workspace: null,
    recovery: null, recoveryArchiveCount: 0, renderAccountEpoch: 4,
    epoch: { current: 4 }, backupReadGeneration: { current: 0 }, working: { current: false },
    backup: { current: { click() { clicks++; } } }, navigator: { locks },
    makeId(prefix) { return prefix + '-authored-' + ++id; },
    captureAccountWorkspaceRecovery(...args) { storage.events.push(['capture']); const result = accounts.captureAccountWorkspaceRecovery(...args); captures.push(result); return result; },
    setWorkspace(value) { states.push(value); context.workspace = value; },
    setRecovery(value) { recoveries.push(value); context.recovery = value; },
    setRecoveryArchiveCount(value) { context.recoveryArchiveCount = value; },
    setPending(value) { pending.push(value); context.pending = value; },
    setInTrip(value) { views.push(value); }, setSharedPlan() {},
    setError(value) { errors.push(value); context.error = value; },
    setNotice(value) { notices.push(value); context.notice = value; },
    setForm(value) { forms.push(value); context.form = value; }, form: null, error: '', notice: '', pending: false,
    URL: { createObjectURL(blob) { urls.push(blob); return 'blob:authored-' + urls.length; }, revokeObjectURL(url) { downloads.push({ revoked: url }); } },
    document: { createElement(tag) { assert.equal(tag, 'a'); const link = { click() { downloads.push({ href: link.href, download: link.download }); } }; return link; } },
    setTimeout(callback, ms) { timers.push({ callback, ms }); },
    h(tag, props, ...children) { return { tag, props, children }; }, Dialog: 'authored-dialog',
    fetch() { throw new Error('Network is forbidden in recovery UI checks.'); }, module: { exports: {} },
  });
  for (const [name, node] of functions) context[name] = evaluate(node, context);
  const change = evaluate(fileChange, context), choose = evaluate(picker, context);
  return { context, storage, states, recoveries, errors, notices, pending, views, forms, downloads, urls, timers, captures,
    get pickerClicks() { return clicks; },
    action(name) { return evaluate(functions.get(name), context); },
    pick() { return choose(); },
    read(value, input = { files: value ? [value] : [], value: 'selected-backup' }) { return { input, done: change({ currentTarget: input }) }; },
    async stage(value = plan()) { const file = delayedFile(value); const reading = this.read(file); file.finish(); await reading.done; return context.recovery; },
    dialog() { return evaluate(recoverySurface, context); }, archiveButton() { return evaluate(archiveSurface, context); },
  };
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...(tree.children || []).flat(Infinity).flatMap(child => nodes(child, predicate))];
}
const buttonText = node => node.children.flat(Infinity).filter(child => typeof child === 'string').join('');

test('corrupt bytes are captured before awaiting the file and valid input stages without writes', async () => {
  const h = harness(), file = delayedFile(), reading = h.read(file);
  assert.equal(file.reads, 1); assert.equal(h.captures.length, 1); assert.equal(h.captures[0].sourceRaw, corrupt);
  assert.equal(h.context.recovery, null); assert.equal(h.storage.writes.length, 0);
  h.storage.values.set(accounts.accountWorkspaceKey(null), 'newer corrupt bytes');
  file.finish(); await reading.done;
  assert.equal(h.context.recovery.ticket.sourceRaw, corrupt, 'Confirmation retains the snapshot from before the asynchronous read.');
  assert.equal(h.context.recovery.workspace.profile.name, 'Selected recovery backup');
  assert.equal(h.states.length, 0); assert.equal(h.storage.writes.length, 0); assert.equal(reading.input.value, '');
  const dialog = h.dialog(); assert.equal(dialog.props.title, 'Recover your saved travel space');
  assert.match(JSON.stringify(dialog.children), /saved trips/);
});

test('invalid or oversized files cannot stage recovery or alter saved bytes', async () => {
  for (const kind of ['invalid', 'oversized']) {
    const h = harness(), file = delayedFile(undefined, 'not a backup');
    if (kind === 'oversized') file.size = trip.MAX_BACKUP_FILE_BYTES + 1;
    const reading = h.read(file); file.finish(); await reading.done;
    assert.equal(h.context.recovery, null); assert.equal(h.storage.writes.length, 0); assert.equal(h.states.length, 0);
    assert.equal(h.storage.values.get(accounts.accountWorkspaceKey(null)), corrupt); assert.ok(h.errors.at(-1));
    assert.equal(file.reads, kind === 'oversized' ? 0 : 1); assert.equal(reading.input.value, '');
  }
});

test('an unsafe capture refuses before invoking the asynchronous file reader', async () => {
  const h = harness(), file = delayedFile(); Object.defineProperty(h.storage, 'length', { get() { throw new Error('Authored storage enumeration refusal'); } });
  const reading = h.read(file); await reading.done;
  assert.equal(file.reads, 0); assert.equal(h.storage.writes.length, 0); assert.equal(h.context.recovery, null);
  assert.equal(h.errors.at(-1), 'Authored storage enumeration refusal');
});

test('newer and empty file selections fence late recovery reads and retain the newer input', async () => {
  const h = harness(), older = delayedFile(plan('Older')), newer = delayedFile(plan('Newer'));
  const input = { files: [older], value: 'older' }, first = h.read(older, input);
  input.files = [newer]; input.value = 'newer'; const second = h.read(newer, input);
  older.finish(); await first.done; assert.equal(input.value, 'newer'); assert.equal(h.context.recovery, null);
  newer.finish(); await second.done; assert.equal(h.context.recovery.workspace.profile.name, 'Newer'); assert.equal(input.value, '');
  const late = delayedFile(), third = h.read(late); await h.read(null).done; late.finish(); await third.done;
  assert.equal(h.context.recovery, null); assert.equal(h.storage.writes.length, 0); assert.equal(h.states.length, 0);
});

test('an account epoch or newer navigation refuses a late recovery choice', async () => {
  for (const supersede of ['account', 'navigation']) {
    const h = harness({ user: alice }), file = delayedFile(), reading = h.read(file);
    if (supersede === 'account') { h.context.epoch.current++; h.context.auth = { user: bob }; }
    else h.action('showForm')('trip');
    file.finish(); await reading.done;
    assert.equal(h.context.recovery, null); assert.equal(h.states.length, 0); assert.equal(h.storage.writes.length, 0);
    if (supersede === 'navigation') assert.equal(h.context.form, 'trip');
  }
});

test('explicit confirmation waits for its namespace lock and guards duplicate, cancel and picker actions', async () => {
  const locks = deferredLocks(), h = harness({ locks }); await h.stage();
  const selected = h.context.recovery, generation = h.context.backupReadGeneration.current;
  const confirmation = h.action('confirmRecovery')();
  assert.equal(locks.calls.length, 1); assert.equal(locks.calls[0].name, 'trippin.workspace.recovery:' + accounts.accountWorkspaceKey(null));
  assert.equal(locks.calls[0].options.mode, 'exclusive'); assert.equal(h.context.working.current, true);
  assert.deepEqual(h.pending, [true]); assert.equal(h.storage.writes.length, 0); assert.equal(h.states.length, 0);
  await h.action('confirmRecovery')(); h.action('cancelRecovery')(); h.pick();
  const ignoredFile = delayedFile(), ignored = h.read(ignoredFile); await ignored.done;
  assert.equal(ignoredFile.reads, 0); assert.equal(h.context.recovery, selected); assert.equal(h.context.backupReadGeneration.current, generation);
  assert.equal(h.pickerClicks, 0); assert.equal(locks.calls.length, 1);
  const buttons = nodes(h.dialog(), node => node.tag === 'button'); assert.equal(buttons.length, 3);
  assert.ok(buttons.every(button => button.props.disabled === true));
  const commit = buttons.find(button => button.props['aria-describedby'] === 'recovery-warning'); assert.equal(buttonText(commit), 'Recovering…');
  locks.calls[0].release(); await confirmation;
  assert.equal(h.states.length, 1); assert.equal(h.states[0].profile.name, 'Selected recovery backup');
  assert.deepEqual(h.views, [true]); assert.equal(h.context.recovery, null); assert.equal(h.context.recoveryArchiveCount, 1);
  assert.deepEqual(h.pending, [true, false]); assert.equal(h.context.working.current, false); assert.equal(h.notices.length, 1);
  assert.equal(JSON.parse(h.storage.values.get(h.captures[0].archiveKey)).raw, corrupt);
  assert.deepEqual(h.storage.writes.map(row => row.key), [h.captures[0].archiveKey, accounts.accountWorkspaceKey(null)]);
  await h.action('confirmRecovery')(); assert.equal(h.storage.writes.length, 2); assert.equal(h.states.length, 1);
});

test('an account switch while waiting for the lock refuses every write and late UI install', async () => {
  const locks = deferredLocks(), h = harness({ user: alice, locks }); await h.stage();
  const confirmation = h.action('confirmRecovery')(), previousErrors = h.errors.length;
  h.context.epoch.current++; h.context.auth = { user: bob }; h.context.key = accounts.accountWorkspaceKey(bob);
  locks.calls[0].release(); await confirmation;
  assert.equal(h.storage.writes.length, 0); assert.equal(h.states.length, 0); assert.equal(h.notices.length, 0);
  assert.equal(h.errors.length, previousErrors); assert.deepEqual(h.views, []); assert.deepEqual(h.pending, [true]);
});

test('a newer file intent during a lock wait refuses old confirmation and its late error', async () => {
  const locks = deferredLocks(), h = harness({ locks }); await h.stage();
  const confirmation = h.action('confirmRecovery')(), errorsAtWait = [...h.errors]; h.context.backupReadGeneration.current++;
  locks.calls[0].release(); await confirmation;
  assert.equal(h.storage.writes.length, 0); assert.equal(h.states.length, 0); assert.equal(h.notices.length, 0);
  assert.deepEqual(h.errors, errorsAtWait); assert.deepEqual(h.pending, [true, false]);
});

test('a timed-out confirmation resets pending and cannot replay writes after a late lock grant', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const locks = deferredLocks(), h = harness({ locks }); await h.stage();
  const confirmation = h.action('confirmRecovery')();
  t.mock.timers.tick(5000); await confirmation;
  assert.equal(h.context.working.current, false); assert.deepEqual(h.pending, [true, false]);
  assert.equal(locks.calls[0].options.signal.aborted, true); assert.match(h.errors.at(-1), /exclusive access in time/);
  const error = h.errors.at(-1); locks.calls[0].release(); await Promise.resolve();
  assert.equal(h.storage.writes.length, 0); assert.equal(h.states.length, 0); assert.equal(h.notices.length, 0);
  assert.equal(h.errors.at(-1), error); assert.ok(h.context.recovery);
});

test('changed corrupt bytes after file selection cannot be replaced by that confirmation', async () => {
  const h = harness(), file = delayedFile(), reading = h.read(file);
  h.storage.values.set(accounts.accountWorkspaceKey(null), 'newer corrupt bytes'); file.finish(); await reading.done;
  await h.action('confirmRecovery')();
  assert.equal(h.storage.values.get(accounts.accountWorkspaceKey(null)), 'newer corrupt bytes');
  assert.equal(h.storage.writes.length, 0); assert.equal(h.states.length, 0); assert.ok(h.context.recovery);
  assert.match(h.errors.at(-1), /changed/); assert.equal(h.notices.length, 0);
});

test('a missing recovery lock keeps the selected dialog and displays helper failure without success', async () => {
  const h = harness({ locks: undefined }); h.context.navigator.locks = undefined; await h.stage();
  const selected = h.context.recovery; await h.action('confirmRecovery')();
  assert.equal(h.context.recovery, selected); assert.equal(h.states.length, 0); assert.equal(h.notices.length, 0); assert.deepEqual(h.views, []);
  assert.equal(h.storage.writes.length, 0); assert.match(h.errors.at(-1), /cannot safely coordinate recovery/);
  const alerts = nodes(h.dialog(), node => node.props?.role === 'alert'); assert.equal(alerts.length, 1); assert.equal(alerts[0].children[0], h.errors.at(-1));
});

test('refused or unverified original archives never permit target writes or UI installation', async () => {
  for (const kind of ['throw', 'unverified']) {
    const h = harness(); await h.stage();
    h.storage.setItem = () => { if (kind === 'throw') throw new Error('Authored archive write refusal'); };
    await h.action('confirmRecovery')();
    assert.equal(h.storage.values.get(accounts.accountWorkspaceKey(null)), corrupt); assert.equal(h.states.length, 0);
    assert.equal(h.notices.length, 0); assert.ok(h.context.recovery); assert.ok(h.errors.at(-1)); assert.deepEqual(h.views, []);
  }
});

test('an unverified target save retains the exact original archive and refuses to install a workspace', async () => {
  for (const outcome of ['write-refused', 'written-but-readback-unconfirmed']) {
    const h = harness(); await h.stage();
    const target = accounts.accountWorkspaceKey(null), candidate = trip.serializeWorkspace(h.context.recovery.workspace, 0);
    const write = h.storage.setItem.bind(h.storage), read = h.storage.getItem.bind(h.storage);
    let targetWritten = false;
    h.storage.setItem = (key, raw) => {
      if (key !== target) write(key, raw);
      else if (outcome === 'written-but-readback-unconfirmed') { write(key, raw); targetWritten = true; }
    };
    h.storage.getItem = key => key === target && targetWritten ? corrupt : read(key);
    await h.action('confirmRecovery')();
    assert.equal(h.storage.values.get(target), targetWritten ? candidate : corrupt);
    const archiveKey = h.captures[0].archiveKey, archiveRaw = h.storage.values.get(archiveKey);
    assert.equal(JSON.parse(archiveRaw).raw, corrupt);
    assert.equal(h.states.length, 0); assert.equal(h.notices.length, 0); assert.deepEqual(h.views, []); assert.ok(h.context.recovery);
    assert.match(h.errors.at(-1), /restored workspace could not be confirmed/);
    const bytesBeforeCancel = h.storage.values.get(target), writesBeforeCancel = h.storage.writes.length;
    h.context.URL.createObjectURL = () => { throw new Error('Authored download refusal after unconfirmed save'); };
    h.action('downloadSelectedRecovery')();
    assert.equal(h.errors.at(-1), 'The original archive could not be downloaded. Keep this page open and try again.');
    assert.doesNotMatch(h.errors.at(-1), /not (?:been )?replaced|unchanged/i);
    h.action('cancelRecovery')();
    assert.equal(h.errors.at(-1), 'Recovery canceled. Check this space before trying again, and keep your downloaded original archive and backup.');
    assert.doesNotMatch(h.errors.at(-1), /not (?:been )?replaced|unchanged/i);
    assert.equal(h.context.recovery, null); assert.equal(h.storage.values.get(target), bytesBeforeCancel);
    assert.equal(h.storage.values.get(archiveKey), archiveRaw); assert.equal(h.storage.writes.length, writesBeforeCancel);
    assert.equal(h.states.length, 0); assert.equal(h.notices.length, 0);
  }
});

test('cancel invalidates a selected ticket and stale confirmation without changing saved data', async () => {
  const h = harness(); await h.stage(); const ticket = h.context.recovery, confirm = h.action('confirmRecovery');
  h.action('cancelRecovery')();
  assert.equal(h.context.recovery, null); assert.match(h.errors.at(-1), /Recovery canceled/); assert.equal(h.storage.writes.length, 0);
  h.context.recovery = ticket; await confirm();
  assert.equal(h.storage.writes.length, 0); assert.equal(h.states.length, 0); assert.equal(h.notices.length, 0);
});

test('saved-data downloads preserve scoped legacy and malformed UTF-16 bytes in JSON envelopes', async () => {
  for (const user of [null, alice]) {
    const target = accounts.accountWorkspaceKey(user), sourceKey = user ? target : 'trippin.workspace.v1';
    const storage = memory([[sourceKey, corrupt], [accounts.accountWorkspaceKey(bob), 'unrelated account bytes']]);
    const h = harness({ user, storage }); h.action('downloadSavedData')();
    assert.equal(h.downloads.length, 1); assert.equal(h.downloads[0].download, 'trippin-storage-recovery.json');
    const exported = JSON.parse(await h.urls[0].text()); assert.equal(exported.kind, 'trippin.storage-recovery');
    assert.equal(exported.sourceKey, sourceKey); assert.equal(exported.raw, corrupt); assert.equal(exported.raw.charCodeAt(exported.raw.length - 2), 0xd800);
    assert.equal(h.storage.writes.length, 0); assert.equal(h.timers[0].ms, 1000); h.timers[0].callback();
    assert.deepEqual(h.downloads.at(-1), { revoked: 'blob:authored-1' });
  }
});

test('selected-original downloads retain the captured source and refuse stale choice, account or busy handlers', async () => {
  const h = harness({ user: alice }); await h.stage(); const selected = h.context.recovery;
  h.storage.values.set(selected.ticket.sourceKey, 'changed after selection');
  h.action('downloadSelectedRecovery')(); assert.equal(JSON.parse(await h.urls[0].text()).raw, corrupt);
  h.context.working.current = true; h.action('downloadSelectedRecovery')(); h.context.working.current = false;
  h.context.backupReadGeneration.current++; h.action('downloadSelectedRecovery')(); h.context.backupReadGeneration.current--;
  h.context.auth = { user: bob }; h.action('downloadSelectedRecovery')(); h.context.auth = { user: alice };
  h.context.epoch.current++; h.action('downloadSelectedRecovery')();
  assert.equal(h.urls.length, 1); assert.equal(h.storage.writes.length, 0);
});

test('original archive discovery survives reload and exports only the current namespace with exact nested bytes', async () => {
  const h = harness({ user: alice }); await h.stage(); await h.action('confirmRecovery')();
  const archiveKey = h.captures[0].archiveKey, archiveRaw = h.storage.values.get(archiveKey);
  h.storage.values.set(accounts.accountWorkspaceKey(bob) + '.recovery.other', 'other account archive');
  h.storage.values.set(accounts.accountWorkspaceKey(null) + '.recovery.guest', 'guest archive');
  const reloaded = harness({ user: alice, storage: h.storage }); reloaded.action('load')(alice);
  assert.equal(reloaded.context.recoveryArchiveCount, 1); assert.equal(reloaded.context.workspace.profile.name, 'Selected recovery backup');
  const button = reloaded.archiveButton(); assert.equal(button.tag, 'button'); assert.equal(buttonText(button), 'Download original recovery archives');
  assert.equal(button.props.disabled, false); button.props.onClick();
  const exported = JSON.parse(await reloaded.urls[0].text()); assert.equal(exported.kind, 'trippin.storage-recovery-collection');
  assert.deepEqual(exported.archives, [{ key: archiveKey, raw: archiveRaw }]); assert.equal(JSON.parse(exported.archives[0].raw).raw, corrupt);
  assert.equal(h.storage.writes.length, 2, 'Reload and archive exports add no writes.');
});

test('saved and archive download handlers refuse stale render epochs and pending account work', async () => {
  const h = harness(); await h.stage(); await h.action('confirmRecovery')();
  const original = h.action('downloadSavedData'), archives = h.action('downloadRecoveryArchives');
  h.context.working.current = true; original(); archives(); h.context.working.current = false;
  h.context.epoch.current++; original(); archives();
  assert.equal(h.urls.length, 0); assert.equal(h.downloads.length, 0); assert.equal(h.storage.writes.length, 2);
});

test('confirmation surface is hidden for stale account, stale file intent and another active form', async () => {
  const h = harness({ user: alice }); await h.stage(); const selected = h.context.recovery;
  assert.equal(h.dialog().props.title, 'Recover your saved travel space');
  h.context.epoch.current++; assert.ok(!h.dialog()); h.context.epoch.current--;
  h.context.backupReadGeneration.current++; assert.ok(!h.dialog()); h.context.backupReadGeneration.current--;
  h.context.key = accounts.accountWorkspaceKey(bob); assert.ok(!h.dialog()); h.context.key = accounts.accountWorkspaceKey(alice);
  h.context.form = 'trip'; assert.ok(!h.dialog()); h.context.form = null;
  assert.equal(h.context.recovery, selected); const commit = nodes(h.dialog(), node => node.props?.['aria-describedby'] === 'recovery-warning')[0];
  assert.equal(buttonText(commit), 'Archive original and restore backup'); assert.equal(commit.props.disabled, false);
});
