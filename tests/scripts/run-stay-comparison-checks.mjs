#!/usr/bin/env node
// Two focused hosted browser-client journeys; no app install, build or server.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
const REPOSITORY = 'alvarovillalbaa/trippin';
const BRANCH = 'refs/heads/main';
const ACTIVE = '.github/workflows/stay-comparison-checks.yml';
const BASE_COMMIT = process.env.TRIPPIN_STAY_RUNTIME_COMMIT;
const SPEC = 'tests/integration/browser/stay-comparison.mjs';
const SPEC_SHA = '7ddadc3b64a879598becb06269eb194f40c6f9f28858dc336600e62bb81ef4bb';
const MODIFIED_PRIOR = new Set(['AGENTS.md', 'tests/README.md']);
const RETAINED_FAILURES = [
  { path: 'docs/results/2026/11-08/stay-comparison-attempt-1.json', bytes: 544111,
    sha256: '4003303b52b001eee35cf2f5e66cf94f369a36a6d691034799c0c01238d923d5', gitBlob: '2749f49bdf635c0afa3cd26fcf51a7250bb7c311' },
  { path: 'docs/results/2026/11-08/stay-comparison-attempt-1.log', bytes: 564559,
    sha256: 'ffeec2c80f4183abba6e7b099ffbcbf456d7ff5f922e16839e1f57dfe4363812', gitBlob: '796157d6fe3df0b5d1cd678b2e241ab16717e722' },
  { path: 'docs/results/2026/11-08/stay-comparison-attempt-1.md', bytes: 3953,
    sha256: '907fc4f28031695d6bf830c4a63add865491f99810d671d5ce95b69d5ad69a8f', gitBlob: 'a49a42d92b5be05d89f435338fac71796de45f97' }
];
const ADDED = [SPEC, 'tests/scripts/run-stay-comparison-checks.mjs', 'docs/proposals/stay-comparison-checks.md',
  'docs/proposals/stay-comparison.workflow.yml.example', ...RETAINED_FAILURES.map(file => file.path)].sort();
