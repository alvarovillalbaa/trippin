// Executes the actual inline Workspace backup callbacks extracted with the TS
// AST. React, DOM, browser storage and downloads are controlled boundaries;
// validation, codecs and persistence use the actual frontend trip module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require(process.env.TRIPPIN_TYPESCRIPT_PATH || 'typescript');
const tripModule = new URL('../lib/trip.ts', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === './data' && context.parentURL === tripModule
      ? new URL('../lib/data.ts', import.meta.url).href : specifier, context);
  },
});
const trip = await import(tripModule);
const sourcePath = process.env.TRIPPIN_WORKSPACE_SOURCE
  || fileURLToPath(new URL('../components/workspace.tsx', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const parsedSource = ts.createSourceFile('workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(parsedSource.parseDiagnostics.length, 0);

function attribute(node, name) {
  return node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name);
}
function expression(attribute) {
  return attribute?.initializer && ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : undefined;
}
const callbacks = { restore: [], export: [] };
function findCallbacks(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsedSource) === 'input'
      && expression(attribute(node, 'ref'))?.getText(parsedSource) === 'backupInput') {
    callbacks.restore.push(expression(attribute(node, 'onChange')));
  }
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(parsedSource) === 'button'
      && node.children.some(child => ts.isJsxText(child) && child.text.trim() === 'Export backup')) {
    callbacks.export.push(expression(attribute(node.openingElement, 'onClick')));
  }
  ts.forEachChild(node, findCallbacks);
}
findCallbacks(parsedSource);
const scripts = {};
for (const name of ['restore', 'export']) {
  assert.equal(callbacks[name].length, 1, `Find one actual inline ${name} callback.`);
  assert.ok(ts.isArrowFunction(callbacks[name][0]), `${name} must remain an actual inline arrow callback.`);
  const compiled = ts.transpileModule(`module.exports = (${callbacks[name][0].getText(parsedSource)});`, {
    fileName: `backup-${name}.ts`, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  scripts[name] = new vm.Script(compiled.outputText, { filename: `actual-workspace-backup-${name}.mocked.cjs` });
}

const rawCap = 16 * 1024 * 1024;
const encode = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const plain = value => JSON.parse(JSON.stringify(value));
function workspaceWith(count = 1) {
  const workspace = trip.initialWorkspace(), template = workspace.trips[0];
  workspace.trips = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(template), id: `backup-ui-owned-trip-${index}`,
  }));
  workspace.selectedTripId = workspace.trips.at(-1).id;
  assert.ok(trip.isWorkspace(workspace));
  return plain(workspace);
}
function sizedWorkspace(length, character = 'x') {
  const workspace = workspaceWith(9), template = structuredClone(workspace.trips[0].days[0].activities[0]);
  for (const item of workspace.trips) {
    for (const day of item.days) day.activities = [];
    item.days[0].activities = Array.from({ length: 60 }, (_, index) => ({
      ...structuredClone(template), id: `backup-ui-owned-stop-${index}`, description: '',
    }));
  }
  let remaining = length - JSON.stringify(workspace).length;
  assert.ok(remaining > 0);
  for (const item of workspace.trips) for (const activity of item.days[0].activities) {
    const size = Math.min(4000, remaining);
    activity.description = character.repeat(size);
    remaining -= size;
  }
  assert.equal(remaining, 0);
  assert.equal(JSON.stringify(workspace).length, length);
  assert.ok(trip.isWorkspace(workspace));
  return workspace;
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function authoredFile(content, { failure, gate } = {}) {
  const bytes = content instanceof Uint8Array ? content : encode(content);
  const calls = { text: 0, arrayBuffer: 0 };
  return {
    size: bytes.byteLength, name: 'authored-backup.json', calls,
    async text() {
      calls.text++;
      if (gate) await gate.promise;
      if (failure) throw new Error('Authored backup read failure');
      return new TextDecoder().decode(bytes);
    },
    async arrayBuffer() {
      calls.arrayBuffer++;
      if (gate) await gate.promise;
      if (failure) throw new Error('Authored backup read failure');
      return bytes.slice().buffer;
    },
  };
}

function harness(initial = workspaceWith()) {
  const original = plain(initial);
  let current = plain(initial);
  let durable = JSON.stringify(initial);
  let failStorage = false;
  const storageKey = 'trippin.workspace.v1';
  const calls = { downloads: [], notices: [], states: [], days: [], selected: [], writes: [], events: [] };
  const input = { files: [], value: '' };
  const forbidden = () => { throw new Error('Unexpected browser, model, network or provider call in a pure backup UI test.'); };
  let context;
  const bindings = {
    ...trip,
    // Missing codec exports stay undefined on the old source: its actual old
    // callbacks do not reference them. No replacement implementation is used.
    exportWorkspaceBackup: trip.exportWorkspaceBackup,
    parseWorkspaceBackup: trip.parseWorkspaceBackup,
    MAX_BACKUP_FILE_BYTES: trip.MAX_BACKUP_FILE_BYTES,
    state: current, backupInput: { current: input }, pendingPlan: { current: null }, storageKey,
    backupReadGeneration: { current: 0 },
    Uint8Array, TextEncoder, TextDecoder, JSON, Error, fetch: forbidden,
    localStorage: {
      getItem(key) { assert.equal(key, storageKey); return durable; },
      setItem(key, value) {
        assert.equal(key, storageKey);
        assert.equal(typeof value, 'string');
        calls.writes.push(value);
        calls.events.push('storage attempt');
        if (failStorage) throw new Error('Authored storage quota failure');
        durable = value;
        calls.events.push('storage committed');
      },
    },
    download(name, data, type) {
      calls.downloads.push({ name, data, type });
      calls.events.push('download');
    },
    notify(message) {
      calls.notices.push(String(message));
      calls.events.push('notice');
    },
    setState(value) {
      current = plain(typeof value === 'function' ? value(current) : value);
      context.state = current;
      calls.states.push(plain(current));
      calls.events.push('UI replaced');
    },
    setDayIndex(value) { calls.days.push(value); },
    setSelected(value) { calls.selected.push(value); },
    process: { env: {} },
  };
  context = vm.createContext(bindings);
  function callback(name) {
    context.module = { exports: {} };
    scripts[name].runInContext(context);
    assert.equal(typeof context.module.exports, 'function');
    return context.module.exports;
  }
  return {
    calls, input, original,
    get current() { return current; }, get durable() { return durable; },
    setStorageFailure() { failStorage = true; },
    async export() { await callback('export')(); },
    restore(file, { releaseCurrentTarget = false } = {}) {
      input.files = [file]; input.value = file.name;
      const event = { target: input, currentTarget: input };
      const pending = callback('restore')(event);
      if (releaseCurrentTarget) event.currentTarget = null;
      return Promise.resolve(pending);
    },
  };
}
function unchanged(h, durable) {
  assert.deepEqual(h.current, h.original, 'A rejected backup must preserve the current UI workspace.');
  assert.equal(h.durable, durable, 'A rejected backup must preserve the durable workspace.');
  assert.deepEqual(h.calls.days, []);
  assert.deepEqual(h.calls.selected, []);
  assert.equal(h.calls.states.length, 0);
  assert.ok(!h.calls.notices.some(message => /backup restored/i.test(message)), 'Failure must not announce restore success.');
}

test('actual Export backup and Restore round-trip a valid CJK workspace above the old two-MB guard', async () => {
  const workspace = sizedWorkspace(1_999_900, '漢');
  const exporting = harness(workspace);
  await exporting.export();
  assert.equal(exporting.calls.downloads.length, 1);
  const download = exporting.calls.downloads[0];
  assert.equal(download.name, 'trippin-backup.json');
  assert.deepEqual(JSON.parse(download.data), workspace);
  const file = authoredFile(download.data);
  assert.ok(file.size > 2_000_000 && file.size < rawCap);
  const restoring = harness();
  await restoring.restore(file);
  assert.deepEqual(restoring.current, workspace);
  assert.deepEqual(JSON.parse(restoring.durable), workspace);
  assert.deepEqual(restoring.calls.days, [0]);
  assert.deepEqual(restoring.calls.selected, [null]);
});

test('the actual restore callback accepts an app-authored indented backup above two MB', async () => {
  const workspace = sizedWorkspace(1_999_900);
  const file = authoredFile(JSON.stringify(workspace, null, 2));
  assert.ok(file.size > 2_000_000 && file.size < rawCap);
  const h = harness();
  await h.restore(file);
  assert.deepEqual(h.current, workspace);
  assert.deepEqual(JSON.parse(h.durable), workspace);
});

test('failed file reads preserve UI and durable data and clear the input', async () => {
  const h = harness(), durable = h.durable;
  await h.restore(authoredFile(workspaceWith(2), { failure: true }));
  unchanged(h, durable);
  assert.ok(h.calls.notices.length);
  assert.equal(h.input.value, '');
});

test('invalid UTF-8 inside otherwise valid model JSON never becomes replacement text', async () => {
  const workspace = workspaceWith(2);
  workspace.profile.name = 'AUTHORED-UTF8-MARKER';
  const bytes = encode(workspace), offset = Buffer.from(bytes).indexOf(Buffer.from('AUTHORED-UTF8-MARKER'));
  assert.ok(offset >= 0);
  bytes[offset] = 0xff;
  const h = harness(), durable = h.durable;
  await h.restore(authoredFile(bytes));
  unchanged(h, durable);
  assert.equal(h.input.value, '');
});

test('unsupported backup model preserves UI and durable data and clears the input', async () => {
  const invalid = { ...workspaceWith(2), version: 99 };
  assert.equal(trip.isWorkspace(invalid), false);
  const h = harness(), durable = h.durable;
  await h.restore(authoredFile(invalid));
  unchanged(h, durable);
  assert.equal(h.input.value, '');
});

test('a raw file beyond the independent cap is rejected before reading and clears the input', async () => {
  const bytes = new Uint8Array(rawCap + 1).fill(0x20);
  bytes.set(encode(workspaceWith(2)));
  const file = authoredFile(bytes), h = harness(), durable = h.durable;
  await h.restore(file);
  unchanged(h, durable);
  assert.deepEqual(file.calls, { text: 0, arrayBuffer: 0 });
  assert.equal(h.input.value, '');
});

test('a storage failure preserves the current UI and durable data without a success notice', async () => {
  const h = harness(), durable = h.durable;
  h.setStorageFailure();
  await h.restore(authoredFile(workspaceWith(2)));
  unchanged(h, durable);
  assert.equal(h.calls.writes.length, 1, 'The real persistence boundary must be attempted before replacing UI.');
  assert.equal(h.input.value, '');
});

test('successful restore commits through actual persistence before UI replacement and permits reselecting the same file', async () => {
  const candidate = workspaceWith(2), file = authoredFile(candidate), h = harness();
  await h.restore(file);
  assert.deepEqual(h.current, candidate);
  assert.deepEqual(JSON.parse(h.durable), candidate);
  assert.equal(h.calls.writes.length, 1);
  const written = h.calls.events.indexOf('storage committed'), replaced = h.calls.events.indexOf('UI replaced');
  assert.ok(written >= 0 && written < replaced, 'Durability must precede visible replacement.');
  assert.equal(h.input.value, '');
  await h.restore(file);
  assert.equal(h.calls.writes.length, 2);
  assert.equal(h.input.value, '');
  assert.deepEqual(h.current, candidate);
});

test('the callback captures its input before React clears currentTarget across an await', async () => {
  const gate = deferred(), candidate = workspaceWith(2), h = harness();
  const pending = h.restore(authoredFile(candidate, { gate }), { releaseCurrentTarget: true });
  assert.equal(h.calls.states.length, 0);
  gate.resolve();
  await assert.doesNotReject(pending);
  assert.deepEqual(h.current, candidate);
  assert.deepEqual(JSON.parse(h.durable), candidate);
  assert.equal(h.input.value, '');
});

test('an oversized in-memory export remains a complete recovery download with an honest notice', async () => {
  const workspace = sizedWorkspace(2_000_001), h = harness(workspace);
  await h.export();
  assert.equal(h.calls.downloads.length, 1, 'Recovery must not be blocked by the normal workspace limit.');
  const download = h.calls.downloads[0];
  assert.match(download.name, /recovery.*\.json$/i);
  assert.deepEqual(JSON.parse(download.data), workspace);
  assert.ok(h.calls.notices.some(message => /recover|limit|restor/i.test(message)), 'Recovery must not claim normal restorability.');
  assert.deepEqual(h.current, workspace);
});

test('an older backup read cannot overwrite or announce after a newer valid restore, whether it succeeds or fails', async () => {
  const scenarios = [];
  for (const olderFails of [false, true]) {
    const h = harness(), olderGate = deferred(), newer = workspaceWith(3);
    const olderFile = authoredFile(workspaceWith(2), {
      gate: olderGate, failure: olderFails,
    });
    olderFile.name = 'older-backup.json';
    const olderPending = h.restore(olderFile);
    const newerFile = authoredFile(newer);
    newerFile.name = 'newer-backup.json';
    await h.restore(newerFile);
    assert.deepEqual(h.current, newer);
    assert.deepEqual(JSON.parse(h.durable), newer);
    assert.equal(h.calls.writes.length, 1);
    assert.equal(h.calls.states.length, 1);
    assert.equal(h.calls.notices.length, 1);
    assert.match(h.calls.notices[0], /backup restored/i);
    const afterNewer = plain(h.calls);
    olderGate.resolve();
    await assert.doesNotReject(olderPending);
    scenarios.push({ h, newer, afterNewer, olderFails });
  }
  // Settle both older-read outcomes before checking their final effects so the
  // regression run exercises both late success and late failure paths.
  for (const { h, newer, afterNewer, olderFails } of scenarios) {
    const outcome = olderFails ? 'late failure' : 'late success';
    assert.deepEqual(h.current, newer, `${outcome} must keep the newer UI workspace.`);
    assert.deepEqual(JSON.parse(h.durable), newer, `${outcome} must keep the newer durable workspace.`);
    assert.deepEqual(h.calls, afterNewer, `${outcome} must not write, reset selection, or announce anything.`);
    assert.equal(h.input.value, '');
  }
});

test('an older valid read stays inert while the latest invalid backup is pending and only the latest error clears its input', async () => {
  const h = harness(), durable = h.durable, olderGate = deferred(), latestGate = deferred();
  const olderFile = authoredFile(workspaceWith(2), { gate: olderGate });
  olderFile.name = 'older-valid-backup.json';
  const latestFile = authoredFile({ ...workspaceWith(3), version: 99 }, { gate: latestGate });
  latestFile.name = 'latest-invalid-backup.json';
  const olderPending = h.restore(olderFile);
  const latestPending = h.restore(latestFile);
  assert.equal(h.input.value, latestFile.name);
  olderGate.resolve();
  await assert.doesNotReject(olderPending);
  const whileLatestPending = {
    current: plain(h.current), durable: h.durable, calls: plain(h.calls),
    inputValue: h.input.value, inputFile: h.input.files[0],
  };
  latestGate.resolve();
  await assert.doesNotReject(latestPending);
  assert.deepEqual(whileLatestPending.current, h.original);
  assert.equal(whileLatestPending.durable, durable);
  for (const name of ['states', 'writes', 'days', 'selected', 'notices', 'events']) {
    assert.deepEqual(whileLatestPending.calls[name], [], `The older read must not produce ${name}.`);
  }
  assert.equal(whileLatestPending.inputValue, latestFile.name, 'The older finally must not clear the newer input.');
  assert.equal(whileLatestPending.inputFile, latestFile);
  unchanged(h, durable);
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.calls.notices.length, 1, 'Only the latest rejected backup announces its error.');
  assert.ok(h.calls.notices[0].length > 0);
  assert.equal(h.input.value, '');
});
