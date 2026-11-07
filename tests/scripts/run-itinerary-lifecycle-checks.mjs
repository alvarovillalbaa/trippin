#!/usr/bin/env node
// Two focused hosted browser-client journeys; no app install, build or server.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
const REPOSITORY = 'alvarovillalbaa/trippin';
const BRANCH = 'refs/heads/qa/trippin-itinerary-20261107-1';
const ACTIVE = '.github/workflows/itinerary-lifecycle-1.yml';
const BASE_COMMIT = 'a6ec77dcb116e52246374ac023dcb5b5f83fb029';
const SPEC = 'tests/integration/browser/itinerary-lifecycle.mjs';
const SPEC_SHA = '6c38253bcdfb0faa7bad18000a42fd13a94538f05a3bc83e088c70df5e2e1798';
const AGENTS_SHA = '7583455cdfa35fd20027c8a53055af094c48f7f704261570b3bdd0c6bbdf5e54';
const ADDED = [SPEC, 'tests/scripts/run-itinerary-lifecycle-checks.mjs', 'tests/README.md',
  'docs/proposals/itinerary-lifecycle-checks.md', 'docs/proposals/itinerary-lifecycle.workflow.yml.example'].sort();
const ORIGIN = 'https://trippin-theta.vercel.app';
const DEPLOYMENT = 'dpl_cj8QiA2iUWRyiTxDyhzjntbUFJ4q';
const CASES = [
  { id: 'L01', profile: 'desktop-chromium', title: 'desktop itinerary completion skipping restoration and existing alternative persist across reloads',
    viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false },
  { id: 'L02', profile: 'mobile-chromium', title: 'narrow touch itinerary completion skipping restoration and existing alternative persist across reloads',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const PLAYWRIGHT = { name: '@playwright/test', version: '1.61.1',
  resolved: 'https://registry.npmjs.org/@playwright/test/-/test-1.61.1.tgz',
  integrity: 'sha512-8nKv6+0RJSL9FE4jYOEGXnPeM/Hg12qZpmqzZjRh3qM0Y7c3z1mrOTfFLids72RDQYVh9WpLEfR5WdpNX4fkig==' };
const STREAM_LIMIT = 524288, REPORT_LIMIT = 2097152, BROWSER_LIMIT = 524288;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const need = (condition, code) => { if (!condition) throw new Error(code); };
const finite = error => /^[a-z0-9_]+$/.test(error?.message ?? '') ? error.message : 'controller_error';
const sourceCommit = process.argv[3], deployment = process.env.TRIPPIN_ITINERARY_EXPECTED_DEPLOYMENT;
need(process.argv.length === 4 && process.argv[2] === '--source-commit' && /^[a-f0-9]{40}$/.test(sourceCommit ?? ''), 'source_pin_required');
need(deployment === DEPLOYMENT, 'reviewed_deployment_pin_required');
need(process.version === 'v24.21.0' && process.platform === 'linux' && process.arch === 'x64' && process.env.CI === 'true'
  && process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === REPOSITORY
  && process.env.GITHUB_EVENT_NAME === 'create' && process.env.GITHUB_REF === BRANCH
  && process.env.TRIPPIN_ITINERARY_PUBLIC_REPOSITORY === 'true', 'approved_public_ci_required');
const event = JSON.parse(read(process.env.GITHUB_EVENT_PATH, 262144));
need(event.ref_type === 'branch' && event.ref === BRANCH.slice('refs/heads/'.length)
  && event.repository?.private === false && event.repository?.full_name === REPOSITORY, 'approved_create_event_required');
const enteredAt = Date.now(), jobStartText = process.env.TRIPPIN_ITINERARY_JOB_STARTED_MS;
need(/^\d{13}$/.test(jobStartText ?? ''), 'job_start_timestamp_required');
const jobStartedAt = Number(jobStartText);
need(Number.isSafeInteger(jobStartedAt) && jobStartedAt <= enteredAt && enteredAt - jobStartedAt < 900000, 'job_start_timestamp_invalid');
const admittedWorkEnd = Math.min(enteredAt + 720000, jobStartedAt + 900000 - 90000 - 30000);
need(admittedWorkEnd - enteredAt >= 317000, 'job_entry_window_unavailable');
const repo = fs.realpathSync(process.cwd()), parent = fs.realpathSync(process.env.RUNNER_TEMP ?? '');
need(path.isAbsolute(parent) && fs.statSync(parent).isDirectory(), 'runner_temp_invalid');
need(typeof process.env.HOME === 'string' && path.isAbsolute(process.env.HOME) && fs.statSync(process.env.HOME).isDirectory(), 'original_home_required');
need(Buffer.byteLength(path.join(parent, 'ti-XXXXXX')) <= 45
  && Buffer.byteLength(path.join(parent, 'ti-XXXXXX', 'tmp')) + 64 < 108, 'scratch_socket_path_budget');
const root = fs.mkdtempSync(path.join(parent, 'ti-'));
fs.chmodSync(root, 0o700);
const identity = fs.lstatSync(root), nonce = randomUUID().replaceAll('-', '');
fs.writeFileSync(path.join(root, '.owner'), nonce, { flag: 'wx', mode: 0o600 });
for (const name of ['tools', 'tmp', 'cache', 'config', 'data', 'state', 'browsers']) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ['npm-user', 'npm-global']) fs.writeFileSync(path.join(root, name), '', { flag: 'wx', mode: 0o600 });
const tools = path.join(root, 'tools'), specFile = path.join(tools, 'itinerary-lifecycle.mjs');
const env = {
  PATH: [path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter),
  HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC', CI: 'true', NO_COLOR: '1',
  TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'),
  XDG_CACHE_HOME: path.join(root, 'cache'), XDG_CONFIG_HOME: path.join(root, 'config'),
  XDG_DATA_HOME: path.join(root, 'data'), XDG_STATE_HOME: path.join(root, 'state'),
  NODE_COMPILE_CACHE: path.join(root, 'cache', 'node'),
  npm_config_userconfig: path.join(root, 'npm-user'), npm_config_globalconfig: path.join(root, 'npm-global'),
  npm_config_cache: path.join(root, 'cache', 'npm'), npm_config_registry: 'https://registry.npmjs.org/',
  npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false', npm_config_ignore_scripts: 'true',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
  PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'browsers'), PLAYWRIGHT_HTML_OPEN: 'never',
  TRIPPIN_ITINERARY_ORIGIN: ORIGIN, TRIPPIN_ITINERARY_EXPECTED_DEPLOYMENT: deployment,
  TRIPPIN_ITINERARY_SOURCE_ROOT: repo, TRIPPIN_ITINERARY_RUN_ROOT: root,
  TRIPPIN_ITINERARY_NONCE: nonce, TRIPPIN_ITINERARY_PLAYWRIGHT_ROOT: path.join(tools, 'node_modules/@playwright/test'), SOURCE_COMMIT: sourceCommit,
};
const report = {
  schemaVersion: 'trippin.itinerary-lifecycle.v1', sourceCommit, canonicalBaseCommit: BASE_COMMIT,
  expectedDeployment: deployment, expectedDeploymentSourceCommit: BASE_COMMIT, origin: ORIGIN,
  status: 'failed', startedAtUtc: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  scope: { tier: 'tier2', layer: 'focused-browser-client-integration', cases: CASES, workers: 1, retries: 0,
    appBuild: false, appDependencies: false, localServer: false, accounts: false, serverWrites: false, providers: false, models: false,
    priorCoreRepeated: false, priorCsvBackupZoomRepeated: false, screenshots: false, traces: false, videos: false },
  limits: { workSeconds: 720, cleanupSeconds: 90, browserChildSeconds: 310, browserWorkSeconds: 240, jobMinutes: 15,
    streamBytes: STREAM_LIMIT, streamGzipBytes: 131072, allStreamsGzipBytes: 786432, browserJsonBytes: BROWSER_LIMIT,
    reportBytes: REPORT_LIMIT, finalStdoutSeconds: 2 },
  timing: { earliestUserStepAtUtc: new Date(jobStartedAt).toISOString(), controllerEntryAtUtc: new Date(enteredAt).toISOString(),
    setupElapsedMs: enteredAt - jobStartedAt, admittedWorkMs: admittedWorkEnd - enteredAt, cleanupReservedMs: 90000,
    jobOutputAndStartupMarginMs: 30000, workDeadlineAtUtc: new Date(admittedWorkEnd).toISOString() },
  commands: [], guards: [], errors: [], sourceFiles: [],
  proofLimits: [
    'Two first focused browser-client journeys over built-in authored demo data, not server/database/provider, physical-device, account or full product acceptance.',
    'Preparation source differs from the served runtime Git commit; every prior application blob/mode stays baseline-exact except reviewed AGENTS documentation. Owner READY/source metadata and actual sole-DPL HTML observations remain separate evidence.',
    'No asset crawl or compiled/source-byte equivalence is claimed. Actual anonymous root/static reads can create hosting logs; known API/weather/tile/font reads are blocked and counted, not exercised.',
    'Only the pinned Playwright tool and its Chromium/runtime libraries are installed. Tool state/cache/config/browsers/temp remain owned; original HOME is retained. Linux system packages rely on runner teardown.',
    'Original child streams and demo-only storage snapshots remain bounded. Userspace deadlines cannot interrupt blocked kernel filesystem calls; external termination can prevent verified teardown.',
    'Exit/close/EOF/original groups plus same-UID owned-root PID/starttime scans qualify process cleanup. The attributed inventory is not a host-wide process count; any supervisory signal prevents acceptance.',
  ],
};
const workEnd = admittedWorkEnd;
let cleanupEnd, interrupted = false, globalExpired = false, baseline, baseTree, allGzip = 0, browserAttempted = false;
let browserScanUncertain = false, lastBrowserScan = 0, toolLockSha, toolPackages;
const browserProcesses = new Map(), active = new Set(), handlers = new Map();
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  const handler = () => { interrupted = true; for (const child of active) child.stop('interrupted'); };
  handlers.set(signal, handler); process.on(signal, handler);
}
const globalTimer = setTimeout(() => { globalExpired = true; for (const child of active) child.stop('global_deadline'); }, Math.max(1, workEnd + 90000 - Date.now()));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function owner() {
  const current = fs.lstatSync(root), marker = path.join(root, '.owner');
  need(path.dirname(root) === parent && current.isDirectory() && !current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino
    && current.uid === process.getuid() && (current.mode & 0o777) === 0o700
    && fs.lstatSync(marker).isFile() && !fs.lstatSync(marker).isSymbolicLink() && fs.lstatSync(marker).uid === process.getuid()
    && (fs.lstatSync(marker).mode & 0o777) === 0o600 && fs.readFileSync(marker, 'utf8') === nonce, 'scratch_identity_changed');
}
function read(file, maximum = 16777216) {
  const before = fs.lstatSync(file); need(before.isFile() && !before.isSymbolicLink() && before.size <= maximum, 'file_type_or_bound');
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file);
  need(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs && bytes.length === before.size, 'file_changed'); return bytes;
}
function scrub(value, maximum = 700) {
  let text = String(value ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  for (const [from, to] of [[root, '[scratch]'], [repo, '[repository]'], [process.env.HOME, '[runner-home]']]) if (from) text = text.split(from).join(to);
  return Buffer.from(text).subarray(0, maximum).toString('utf8');
}
function compressed(bytes, maximum = 131072) {
  const zip = gzipSync(bytes); need(zip.length <= maximum, 'raw_gzip_limit');
  return { encoding: 'gzip-base64', bytes: bytes.length, sha256: sha(bytes), compressedBytes: zip.length, data: zip.toString('base64') };
}
function groupAbsent(pid) { try { process.kill(-pid, 0); return false; } catch (error) { return error.code === 'ESRCH' ? true : null; } }
function proc(pid) {
  const base = `/proc/${pid}`, item = fs.statSync(base);
  if (item.uid !== process.getuid()) return null;
  const before = readProc(path.join(base, 'stat'), 8192).toString(), close = before.lastIndexOf(')');
  need(close > 0, 'proc_stat_shape');
  const fields = before.slice(close + 2).trim().split(/\s+/);
  need(fields.length >= 20 && /^\d+$/.test(fields[19]), 'proc_stat_shape');
  const args = readProc(path.join(base, 'cmdline'), 65536).toString().split('\0').filter(Boolean);
  const after = readProc(path.join(base, 'stat'), 8192).toString(), afterClose = after.lastIndexOf(')');
  need(afterClose > 0 && after.slice(afterClose + 2).trim().split(/\s+/)[19] === fields[19], 'proc_identity_changed');
  const owned = args.some(arg => arg === root || arg.startsWith(root + '/') || arg.includes('=' + root + '/'))
    || browserProcesses.has(pid + ':' + fields[19]);
  return { pid, ppid: Number(fields[1]), pgid: Number(fields[2]), session: Number(fields[3]), state: fields[0],
    starttime: fields[19], owned, executable: args.length ? path.basename(args[0].trim().split(/\s+/)[0]).slice(0, 80) : '' };
}
function readProc(file, maximum) {
  const fd = fs.openSync(file, 'r');
  try { const buffer = Buffer.alloc(maximum + 1), length = fs.readSync(fd, buffer, 0, buffer.length, 0); need(length <= maximum, 'proc_read_bound'); return buffer.subarray(0, length); }
  finally { fs.closeSync(fd); }
}
function scanBrowsers(force = false) {
  if (!browserAttempted || (!force && Date.now() - lastBrowserScan < 500)) return [];
  lastBrowserScan = Date.now(); const names = fs.readdirSync('/proc').filter(name => /^\d+$/.test(name));
  need(names.length <= 8192, 'proc_inventory_bound'); const present = [];
  for (const name of names) {
    const pid = Number(name); if (pid === process.pid) continue;
    try {
      const item = proc(pid); if (!item?.owned) continue;
      // The command supervisor owns its own process group; this supplementary
      // inventory records detached browser descendants without logging argv.
      const key = item.pid + ':' + item.starttime;
      if (!browserProcesses.has(key)) browserProcesses.set(key, { ...item, firstSeenAtUtc: new Date().toISOString() });
      need(browserProcesses.size <= 256, 'browser_process_inventory_bound');
      present.push(item);
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) browserScanUncertain = true;
    }
  }
  return present;
}
async function cleanupBrowsers() {
  owner(); const started = Date.now(); let present = scanBrowsers(true), termSent = 0, killSent = 0;
  while (present.length && Date.now() - started < 6500 && Date.now() < cleanupEnd - 10000) {
    for (const item of present) {
      try {
        const current = proc(item.pid);
        need(current?.owned && current.starttime === item.starttime, 'browser_pid_identity_changed');
        const signal = Date.now() - started >= 3000 ? 'SIGKILL' : 'SIGTERM';
        process.kill(item.pid, signal); if (signal === 'SIGKILL') killSent++; else termSent++;
      } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) browserScanUncertain = true; }
    }
    await pause(100); present = scanBrowsers(true);
  }
  const stillPresent = scanBrowsers(true);
  report.browserProcessCleanup = { passed: !browserScanUncertain && stillPresent.length === 0,
    basis: 'Same UID, unique owned-root argv attribution and revalidated Linux kernel PID starttime; no argv/env output.',
    observed: [...browserProcesses.values()], remaining: stillPresent, termSent, killSent, scanUncertain: browserScanUncertain };
  need(report.browserProcessCleanup.passed, 'browser_process_cleanup_unverified');
}
async function run(label, executable, args, seconds, { cleanup = false, retainFailure = false, cwd = repo, postScratch = false } = {}) {
  if (postScratch) need(cleanup && report.scratchCleanup === 'passed' && !fs.existsSync(root), 'scratch_postguard_invalid'); else owner();
  need(cleanup || (!interrupted && !globalExpired), 'interrupted_before_command');
  const end = cleanup ? cleanupEnd : workEnd, remaining = end - Date.now() - 6500;
  need(remaining > 0, 'command_budget_exhausted');
  const commandEnv = postScratch ? { PATH: env.PATH, HOME: env.HOME, LANG: env.LANG, TZ: env.TZ,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } : env;
  const started = Date.now(), child = spawn(executable, args, { cwd, env: commandEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [[], []], count = [0, 0], size = [0, 0], digest = [createHash('sha256'), createHash('sha256')], eof = [false, false];
  let exitCode = null, signal = null, exited = false, closed = false, reason = null, stopAt = null, termSent = false, killSent = false, forcedDrain = false, captureFinished = false;
  const control = { stop(why) {
    if (!reason) { reason = why; stopAt = Date.now(); }
    if (!termSent && child.pid) { termSent = true; try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  } };
  active.add(control);
  child.once('error', () => { control.stop('spawn_failed'); });
  child.once('exit', (code, received) => { exited = true; exitCode = code; signal = received; });
  child.once('close', () => { closed = true; });
  [child.stdout, child.stderr].forEach((stream, index) => {
    stream.once('end', () => { eof[index] = true; });
    stream.on('data', bytes => {
      if (captureFinished) return;
      count[index] += bytes.length; digest[index].update(bytes);
      const kept = bytes.subarray(0, Math.max(0, STREAM_LIMIT - size[index])); chunks[index].push(kept); size[index] += kept.length;
      if (count[index] > STREAM_LIMIT) control.stop('output_limit');
    });
  });
  let leaderClosedAt = null;
  while (true) {
    if (label === 'browser_cases') { try { scanBrowsers(); } catch { browserScanUncertain = true; } }
    const now = Date.now(), absent = child.pid ? groupAbsent(child.pid) : true;
    if (closed && leaderClosedAt === null) leaderClosedAt = now;
    if (interrupted && !cleanup) control.stop('interrupted');
    if (now - started >= Math.min(seconds * 1000, remaining)) control.stop('timeout');
    if (closed && exited && eof.every(Boolean) && absent === true) break;
    if (closed && !child.pid) break;
    if (leaderClosedAt !== null && absent !== true && now - leaderClosedAt >= 1500) control.stop('process_group_remaining');
    if (stopAt !== null && now - stopAt >= 3000 && !killSent && child.pid && absent !== true) {
      killSent = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }
    if (stopAt !== null && now - stopAt >= 6000) {
      forcedDrain = !closed || !eof.every(Boolean);
      if (forcedDrain) { child.stdout.destroy(); child.stderr.destroy(); }
      break;
    }
    await pause(25);
  }
  captureFinished = true; const output = chunks.map(parts => Buffer.concat(parts));
  const row = { label, args: [executable === process.execPath ? '[node]' : scrub(executable, 250), ...args.map(value => scrub(value, 250))],
    exitCode, signal, stopReason: reason, exitObservedAndReaped: exited, closeObserved: closed, pipesEOF: [...eof],
    forcedDrain, originalProcessGroupAbsent: child.pid ? groupAbsent(child.pid) : true, termSent, killSent, durationMs: Date.now() - started,
    streams: output.map((bytes, index) => {
      const raw = compressed(bytes); allGzip += raw.compressedBytes;
      return { name: index ? 'stderr' : 'stdout', observedBytes: count[index], observedSha256: digest[index].digest('hex'),
        complete: closed && eof[index] && count[index] === bytes.length && !forcedDrain, raw, head: scrub(bytes.toString(), 500), tail: scrub(bytes.subarray(Math.max(0, bytes.length - 700)).toString(), 700) };
    }) };
  row.released = exited && closed && eof.every(Boolean) && !forcedDrain && row.originalProcessGroupAbsent === true;
  report.commands.push(row); active.delete(control);
  need(allGzip <= 786432, 'all_streams_gzip_limit');
  const accepted = row.exitCode === 0 && row.signal === null && row.stopReason === null && row.released && row.streams.every(stream => stream.complete);
  if (!retainFailure) need(accepted, label + '_failed');
  return { output, row, accepted };
}
function parseGit(bytes, index) {
  const rows = new Map();
  for (const record of bytes.toString().split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t'), header = record.slice(0, tab).split(' '), name = record.slice(tab + 1);
    need(tab > 0 && name && !path.isAbsolute(name) && !name.split('/').some(part => !part || part === '.' || part === '..') && !rows.has(name), 'git_entry_invalid');
    need(index ? header[2] === '0' : header[1] === 'blob', 'git_entry_type'); rows.set(name, { mode: header[0], gitBlob: header[index ? 1 : 2] });
  }
  return rows;
}
function fileVector(name) {
  const file = path.join(repo, name);
  for (let current = path.dirname(file); current !== repo; current = path.dirname(current)) {
    const item = fs.lstatSync(current); need(item.isDirectory() && !item.isSymbolicLink(), 'tracked_ancestor_changed');
  }
  const before = fs.lstatSync(file), mode = before.isSymbolicLink() ? '120000' : before.isFile() ? (before.mode & 0o111 ? '100755' : '100644') : null;
  need(mode, 'tracked_type_invalid');
  const bytes = before.isSymbolicLink() ? fs.readlinkSync(file, { encoding: 'buffer' }) : read(file), after = fs.lstatSync(file);
  need(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, 'tracked_file_changed');
  return { path: name, mode, gitBlob: gitBlob(bytes), bytes: bytes.length, sha256: sha(bytes) };
}


async function canonicalBase() {
  const parentCommit = (await run('canonical_parent', 'git', ['rev-parse', 'HEAD^'], 10)).output[0].toString().trim();
  need(parentCommit === BASE_COMMIT, 'canonical_parent_changed');
  const bytes = (await run('canonical_tree', 'git', ['ls-tree', '-r', '-l', '-z', BASE_COMMIT], 10)).output[0];
  baseTree = parseGit(bytes, false);
  const total = bytes.toString().split('\0').filter(Boolean).reduce((sum, row) => {
    const fields = row.slice(0, row.indexOf('\t')).trim().split(/\s+/);
    need(fields.length === 4 && /^\d+$/.test(fields[3]), 'canonical_blob_size'); return sum + Number(fields[3]);
  }, 0);
  need(baseTree.size === 97 && total === 3412994 && ADDED.every(name => !baseTree.has(name)), 'canonical_baseline_changed');
  report.canonicalBaseline = { commit: BASE_COMMIT, blobs: 97, bytes: total, treeSha256: sha(bytes), onlyAddedPaths: ADDED,
    onlyModifiedPriorPaths: ['AGENTS.md'], allPriorModesAndUnmodifiedBlobsRequiredUnchanged: true,
    qualification: 'The sole prior modification is scoped documentation; all prior application inputs remain baseline-exact.' };
}
async function guard(label, cleanup = false, postScratch = false) {
  const result = { label, passed: false }; report.guards.push(result); const options = { cleanup, postScratch };
  need((await run(label + '_head', 'git', ['rev-parse', 'HEAD'], 10, options)).output[0].toString().trim() === sourceCommit, 'head_changed');
  need(!fs.existsSync(path.join(repo, ACTIVE)), 'active_workflow_in_source');
  const tree = parseGit((await run(label + '_tree', 'git', ['ls-tree', '-r', '-z', 'HEAD'], 10, options)).output[0], false);
  const index = parseGit((await run(label + '_index', 'git', ['ls-files', '--stage', '-z'], 10, options)).output[0], true);
  need(baseTree && tree.size === 102 && index.size === tree.size, 'tracked_count_changed');
  for (const [name, item] of baseTree) {
    need(tree.get(name)?.mode === item.mode, 'prior_mode_changed');
    if (name === 'AGENTS.md') need(fileVector(name).sha256 === AGENTS_SHA && tree.get(name)?.gitBlob !== item.gitBlob, 'reviewed_scope_document_changed');
    else need(tree.get(name)?.gitBlob === item.gitBlob, 'prior_application_or_document_changed');
  }
  need(isDeepStrictEqual([...tree.keys()].filter(name => !baseTree.has(name)).sort(), ADDED), 'added_source_scope_changed');
  const vector = [];
  for (const [name, item] of tree) {
    const value = fileVector(name); need(index.get(name)?.mode === item.mode && index.get(name)?.gitBlob === item.gitBlob
      && value.mode === item.mode && value.gitBlob === item.gitBlob, 'full_tracked_source_changed'); vector.push(value);
  }
  need((await run(label + '_status', 'git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 10, options)).output[0].length === 0, 'worktree_not_clean');
  await run(label + '_diff', 'git', ['-c', 'core.filemode=true', 'diff', '--no-ext-diff', '--no-textconv', '--quiet', '--exit-code', 'HEAD', '--'], 10, options);
  const ignored = (await run(label + '_ignored', 'git', ['status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=normal'], 10, options)).output[0];
  need(ignored.length === 0, 'repository_generated_output');
  if (!baseline) { baseline = vector; report.sourceFiles = vector; }
  need(isDeepStrictEqual(vector, baseline), 'source_vector_changed');
  Object.assign(result, { passed: true, trackedFiles: vector.length, sourceBytes: vector.reduce((sum, file) => sum + file.bytes, 0),
    vectorSha256: sha(JSON.stringify(vector)), fullHeadIndexModesAndBytes: true, noUntrackedOrIgnoredOutput: true, priorApplicationInputsUnchanged: true });
}
function validIntegrity(value) {
  if (typeof value !== 'string') return false;
  const match = /^(sha1|sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  return bytes.toString('base64') === match[2] && bytes.length === ({ sha1: 20, sha256: 32, sha384: 48, sha512: 64 })[match[1]];
}
function retainToolState() {
  owner(); const file = path.join(tools, 'package-lock.json');
  if (!fs.existsSync(file)) return;
  const bytes = read(file, 524288);
  report.toolLock = { raw: compressed(bytes), packageJsonSha256: sha(read(path.join(tools, 'package.json'), 32768)), selected: [] };
  const value = JSON.parse(bytes);
  need(value.lockfileVersion === 3 && isDeepStrictEqual(value.packages?.['']?.dependencies, { '@playwright/test': '1.61.1' }), 'tool_manifest_changed');
  let count = 0;
  for (const [name, item] of Object.entries(value.packages)) {
    if (!name) continue;
    need(name.startsWith('node_modules/') && !item.link && typeof item.resolved === 'string', 'tool_lock_entry_invalid');
    const url = new URL(item.resolved);
    need(url.protocol === 'https:' && url.host === 'registry.npmjs.org' && !url.username && !url.password && !url.search
      && !url.hash && url.pathname.endsWith('.tgz') && validIntegrity(item.integrity), 'tool_lock_origin_or_integrity');
    count++;
  }
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    const item = value.packages['node_modules/' + name];
    need(item?.version === PLAYWRIGHT.version, 'playwright_lock_version');
    if (name === PLAYWRIGHT.name) need(item.resolved === PLAYWRIGHT.resolved && item.integrity === PLAYWRIGHT.integrity, 'playwright_archive_pin');
    report.toolLock.selected.push({ name, version: item.version, resolved: item.resolved, integrity: item.integrity });
  }
  report.toolLock.registryEntriesVerified = count;
}
function installedToolGuard() {
  const observations = [];
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    const bytes = read(path.join(tools, 'node_modules', name, 'package.json'), 65536), value = JSON.parse(bytes);
    observations.push({ name: value.name, version: value.version, packageJsonSha256: sha(bytes) });
    need(value.name === name && value.version === PLAYWRIGHT.version, 'playwright_installed_identity');
    if (name === '@playwright/test') need(value.dependencies?.playwright === PLAYWRIGHT.version, 'playwright_dependency_binding');
    if (name === 'playwright') need(value.dependencies?.['playwright-core'] === PLAYWRIGHT.version, 'playwright_core_binding');
  }
  if (toolPackages) need(isDeepStrictEqual(observations, toolPackages), 'installed_tool_manifest_changed'); else toolPackages = observations;
  report.runtime.toolPackages = observations;
  report.runtime.playwright = PLAYWRIGHT.version;
}
function generate() {
  const bytes = read(path.join(repo, SPEC), 131072); need(sha(bytes) === SPEC_SHA, 'browser_source_hash');
  fs.writeFileSync(specFile, bytes, { flag: 'wx', mode: 0o600 });
  report.generated = { sourceSpec: SPEC, sourceSha256: SPEC_SHA, generatedSha256: sha(read(specFile, 131072)), copiedByteExact: read(specFile, 131072).equals(bytes),
    noApplicationImportTransform: true };
  need(report.generated.copiedByteExact, 'browser_source_copy_changed');
}


const STAGES = ['baseline', 'done_first', 'done_undone', 'done_again', 'done_reloaded', 'skipped', 'skipped_reloaded', 'restored', 'restored_reloaded', 'swapped', 'swapped_reloaded'];
const DRIVER_SOURCES = ['lib/data.ts', 'lib/trip.ts', 'components/workspace.tsx', 'components/trip-map.tsx', 'app/globals.css', 'app/layout.tsx'];
const copy = value => JSON.parse(JSON.stringify(value));
function decodedSnapshot(raw) {
  need(raw?.encoding === 'gzip-base64' && Number.isSafeInteger(raw.bytes) && raw.bytes > 0 && raw.bytes <= 262144
    && Number.isSafeInteger(raw.compressedBytes) && raw.compressedBytes > 0 && raw.compressedBytes <= 32768
    && /^[a-f0-9]{64}$/.test(raw.sha256 ?? '') && typeof raw.data === 'string' && raw.data.length <= 43692, 'workspace_capture_shape');
  const zip = Buffer.from(raw.data, 'base64');
  need(zip.toString('base64') === raw.data && zip.length === raw.compressedBytes, 'workspace_capture_base64');
  const bytes = gunzipSync(zip, { maxOutputLength: 262144 });
  need(bytes.length === raw.bytes && sha(bytes) === raw.sha256 && Buffer.from(bytes.toString('utf8')).equals(bytes), 'workspace_capture_digest');
  return { bytes, value: JSON.parse(bytes) };
}
function day(value) {
  const trips = value?.trips?.filter(item => item.id === 'trip-munich');
  need(trips?.length === 1, 'workspace_trip_identity');
  const days = trips[0].days?.filter(item => item.id === 'munich-day-1');
  need(days?.length === 1 && Array.isArray(days[0].activities), 'workspace_day_identity'); return days[0];
}
function activity(value, id) {
  const rows = day(value).activities.filter(item => item.id === id);
  need(rows.length === 1, 'workspace_activity_identity'); return rows[0];
}
function demoBaseline(value) {
  need(value.version === 1 && value.selectedTripId === 'trip-munich' && value.profile?.name === 'Alex Morgan'
    && value.trips.length === 3 && value.trips.every(item => item.isPublic === false)
    && isDeepStrictEqual(value.trips.map(item => item.id).sort(), ['trip-copenhagen', 'trip-lisbon', 'trip-munich']), 'authored_private_demo_identity');
  const coffee = activity(value, 'm1-coffee'), garden = activity(value, 'm1-garden'), museum = activity(value, 'm1-museum');
  need(day(value).activities.length === 5 && coffee.title === 'Coffee, then whatever' && coffee.status === 'planned' && coffee.time === '09:30' && coffee.cost === 9
    && garden.title === 'An English Garden kind of afternoon' && garden.status === 'planned' && garden.time === '14:30' && garden.cost === 0
    && museum.title === 'Rain plan: a modern-art detour' && museum.status === 'skipped' && museum.time === '14:30' && museum.cost === 12
    && museum.alternativeFor === 'm1-garden' && [coffee, garden, museum].every(item => item.source === 'demo'), 'authored_activity_baseline');
}
function expectedWorkspaces(value) {
  const expected = copy(value), output = [copy(expected)];
  for (const status of ['done', 'planned', 'done', 'done', 'skipped', 'skipped', 'planned', 'planned']) {
    activity(expected, 'm1-coffee').status = status; output.push(copy(expected));
  }
  const target = day(expected), previousGarden = copy(activity(expected, 'm1-garden')), replacement = copy(activity(expected, 'm1-museum'));
  replacement.status = 'planned'; replacement.time = previousGarden.time; delete replacement.alternativeFor;
  previousGarden.status = 'skipped'; previousGarden.alternativeFor = 'm1-museum';
  target.activities = [activity(expected, 'm1-coffee'), ...target.activities.filter(item => !['m1-coffee', 'm1-garden', 'm1-museum'].includes(item.id)), replacement, previousGarden];
  output.push(copy(expected), copy(expected)); need(output.length === 11, 'expected_stage_count'); return output;
}
function browserResults(bytes) {
  report.browser = { raw: compressed(bytes), accepted: false };
  need(bytes.length <= BROWSER_LIMIT && Buffer.from(bytes.toString('utf8')).equals(bytes), 'browser_output_bound_or_utf8');
  const prefix = 'TRIPPIN_ITINERARY_BROWSER_RESULT=', text = bytes.toString('utf8');
  need(text.startsWith(prefix) && text.endsWith('\n') && text.slice(prefix.length, -1).indexOf('\n') === -1, 'browser_unique_result_marker');
  const value = JSON.parse(text.slice(prefix.length, -1)); report.browser.result = value;
  need(value.schemaVersion === 1 && value.sourceCommit === sourceCommit && value.origin === ORIGIN
    && value.expectedDeployment === deployment && value.expectedRuntimeCommit === BASE_COMMIT
    && value.tier === 'tier2' && value.layer === 'focused-browser-client-integration', 'browser_result_identity');
  need(value.runtime?.node === process.version && value.runtime.playwright === PLAYWRIGHT.version
    && value.runtime.applicationImports === false && value.runtime.storageMutationByHarness === false
    && isDeepStrictEqual(value.runtime.profiles, CASES.map(({ id, profile, viewport, isMobile, hasTouch }) => ({ id, profile, viewport, isMobile, hasTouch })))
    && typeof value.runtime.browserVersion === 'string' && value.runtime.browserVersion.length <= 100, 'browser_runtime_identity');
  need(isDeepStrictEqual(value.limits, { workSeconds: 240, caseSeconds: 100, cleanupSeconds: 60, stdoutSeconds: 2,
    navigationSeconds: 30, actionSeconds: 10, workspaceBytes: 262144, snapshotGzipBytes: 32768,
    allSnapshotGzipBytes: 131072, reportBytes: 524288, boundaryEvents: 24 }), 'browser_limits_changed');
  need(Array.isArray(value.sourceFiles) && value.sourceFiles.length === 6, 'browser_source_vector');
  for (let index = 0; index < DRIVER_SOURCES.length; index++) {
    const actual = value.sourceFiles[index], bound = report.sourceFiles.find(item => item.path === DRIVER_SOURCES[index]);
    need(actual.path === DRIVER_SOURCES[index] && actual.bytes === bound?.bytes && actual.sha256 === bound.sha256
      && (actual.mode & 0o111 ? '100755' : '100644') === bound.mode
      && Number.isSafeInteger(actual.dev) && Number.isSafeInteger(actual.ino), 'browser_source_binding');
  }
  need(Array.isArray(value.cases) && value.cases.length === 2, 'browser_case_count');
  let gzipBytes = 0, rawBytes = 0;
  report.browser.independentCases = [];
  for (let index = 0; index < CASES.length; index++) {
    const expectedCase = CASES[index], actual = value.cases[index], observation = actual.observations;
    need(actual.id === expectedCase.id && actual.profile === expectedCase.profile && actual.title === expectedCase.title
      && actual.accepted === true && actual.error === null && actual.cleanupError === undefined, 'browser_case_status');
    need(observation?.stage === 'complete' && observation.freshContextEmpty === true
      && isDeepStrictEqual(observation.fixture, { source: 'application-authored-private-demo', tripId: 'trip-munich', dayId: 'munich-day-1',
        coffeeId: 'm1-coffee', gardenId: 'm1-garden', museumId: 'm1-museum', noImportOrStorageSeed: true,
        originalTripCount: 3, originalTime: '14:30', baselineAlternativeId: 'm1-museum' }), 'browser_authored_fixture');
    need(observation.viewport?.innerWidth === expectedCase.viewport.width && observation.viewport.innerHeight === expectedCase.viewport.height
      && observation.viewport.devicePixelRatio === 1 && Number.isSafeInteger(observation.viewport.maxTouchPoints)
      && (expectedCase.hasTouch ? observation.viewport.maxTouchPoints > 0 : observation.viewport.maxTouchPoints === 0), 'browser_viewport');
    need(Array.isArray(observation.snapshots) && observation.snapshots.length === 11, 'browser_snapshot_count');
    const decoded = observation.snapshots.map(row => decodedSnapshot(row.raw)); demoBaseline(decoded[0].value);
    const expected = expectedWorkspaces(decoded[0].value);
    for (let stage = 0; stage < STAGES.length; stage++) {
      const row = observation.snapshots[stage], item = decoded[stage], serialized = Buffer.from(JSON.stringify(expected[stage]));
      rawBytes += row.raw.bytes; gzipBytes += row.raw.compressedBytes;
      need(row.stage === STAGES[stage] && row.durableMatchesExpected === true && row.expectedSha256 === sha(serialized)
        && item.bytes.equals(serialized) && isDeepStrictEqual(item.value, expected[stage]), 'whole_workspace_transition_or_preservation');
      const target = day(item.value), visible = target.activities.filter(item => !item.alternativeFor), activeRows = visible.filter(item => item.status !== 'skipped');
      const project = entry => ({ id: entry.id, status: entry.status, time: entry.time, cost: entry.cost, alternativeFor: entry.alternativeFor ?? null });
      need(isDeepStrictEqual(row.coffee, project(activity(item.value, 'm1-coffee'))) && isDeepStrictEqual(row.garden, project(activity(item.value, 'm1-garden')))
        && isDeepStrictEqual(row.museum, project(activity(item.value, 'm1-museum'))) && isDeepStrictEqual(row.visibleIds, visible.map(entry => entry.id))
        && isDeepStrictEqual(row.activeIds, activeRows.map(entry => entry.id)), 'workspace_projection_binding');
      const amount = activeRows.reduce((sum, entry) => sum + entry.cost, 0), stops = stage === 5 || stage === 6 ? 3 : 4, euros = stage >= 9 ? 37 : stops === 3 ? 16 : 25;
      need(row.activeStops === stops && activeRows.length === stops && row.estimatedEUR === euros && amount === euros
        && typeof row.uiEstimate === 'string' && Buffer.byteLength(row.uiEstimate) <= 1024
        && row.uiEstimate.includes(stops + ' stops') && row.uiEstimate.includes('€' + euros + ' estimated'), 'visible_count_and_estimate');
    }
    need(Array.isArray(observation.rootNavigations) && observation.rootNavigations.length === 5 && observation.rootNavigations.every(row => row.status === 200
      && row.sameOrigin === true && row.rootPath === true && row.deploymentIdCount === 1 && row.matchesExpected === true && row.bodyRetained === false
      && Number.isSafeInteger(row.bodyBytes) && row.bodyBytes > 0 && row.bodyBytes <= 2097152 && /^[a-f0-9]{64}$/.test(row.bodySha256 ?? '')
      && row.bodyEvidence === 'Observed Playwright decoded HTML body; no wire-byte or compiled-source equivalence claim.'), 'actual_root_deployment_observations');
    const boundary = actual.boundary;
    need(boundary && ['unexpectedReads', 'blockedMutations', 'blockedWebSockets', 'pageErrors', 'pageCrashes', 'allowedRequestFailures', 'responseErrors',
      'unexpectedPages', 'unexpectedDownloads', 'routeErrors', 'pendingRequests', 'pendingJobs'].every(key => boundary[key] === 0)
      && ['allowedReads', 'blockedApi', 'blockedWeather', 'blockedTiles', 'blockedFonts', 'requestsFinished', 'knownBlockedFailures']
        .every(key => Number.isSafeInteger(boundary[key]) && boundary[key] >= 0)
      && boundary.allowedReads > 0 && Array.isArray(boundary.events) && boundary.events.length === 0
      && Array.isArray(boundary.diagnostics) && boundary.diagnostics.length === 0, 'strict_browser_boundaries');
    need(Array.isArray(boundary.allowedAssetPaths) && boundary.allowedAssetPaths.length > 0 && boundary.allowedAssetPaths.length <= 256
      && isDeepStrictEqual(boundary.allowedAssetPaths, [...new Set(boundary.allowedAssetPaths)].sort())
      && boundary.allowedAssetPaths.every(name => name === '/' || /^\/_next\/static\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:js|css|woff2?|ttf|otf)$/.test(name)
        || /^\/images\/(?:munich|lisbon|copenhagen|barcelona)\.jpg$/.test(name) || ['/images/world.svg', '/icon.svg', '/favicon.ico'].includes(name)), 'allowed_static_observations');
    report.browser.independentCases.push({ id: actual.id, profile: actual.profile, snapshotsDecoded: 11, wholeWorkspaceTransitionsAndUntouchedValues: true,
      actualRootNavigationObservations: 5, sameAuthoredAlternativeIdAndTime: true, completionReversalObserved: true, skipRestorePlanned: true, zeroFatalBoundaries: true });
  }
  report.browser.snapshotOriginals = { count: 22, rawBytes, gzipBytes, independentlyDecoded: true };
  need(gzipBytes <= 131072, 'all_workspace_gzip_bound');
  const cleanup = value.cleanup;
  need(cleanup?.passed === true && cleanup.contextsCreated === 2 && cleanup.contextsClosed === 2 && cleanup.pagesCreated === 2 && cleanup.pagesClosed === 2
    && cleanup.browserClosed === true && cleanup.browserDisconnectedObserved === true && cleanup.remainingContexts === 0 && cleanup.pendingJobs === 0 && cleanup.pendingRequests === 0
    && Array.isArray(cleanup.failures) && cleanup.failures.length === 0, 'browser_context_and_job_closure');
  need(value.status === 'passed' && Array.isArray(value.errors) && value.errors.length === 0, 'browser_result_failed');
  report.browser.accepted = true;
}


try {
  await canonicalBase(); await guard('before');
  need(JSON.parse(read(path.join(repo, 'package.json'), 32768)).name === 'trippin', 'package_identity');
  report.runtime.nodeSha256 = sha(read(process.execPath, 268435456));
  const npm = fs.realpathSync(path.join(path.dirname(process.execPath), 'npm'));
  need(fs.statSync(npm).isFile(), 'npm_cli_missing'); report.runtime.npmCliSha256 = sha(read(npm, 1048576));
  report.runtime.npm = (await run('npm_version', process.execPath, [npm, '--version'], 15, { cwd: tools })).output[0].toString().trim();
  fs.writeFileSync(path.join(tools, 'package.json'), JSON.stringify({ name: 'trippin-itinerary-owned-tool', private: true,
    version: '1.0.0', dependencies: { '@playwright/test': PLAYWRIGHT.version } }) + '\n', { flag: 'wx', mode: 0o600 });
  const generated = await run('generate_tool_lock', process.execPath, [npm, 'install', '--package-lock-only', '--ignore-scripts',
    '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/'], 90, { cwd: tools, retainFailure: true });
  retainToolState(); need(generated.accepted, 'tool_lock_generation_failed'); need(report.toolLock, 'tool_lock_missing');
  toolLockSha = report.toolLock.raw.sha256;
  await run('frozen_tool_ci', process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund',
    '--registry=https://registry.npmjs.org/'], 120, { cwd: tools });
  need(sha(read(path.join(tools, 'package-lock.json'), 524288)) === toolLockSha, 'frozen_tool_lock_changed'); installedToolGuard();
  const resolved = await run('resolved_tool_tree', process.execPath, [npm, 'ls', '--all', '--json'], 20, { cwd: tools, retainFailure: true });
  report.resolvedToolTree = { raw: compressed(resolved.output[0]) };
  report.resolvedToolTree.value = JSON.parse(resolved.output[0]); need(resolved.accepted, 'tool_tree_failed');
  const cli = path.join(tools, 'node_modules/@playwright/test/cli.js');
  report.runtime.playwrightCliSha256 = sha(read(cli, 1048576));
  await run('install_chromium_and_runner_libraries', process.execPath, [cli, 'install', '--with-deps', 'chromium'], 210, { cwd: tools });
  report.runtime.chromiumInstallation = { fullChromiumAndHeadlessShellRequested: true, command: 'playwright install --with-deps chromium',
    binaryIdentityLimit: 'Driver verifies the owned default full-Chromium lookup. The actual headless launch can use its shell; no equality of those binary hashes is claimed.' };
  generate(); await guard('before_browser');
  need(workEnd - Date.now() >= 317000, 'browser_window_unavailable'); browserAttempted = true;
  const browser = await run('browser_cases', process.execPath, [specFile], 310, { cwd: tools, retainFailure: true });
  browserResults(browser.output[0]); need(browser.accepted, 'browser_cli_failed');
  installedToolGuard(); need(sha(read(path.join(tools, 'package-lock.json'), 524288)) === toolLockSha, 'tool_lock_changed_after_browser');
  need(sha(read(specFile, 131072)) === SPEC_SHA, 'copied_browser_source_changed');
  await guard('after_browser');
} catch (error) { report.errors.push(finite(error)); }
finally {
  cleanupEnd = Math.min(Date.now() + 90000, workEnd + 90000);
  try { await guard('after', true); } catch (error) { report.errors.push(finite(error)); }
  report.processCleanup = { passed: active.size === 0 && report.commands.every(row => row.released), started: report.commands.length };
  try { await cleanupBrowsers(); } catch (error) { report.errors.push(finite(error)); }
  try {
    owner(); need(report.processCleanup.passed && report.browserProcessCleanup?.passed === true, 'process_cleanup_unverified');
    fs.rmSync(root, { recursive: true }); need(!fs.existsSync(root), 'scratch_still_present'); report.scratchCleanup = 'passed';
  } catch (error) { report.scratchCleanup = 'unverified'; report.errors.push(finite(error)); }
  try { if (report.scratchCleanup === 'passed') await guard('after_cleanup', true, true); } catch (error) { report.errors.push(finite(error)); }
  const normalCommands = report.commands.every(row => row.exitCode === 0 && row.signal === null && row.stopReason === null
    && row.released && !row.termSent && !row.killSent && row.streams.every(stream => stream.complete
      && stream.observedBytes === stream.raw.bytes && stream.observedSha256 === stream.raw.sha256));
  report.processCleanup = { passed: active.size === 0 && report.commands.every(row => row.released), started: report.commands.length,
    allForegroundCommandsNormal: normalCommands, supervisorySignalsSent: report.commands.some(row => row.termSent || row.killSent)
      || (report.browserProcessCleanup?.termSent ?? 0) > 0 || (report.browserProcessCleanup?.killSent ?? 0) > 0 };
  if (interrupted) report.errors.push('interrupted');
  if (globalExpired || Date.now() > workEnd + 90000) report.errors.push('global_deadline');
  report.interrupted = interrupted; report.completedAtUtc = new Date().toISOString();
  report.status = !report.errors.length && report.browser?.accepted === true && report.guards.length === 5 && report.guards.every(row => row.passed)
    && report.processCleanup.passed && normalCommands && !report.processCleanup.supervisorySignalsSent
    && report.browserProcessCleanup?.passed === true && report.scratchCleanup === 'passed' ? 'passed' : 'failed';
  let output = JSON.stringify(report);
  if (Buffer.byteLength(output) > REPORT_LIMIT) {
    output = JSON.stringify({ schemaVersion: report.schemaVersion, sourceCommit, expectedDeployment: deployment, status: 'failed', errors: ['report_limit'] }); report.status = 'failed';
  }
  const outputTimer = setTimeout(() => { process.stderr.write('controller_stdout_deadline\n'); process.exit(1); }, Math.max(1, Math.min(2000, workEnd + 92000 - Date.now())));
  process.stdout.write('TRIPPIN_ITINERARY_REPORT=' + output + '\n', () => {
    clearTimeout(outputTimer); clearTimeout(globalTimer);
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    process.exitCode = report.status === 'passed' && !interrupted && !globalExpired && Date.now() <= workEnd + 92000 ? 0 : 1;
  });
}