const ORIGIN = 'https://trippin-theta.vercel.app';
const CASES = [
  { id: 'S01', profile: 'desktop-chromium', title: 'desktop stay cash time bounds and same-day comparison preserve the private workspace',
    viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false },
  { id: 'S02', profile: 'mobile-chromium', title: 'narrow touch stay cash time bounds and same-day comparison preserve the private workspace',
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
const sourceCommit = process.argv[3], deployment = process.env.TRIPPIN_STAY_EXPECTED_DEPLOYMENT;
need(process.argv.length === 4 && process.argv[2] === '--source-commit' && /^[a-f0-9]{40}$/.test(sourceCommit ?? ''), 'source_pin_required');
need(/^[a-f0-9]{40}$/.test(BASE_COMMIT ?? '') && BASE_COMMIT !== sourceCommit, 'runtime_source_pin_required');
need(/^dpl_[A-Za-z0-9]{10,100}$/.test(deployment ?? ''), 'reviewed_deployment_pin_required');
const workflowCommit = process.env.GITHUB_SHA;
need(/^[a-f0-9]{40}$/.test(workflowCommit ?? '') && workflowCommit !== sourceCommit && workflowCommit !== BASE_COMMIT, 'distinct_workflow_commit_required');
need(process.version === 'v24.21.0' && process.platform === 'linux' && process.arch === 'x64' && process.env.CI === 'true'
  && process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === REPOSITORY
  && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.GITHUB_REF === BRANCH
  && process.env.TRIPPIN_STAY_PUBLIC_REPOSITORY === 'true', 'approved_public_ci_required');
const event = JSON.parse(read(process.env.GITHUB_EVENT_PATH, 262144));
need(event.inputs?.source_sha === sourceCommit && event.inputs?.runtime_sha === BASE_COMMIT && event.inputs?.deployment_id === deployment
  && event.repository?.private === false && event.repository?.full_name === REPOSITORY, 'approved_dispatch_event_required');
const enteredAt = Date.now(), jobStartText = process.env.TRIPPIN_STAY_JOB_STARTED_MS;
need(/^\d{13}$/.test(jobStartText ?? ''), 'job_start_timestamp_required');
const jobStartedAt = Number(jobStartText);
need(Number.isSafeInteger(jobStartedAt) && jobStartedAt <= enteredAt && enteredAt - jobStartedAt < 900000, 'job_start_timestamp_invalid');
const admittedWorkEnd = Math.min(enteredAt + 720000, jobStartedAt + 900000 - 90000 - 30000);
need(admittedWorkEnd - enteredAt >= 317000, 'job_entry_window_unavailable');
const repo = fs.realpathSync(process.cwd()), parent = fs.realpathSync(process.env.RUNNER_TEMP ?? '');
need(path.isAbsolute(parent) && fs.statSync(parent).isDirectory(), 'runner_temp_invalid');
need(typeof process.env.HOME === 'string' && path.isAbsolute(process.env.HOME) && fs.statSync(process.env.HOME).isDirectory(), 'original_home_required');
need(Buffer.byteLength(path.join(parent, 'ts-XXXXXX')) <= 45
  && Buffer.byteLength(path.join(parent, 'ts-XXXXXX', 'tmp')) + 64 < 108, 'scratch_socket_path_budget');
const root = fs.mkdtempSync(path.join(parent, 'ts-'));
fs.chmodSync(root, 0o700);
const identity = fs.lstatSync(root), nonce = randomUUID().replaceAll('-', '');
fs.writeFileSync(path.join(root, '.owner'), nonce, { flag: 'wx', mode: 0o600 });
for (const name of ['tools', 'tmp', 'cache', 'config', 'data', 'state', 'browsers']) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ['npm-user', 'npm-global']) fs.writeFileSync(path.join(root, name), '', { flag: 'wx', mode: 0o600 });
const tools = path.join(root, 'tools'), specFile = path.join(tools, 'stay-comparison.mjs');
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
  TRIPPIN_STAY_ORIGIN: ORIGIN, TRIPPIN_STAY_EXPECTED_DEPLOYMENT: deployment, TRIPPIN_STAY_RUNTIME_COMMIT: BASE_COMMIT,
  TRIPPIN_STAY_SOURCE_ROOT: repo, TRIPPIN_STAY_RUN_ROOT: root,
  TRIPPIN_STAY_NONCE: nonce, TRIPPIN_STAY_PLAYWRIGHT_ROOT: path.join(tools, 'node_modules/@playwright/test'), SOURCE_COMMIT: sourceCommit,
};
const report = {
  schemaVersion: 'trippin.stay-comparison.v1', candidateAttempt: 2, sourceCommit, workflowCommit, canonicalBaseCommit: BASE_COMMIT,
  expectedDeployment: deployment, expectedDeploymentSourceCommit: BASE_COMMIT, origin: ORIGIN,
  status: 'failed', startedAtUtc: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  scope: { tier: 'tier2', layer: 'focused-browser-client-integration', cases: CASES, workers: 1, retries: 0,
    appBuild: false, appDependencies: false, localServer: false, accounts: false, serverWrites: false, providers: false, models: false,
    priorCoreRepeated: false, priorCsvBackupZoomRepeated: false, priorItineraryRepeated: false, priorWalletRepeated: false, screenshots: false, traces: false, videos: false },
  limits: { workSeconds: 720, cleanupSeconds: 90, browserChildSeconds: 310, browserWorkSeconds: 240, jobMinutes: 15,
    streamBytes: STREAM_LIMIT, streamGzipBytes: 131072, allStreamsGzipBytes: 786432, browserJsonBytes: BROWSER_LIMIT,
    reportBytes: REPORT_LIMIT, finalStdoutSeconds: 2 },
  timing: { earliestUserStepAtUtc: new Date(jobStartedAt).toISOString(), controllerEntryAtUtc: new Date(enteredAt).toISOString(),
    setupElapsedMs: enteredAt - jobStartedAt, admittedWorkMs: admittedWorkEnd - enteredAt, cleanupReservedMs: 90000,
    jobOutputAndStartupMarginMs: 30000, workDeadlineAtUtc: new Date(admittedWorkEnd).toISOString() },
  commands: [], guards: [], errors: [], sourceFiles: [],
  historicalFirstFailure: { status: 'failed', accepted: false, sourceCommit: 'c8606d6dae0603d1db629ae87bd77fe86d0cc15a',
    workflowCommit: '127a6e40382ab337d985500da514100533ba3c4a', runId: 42446727355, jobId: 128627103580,
    originalFiles: RETAINED_FAILURES, checksCarriedIntoCurrentAcceptance: false, acceptedCasesCarried: 0,
    qualification: 'S01 completed inside the failed first packet and is not carried. Both profiles must pass afresh; the prior composite selector timeout did not establish the original DOM state.' },
  proofLimits: [
    'Two focused browser-client journeys over built-in authored demo data and a disposable same-day trip, not server/database/provider, physical-device, account or full product acceptance.',
    'Preparation source differs from the served runtime Git commit; every prior application blob/mode stays baseline-exact except reviewed AGENTS and suite-contract documentation. Owner READY/source metadata and actual sole-DPL HTML observations remain separate evidence.',
    'No asset crawl or compiled/source-byte equivalence is claimed. Actual anonymous root/static reads can create hosting logs; known API/weather/tile/font reads are blocked and counted, not exercised.',
    'Only the pinned Playwright tool and its Chromium/runtime libraries are installed. Tool state/cache/config/browsers/temp remain owned; original HOME is retained. Linux system packages rely on runner teardown.',
    'Original child streams and demo-only storage snapshots remain bounded. Userspace deadlines cannot interrupt blocked kernel filesystem calls; external termination can prevent verified teardown.',
    'Exit/close/EOF/original groups plus same-UID owned-root PID/starttime scans qualify process cleanup. The attributed inventory is not a host-wide process count; any supervisory signal prevents acceptance.',
  ],
};
const workEnd = admittedWorkEnd;
const modifiedBaseDocs = new Map();
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
  try {
    const buffer = Buffer.alloc(maximum + 1); let length = 0;
    while (length < buffer.length) { const count = fs.readSync(fd, buffer, length, buffer.length - length, null); if (count === 0) break; length += count; }
    need(length <= maximum, 'proc_read_bound'); return buffer.subarray(0, length);
  }
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
  const parents = (await run('canonical_parent', 'git', ['rev-list', '--parents', '-n', '1', 'HEAD'], 10)).output[0].toString().trim().split(/\s+/);
  need(parents.length === 2 && parents[0] === sourceCommit && parents[1] === BASE_COMMIT, 'canonical_parent_changed');
  const bytes = (await run('canonical_tree', 'git', ['ls-tree', '-r', '-l', '-z', BASE_COMMIT], 10)).output[0];
  baseTree = parseGit(bytes, false);
  const total = bytes.toString().split('\0').filter(Boolean).reduce((sum, row) => {
    const fields = row.slice(0, row.indexOf('\t')).trim().split(/\s+/);
    need(fields.length === 4 && /^\d+$/.test(fields[3]), 'canonical_blob_size'); return sum + Number(fields[3]);
  }, 0);
  need(baseTree.size > 0 && baseTree.size <= 2048 && total <= 33554432 && ADDED.every(name => !baseTree.has(name))
    && !baseTree.has(ACTIVE), 'canonical_baseline_changed');
  for (const name of MODIFIED_PRIOR) {
    need(baseTree.has(name) && baseTree.get(name).mode === '100644', 'canonical_document_missing');
    const original = (await run('canonical_document_' + modifiedBaseDocs.size, 'git', ['cat-file', 'blob', baseTree.get(name).gitBlob], 10)).output[0];
    modifiedBaseDocs.set(name, original);
  }
  const runtimeVector = [];
  for (const [name, item] of baseTree) {
    if (MODIFIED_PRIOR.has(name)) {
      const original = modifiedBaseDocs.get(name);
      need(gitBlob(original) === item.gitBlob, 'canonical_document_hash');
      runtimeVector.push({ path: name, mode: item.mode, gitBlob: item.gitBlob, bytes: original.length, sha256: sha(original) });
    } else {
      const current = fileVector(name);
      need(current.mode === item.mode && current.gitBlob === item.gitBlob, 'canonical_runtime_body_changed');
      runtimeVector.push(current);
    }
  }
  need(runtimeVector.reduce((sum, file) => sum + file.bytes, 0) === total, 'canonical_total_bytes_changed');
  report.runtimeSourceFiles = runtimeVector;
  report.canonicalBaseline = { commit: BASE_COMMIT, blobs: baseTree.size, bytes: total, treeSha256: sha(bytes), onlyAddedPaths: ADDED,
    onlyModifiedPriorPaths: [...MODIFIED_PRIOR], allPriorModesAndUnmodifiedBlobsRequiredUnchanged: true,
    runtimeVectorSha256: sha(JSON.stringify(runtimeVector)),
    qualification: 'Only append-only AGENTS and suite-contract documentation may modify prior paths; all prior runtime application and historical receipt inputs remain exact. No historical checks are carried into this acceptance.' };
}
async function guard(label, cleanup = false, postScratch = false) {
  const result = { label, passed: false }; report.guards.push(result); const options = { cleanup, postScratch };
  need((await run(label + '_head', 'git', ['rev-parse', 'HEAD'], 10, options)).output[0].toString().trim() === sourceCommit, 'head_changed');
  need(!fs.existsSync(path.join(repo, ACTIVE)), 'active_workflow_in_source');
  const tree = parseGit((await run(label + '_tree', 'git', ['ls-tree', '-r', '-z', 'HEAD'], 10, options)).output[0], false);
  const index = parseGit((await run(label + '_index', 'git', ['ls-files', '--stage', '-z'], 10, options)).output[0], true);
  need(baseTree && tree.size === baseTree.size + ADDED.length && index.size === tree.size, 'tracked_count_changed');
  for (const [name, item] of baseTree) {
    need(tree.get(name)?.mode === item.mode, 'prior_mode_changed');
    if (MODIFIED_PRIOR.has(name)) {
      const actual = read(path.join(repo, name)), original = modifiedBaseDocs.get(name);
      need(tree.get(name)?.gitBlob !== item.gitBlob && original && actual.length > original.length
        && actual.subarray(0, original.length).equals(original), 'reviewed_scope_document_changed');
    } else need(tree.get(name)?.gitBlob === item.gitBlob, 'prior_application_or_document_changed');
  }
  need(isDeepStrictEqual([...tree.keys()].filter(name => !baseTree.has(name)).sort(), ADDED), 'added_source_scope_changed');
  for (const name of ADDED) need(tree.get(name)?.mode === '100644', 'added_source_mode');
  const vector = [];
  for (const [name, item] of tree) {
    const value = fileVector(name); need(index.get(name)?.mode === item.mode && index.get(name)?.gitBlob === item.gitBlob
      && value.mode === item.mode && value.gitBlob === item.gitBlob, 'full_tracked_source_changed'); vector.push(value);
  }
  for (const expected of RETAINED_FAILURES) {
    const actual = vector.find(file => file.path === expected.path);
    need(actual?.mode === '100644' && actual.bytes === expected.bytes && actual.sha256 === expected.sha256 && actual.gitBlob === expected.gitBlob,
      'first_failed_original_changed');
  }
  need((await run(label + '_status', 'git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 10, options)).output[0].length === 0, 'worktree_not_clean');
  await run(label + '_diff', 'git', ['-c', 'core.filemode=true', 'diff', '--no-ext-diff', '--no-textconv', '--quiet', '--exit-code', 'HEAD', '--'], 10, options);
  const ignored = (await run(label + '_ignored', 'git', ['status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=normal'], 10, options)).output[0];
  need(ignored.length === 0, 'repository_generated_output');
  if (!baseline) { baseline = vector; report.sourceFiles = vector; }
  need(isDeepStrictEqual(vector, baseline), 'source_vector_changed');
  Object.assign(result, { passed: true, trackedFiles: vector.length, sourceBytes: vector.reduce((sum, file) => sum + file.bytes, 0),
    vectorSha256: sha(JSON.stringify(vector)), fullHeadIndexModesAndBytes: true, noUntrackedOrIgnoredOutput: true, priorApplicationInputsUnchanged: true, retainedFirstFailureOriginalsExact: true });
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



const STAGES = ['baseline', 'time_value', 'decimals', 'equal_totals', 'negative_clamped', 'maximum_clamped',
  'sample_reloaded', 'same_day_created', 'same_day_nightly_ignored', 'same_day_reloaded', 'authored_trip_removed', 'final_reloaded'];
const DRIVER_SOURCES = ['lib/data.ts', 'lib/trip.ts', 'components/workspace.tsx', 'components/trip-map.tsx', 'app/globals.css',
  'app/layout.tsx', 'lib/types.ts', 'components/stay-comparison.tsx', 'components/new-trip-form.tsx', 'components/trip-settings.tsx'];
const DATE = '2026-11-08', AUTHORED_TITLE = 'QA authored same-day stay';
const DEFAULT_VALUES = [95, 20, 0, 10, 65, 30, 9, 35, 0];
const DECIMAL_VALUES = [100.25, 1.25, 2.5, 10, 99.99, 1.01, 2.49, 35, 0];
const TIED_VALUES = [95, 20, 0, 10, 95, 20, 0, 10, 20];
const ZERO_VALUES = Array(9).fill(0), MAX_VALUES = [100000, 100000, 100000, 600, 100000, 100000, 100000, 600, 10000];
const NIGHTLY_IGNORED = [123.45, 20, 0, 10, 999.99, 30, 9, 35, 0];
const HALF_CENT_VALUES = [123.45, 1, 0, 3, 999.99, 30, 9, 35, 0.05];
const STAGE_VALUES = [DEFAULT_VALUES, [...DEFAULT_VALUES.slice(0, 8), 20], DECIMAL_VALUES, TIED_VALUES, ZERO_VALUES, MAX_VALUES,
  DEFAULT_VALUES, DEFAULT_VALUES, HALF_CENT_VALUES, DEFAULT_VALUES, DEFAULT_VALUES, DEFAULT_VALUES];
const GOLDEN_TOTAL_CENTS = [[30500, 26100], [33167, 35433], [31200, 31094], [33167, 33167], [0, 0], [160000000, 160000000],
  [30500, 26100], [2000, 3900], [101, 3906], [2000, 3900], [30500, 26100], [30500, 26100]];
const INPUTS = [
  ['a.nightly', 'Stay A · closer in Per night (€)', 100000, '0.01'],
  ['a.fees', 'Stay A · closer in Total fees (€)', 100000, '0.01'],
  ['a.transit', 'Stay A · closer in Daily commute (€)', 100000, '0.01'],
  ['a.minutes', 'Stay A · closer in Minutes to center', 600, '1'],
  ['b.nightly', 'Stay B · further out Per night (€)', 100000, '0.01'],
  ['b.fees', 'Stay B · further out Total fees (€)', 100000, '0.01'],
  ['b.transit', 'Stay B · further out Daily commute (€)', 100000, '0.01'],
  ['b.minutes', 'Stay B · further out Minutes to center', 600, '1'],
  ['timeValue', 'Your time, if you’d like to price it (€ / hour)', 10000, '0.01'],
];
const EXPECTED_FIXTURE = { source: 'application-authored-private-demo-and-visible-authored-trip', originalTripId: 'trip-munich',
  noImportOrStorageSeed: true, originalTripCount: 3, authoredTitle: AUTHORED_TITLE, destinationId: 'munich', date: DATE, budget: 850 };
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
function demoBaseline(value) {
  need(value.version === 1 && value.selectedTripId === 'trip-munich' && value.profile?.name === 'Alex Morgan'
    && value.trips.length === 3 && value.trips.every(item => item.isPublic === false)
    && isDeepStrictEqual(value.trips.map(item => item.id), ['trip-munich', 'trip-lisbon', 'trip-copenhagen']), 'authored_private_demo_identity');
  const trip = value.trips[0];
  need(trip.startDate === '2026-10-22' && trip.endDate === '2026-10-25' && trip.currency === 'EUR' && trip.budget === 850
    && isDeepStrictEqual(trip.days.map(day => day.date), ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
    && trip.expenses.length === 0 && trip.bookings.length === 2 && value.profile.dailyFoodBudget === 38 && value.profile.dailyTransportBudget === 10,
    'authored_sample_dates_budget');
}
function allIds(value, found = new Set()) {
  if (Array.isArray(value)) for (const item of value) allIds(item, found);
  else if (value && typeof value === 'object') {
    if (typeof value.id === 'string') found.add(value.id);
    for (const item of Object.values(value)) allIds(item, found);
  }
  return found;
}
function expectedWorkspaces(value, tripId, dayId) {
  const ids = allIds(value), validId = id => typeof id === 'string' && id.length > 0 && id.length <= 160 && id.trim() === id && !id.includes('\0');
  need(validId(tripId) && validId(dayId) && tripId !== dayId && !ids.has(tripId) && !ids.has(dayId), 'authored_new_ids');
  const changed = copy(value);
  changed.trips.push({
    id: tripId, title: AUTHORED_TITLE, city: 'Munich', country: 'Germany', countryCode: 'DE', startDate: DATE, endDate: DATE,
    lat: 48.1372, lng: 11.5756, image: '/images/munich.jpg',
    description: 'Old-world streets, green escapes, and a table worth staying for.', budget: 850, currency: 'EUR', isPublic: false,
    days: [{ id: dayId, date: DATE, label: 'Find your rhythm', activities: [] }],
    expenses: [], bookings: [], joinRequests: [], companions: [],
  });
  changed.selectedTripId = tripId;
  return STAGES.map((stage, index) => copy(index >= 7 && index <= 9 ? changed : value));
}
function inputMetadata(actual, index, expectedValue, withDescriptor = false) {
  const [key, label, maximum, step] = INPUTS[index];
  need(actual && actual.tagName === 'INPUT' && actual.type === 'number' && actual.ariaLabel === label && actual.min === '0'
    && actual.max === String(maximum) && actual.step === step && typeof actual.value === 'string' && actual.value.length > 0 && actual.value.length <= 32
    && Number(actual.value) === expectedValue && Number.isFinite(Number(actual.value)), 'actual_input_metadata_or_value');
  if (withDescriptor) need(actual.key === key && actual.label === label, 'actual_input_descriptor');
  need(isDeepStrictEqual(actual.validity, { valid: true, badInput: false, rangeUnderflow: false, rangeOverflow: false, stepMismatch: false }), 'actual_input_native_validity');
}
function comparisonExpected(values, days, nights) {
  const round = value => Math.round((value + Number.EPSILON) * 100);
  const money = cents => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
  const options = [0, 4].map(offset => {
    const cash = values[offset] * nights + values[offset + 1] + values[offset + 2] * days;
    const hours = values[offset + 3] * 2 * days / 60;
    return { cashCents: round(cash), hours, totalCents: round(cash + hours * values[8]) };
  });
  const differenceCents = Math.abs(options[0].totalCents - options[1].totalCents), qualifier = values[8] > 0 ? ' including your time value' : '';
  const conclusion = differenceCents === 0 ? 'Both stays have the same total of ' + money(options[0].totalCents) + qualifier + '.'
    : (options[0].totalCents < options[1].totalCents ? 'Stay A' : 'Stay B') + ' has the lower total by ' + money(differenceCents) + qualifier + '.';
  return { days, nights, options, differenceCents, conclusion, totalsTexts: options.map(option => money(option.totalCents)),
    commuteTexts: options.map(option => option.hours.toFixed(1) + ' hrs commuting'),
    totalLabels: [0, 1].map(() => values[8] > 0 ? 'Including your time value' : 'Stay and commute costs') };
}
function validateCalculator(actual, values, days, nights, golden) {
  need(actual && Array.isArray(actual.inputs) && actual.inputs.length === 9, 'calculator_inputs_count');
  actual.inputs.forEach((input, index) => inputMetadata(input, index, values[index], true));
  const expected = comparisonExpected(values, days, nights);
  need(isDeepStrictEqual(expected.options.map(option => option.totalCents), golden), 'independent_golden_cent_totals');
  need(isDeepStrictEqual(actual.expected, expected) && isDeepStrictEqual(actual.totalsTexts, expected.totalsTexts)
    && isDeepStrictEqual(actual.commuteTexts, expected.commuteTexts) && isDeepStrictEqual(actual.totalLabels, expected.totalLabels)
    && actual.conclusion === expected.conclusion
    && actual.nightsDaysText === `${nights} nights · ${days} days · two journeys per day. Enter estimates from the accommodation and transit providers.`,
    'actual_visible_complete_cost_or_time');
}
function validateEdits(observation) {
  const rows = observation.inputEdits; need(Array.isArray(rows) && rows.length === 42, 'actual_input_edit_count'); let cursor = 0, values = [...DEFAULT_VALUES];
  function edit(index, requestedValue, expectedValue, phase) {
    const row = rows[cursor++];
    need(row.phase === phase && row.key === INPUTS[index][0] && row.requestedValue === requestedValue
      && row.expectedValue === expectedValue && row.completed === true, 'actual_input_edit_identity');
    inputMetadata(row.before, index, values[index]); inputMetadata(row.after, index, expectedValue); values[index] = expectedValue;
  }
  edit(8, '20', 20, 'time_value');
  for (const [phase, next] of [['decimals', DECIMAL_VALUES], ['equal_totals', TIED_VALUES], ['negative_clamped', ZERO_VALUES], ['maximum_clamped', MAX_VALUES]]) {
    for (let index = 0; index < 9; index++) edit(index, phase === 'negative_clamped' ? '-1' : phase === 'maximum_clamped' ? String(INPUTS[index][2] + 1) : String(next[index]), next[index], phase);
  }
  values = [...DEFAULT_VALUES];
  edit(0, '123.45', 123.45, 'same_day_nightly_ignored'); edit(4, '999.99', 999.99, 'same_day_nightly_ignored');
  edit(1, '1', 1, 'same_day_nightly_ignored'); edit(3, '3', 3, 'same_day_nightly_ignored'); edit(8, '0.05', 0.05, 'same_day_nightly_ignored');
  need(cursor === 42, 'actual_input_edit_scope');
  need(isDeepStrictEqual(observation.dialogReadiness, [
    { phase: 'create_same_day', title: 'A new chapter.', count: 1, visible: true, tagName: 'DIALOG', open: true },
    { phase: 'remove_same_day', title: 'A few helpful details.', count: 1, visible: true, tagName: 'DIALOG', open: true },
  ]), 'actual_dialog_readiness');
  validateCalculator(observation.nightlyIgnored, NIGHTLY_IGNORED, 1, 0, [2000, 3900]);
}
function validateNavigationControls(observation) {
  const rows = observation.navigationControls;
  need(Array.isArray(rows) && rows.length === 1, 'actual_navigation_observation_count');
  const row = rows[0];
  need(row.view === 'itinerary' && row.count === 1 && row.visible === true && row.tagName === 'BUTTON'
    && typeof row.innerText === 'string' && row.innerText.length <= 80 && /^My trips(?:\s*\d{2})?$/.test(row.innerText)
    && typeof row.textContent === 'string' && row.textContent.length <= 80 && /^My trips\s*04$/.test(row.textContent)
    && row.ariaLabel === null && row.countBadgeText === '04' && typeof row.countBadgeDisplay === 'string'
    && /^[a-z-]{1,32}$/.test(row.countBadgeDisplay) && typeof row.countBadgeVisible === 'boolean', 'actual_navigation_button_identity');
}
function browserResults(bytes) {
  report.browser = { raw: compressed(bytes), accepted: false };
  need(bytes.length <= BROWSER_LIMIT && Buffer.from(bytes.toString('utf8')).equals(bytes), 'browser_output_bound_or_utf8');
  const prefix = 'TRIPPIN_STAY_BROWSER_RESULT=', text = bytes.toString('utf8');
  need(text.startsWith(prefix) && text.endsWith('\n') && text.slice(prefix.length, -1).indexOf('\n') === -1, 'browser_unique_result_marker');
  const value = JSON.parse(text.slice(prefix.length, -1)); report.browser.result = value;
  need(value.schemaVersion === 1 && value.sourceCommit === sourceCommit && value.origin === ORIGIN
    && value.expectedDeployment === deployment && value.expectedRuntimeCommit === BASE_COMMIT
    && value.tier === 'tier2' && value.layer === 'focused-browser-client-integration', 'browser_result_identity');
  need(value.runtime?.node === process.version && value.runtime.playwright === PLAYWRIGHT.version
    && value.runtime.applicationImports === false && value.runtime.storageMutationByHarness === false
    && isDeepStrictEqual(value.runtime.profiles, CASES.map(({ id, profile, viewport, isMobile, hasTouch }) => ({ id, profile, viewport, isMobile, hasTouch })))
    && typeof value.runtime.browserVersion === 'string' && value.runtime.browserVersion.length > 0 && value.runtime.browserVersion.length <= 100, 'browser_runtime_identity');
  need(isDeepStrictEqual(value.limits, { workSeconds: 240, caseSeconds: 100, cleanupSeconds: 60, stdoutSeconds: 2,
    navigationSeconds: 30, actionSeconds: 10, workspaceBytes: 262144, snapshotGzipBytes: 32768,
    allSnapshotGzipBytes: 131072, reportBytes: 524288, boundaryEvents: 24 }), 'browser_limits_changed');
  need(Array.isArray(value.sourceFiles) && value.sourceFiles.length === DRIVER_SOURCES.length, 'browser_source_vector');
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
      && isDeepStrictEqual(observation.fixture, EXPECTED_FIXTURE), 'browser_authored_fixture');
    need(observation.viewport?.innerWidth === expectedCase.viewport.width && observation.viewport.innerHeight === expectedCase.viewport.height
      && observation.viewport.devicePixelRatio === 1 && Number.isSafeInteger(observation.viewport.maxTouchPoints)
      && (expectedCase.hasTouch ? observation.viewport.maxTouchPoints > 0 : observation.viewport.maxTouchPoints === 0), 'browser_viewport');
    need(Array.isArray(observation.snapshots) && observation.snapshots.length === 12, 'browser_snapshot_count');
    const decoded = observation.snapshots.map(row => decodedSnapshot(row.raw)); demoBaseline(decoded[0].value);
    const { tripId, dayId } = observation.identities ?? {};
    const expected = expectedWorkspaces(decoded[0].value, tripId, dayId);
    need(observation.finalBaselineByteExact === true && observation.baselineSha256 === sha(decoded[0].bytes)
      && observation.finalSha256 === sha(decoded[11].bytes), 'authored_identity_and_final_readback');
    validateEdits(observation); validateNavigationControls(observation);
    for (let stage = 0; stage < STAGES.length; stage++) {
      const row = observation.snapshots[stage], item = decoded[stage], serialized = Buffer.from(JSON.stringify(expected[stage]));
      rawBytes += row.raw.bytes; gzipBytes += row.raw.compressedBytes;
      need(row.stage === STAGES[stage] && row.durableMatchesExpected === true && row.expectedSha256 === sha(serialized)
        && item.bytes.equals(serialized) && isDeepStrictEqual(item.value, expected[stage]), 'whole_workspace_transition_or_preservation');
      need(row.selectedTripId === expected[stage].selectedTripId && isDeepStrictEqual(row.tripIds, expected[stage].trips.map(trip => trip.id)), 'whole_workspace_trip_selection');
      const sameDay = stage >= 7 && stage <= 9;
      validateCalculator(row.calculator, STAGE_VALUES[stage], sameDay ? 1 : 4, sameDay ? 0 : 3, GOLDEN_TOTAL_CENTS[stage]);
    }
    need(decoded[0].bytes.equals(decoded[11].bytes), 'final_raw_workspace_not_baseline');
    need(Array.isArray(observation.rootNavigations) && observation.rootNavigations.length === 4 && observation.rootNavigations.every(row => row.status === 200
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
    report.browser.independentCases.push({ id: actual.id, profile: actual.profile, snapshotsDecoded: 12, actualRootNavigationObservations: 4,
      wholeWorkspaceTransitionsAndUntouchedValues: true, originalWorkspaceNonmutation: true, authoredTripId: tripId, authoredDayId: dayId,
      newTripCreatedAndRemovedByVisibleUI: true, finalRawEqualsBaseline: true, actualInputEdits: 42, uniqueVisibleDialogReadiness: 2, actualNavigationControls: 1,
      completeOptionGoldenCents: GOLDEN_TOTAL_CENTS, dailyZeroNightsAndNightlyIgnored: true, halfCentGolden: { a: 101, b: 3906, difference: 3805 },
      zeroFatalBoundaries: true });
  }
  report.browser.snapshotOriginals = { count: 24, rawBytes, gzipBytes, independentlyDecoded: true };
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
  fs.writeFileSync(path.join(tools, 'package.json'), JSON.stringify({ name: 'trippin-stay-owned-tool', private: true,
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
  process.stdout.write('TRIPPIN_STAY_REPORT=' + output + '\n', () => {
    clearTimeout(outputTimer); clearTimeout(globalTimer);
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    process.exitCode = report.status === 'passed' && !interrupted && !globalExpired && Date.now() <= workEnd + 92000 ? 0 : 1;
  });
}
