#!/usr/bin/env node
// T2 focused browser-client integration: actual public UI and private Chromium
// persistence over the app's authored demo samples. Server integrations are excluded.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const ORIGIN = 'https://trippin-theta.vercel.app';
const RUNTIME_COMMIT = 'a6ec77dcb116e52246374ac023dcb5b5f83fb029';
const STORAGE_KEY = 'trippin.workspace.v1';
const TRIP = 'trip-munich', DAY = 'munich-day-1';
const COFFEE = 'm1-coffee', GARDEN = 'm1-garden', MUSEUM = 'm1-museum';
const COFFEE_TITLE = 'Coffee, then whatever';
const GARDEN_TITLE = 'An English Garden kind of afternoon';
const MUSEUM_TITLE = 'Rain plan: a modern-art detour';
const CASES = [
  { id: 'L01', profile: 'desktop-chromium', title: 'desktop itinerary completion skipping restoration and existing alternative persist across reloads',
    viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false },
  { id: 'L02', profile: 'mobile-chromium', title: 'narrow touch itinerary completion skipping restoration and existing alternative persist across reloads',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const SOURCE_FILES = ['lib/data.ts', 'lib/trip.ts', 'components/workspace.tsx', 'components/trip-map.tsx', 'app/globals.css', 'app/layout.tsx'];
const REPORT_LIMIT = 524288, WORKSPACE_LIMIT = 262144, ZIP_LIMIT = 32768, ALL_ZIP_LIMIT = 131072;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const need = (condition, code) => { if (!condition) throw new Error(code); };
const inside = (parent, child) => child.startsWith(parent + path.sep);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const copy = value => JSON.parse(JSON.stringify(value));
const report = {
  schemaVersion: 1, sourceCommit: process.env.SOURCE_COMMIT ?? null, origin: ORIGIN,
  expectedDeployment: process.env.TRIPPIN_ITINERARY_EXPECTED_DEPLOYMENT ?? null, expectedRuntimeCommit: RUNTIME_COMMIT,
  runtimeCommitEvidence: 'Root-reviewed deployment metadata binds the READY alias to the runtime commit; actual root HTML is separately checked for its sole expected deployment ID.',
  tier: 'tier2', layer: 'focused-browser-client-integration', status: 'failed', startedAtUtc: new Date().toISOString(),
  cases: CASES.map(({ id, title, profile }) => ({ id, title, profile, accepted: false, error: 'unrun', observations: { stage: 'unrun', snapshots: [], rootNavigations: [] } })),
  errors: [], limits: { workSeconds: 240, caseSeconds: 100, cleanupSeconds: 60, stdoutSeconds: 2,
    navigationSeconds: 30, actionSeconds: 10, workspaceBytes: WORKSPACE_LIMIT, snapshotGzipBytes: ZIP_LIMIT,
    allSnapshotGzipBytes: ALL_ZIP_LIMIT, reportBytes: REPORT_LIMIT, boundaryEvents: 24 },
  cleanup: { passed: false, contextsCreated: 0, contextsClosed: 0, pagesCreated: 0, pagesClosed: 0,
    browserClosed: false, browserDisconnectedObserved: false, pendingJobs: null, pendingRequests: null, remainingContexts: null, failures: [] },
  proofLimits: [
    'Two fresh private browser contexts use the application-authored Munich sample through real user controls; no storage seeding, app helper calls, API fulfillment or application logic mock is used.',
    'This is focused browser-client integration over built-in demo data, not a replica-database or full-stack E2E claim. No live prices, venue attendance, provider, account, public-trip, bank or model acceptance follows.',
    'Coffee completion toggles planned/done; skipping a done coffee and restoring it produces planned, not a restored historical done state.',
    'Every root navigation/reload checks actual response HTML for one expected deployment ID. Static URL admission and response metadata are observational; compiled asset/source-byte equivalence is not claimed.',
    'Known API/weather/tile/font reads are deliberately blocked as in the accepted portability packet. Unknown reads, mutations, WebSockets, admitted-request failures and uncaught page errors fail this packet.',
    'Narrow mobile/touch is Chromium emulation, not physical-device, cross-browser or assistive-technology acceptance. No old core, shared-import, CSV/backup or zoom case is rerun.',
    'Only authored demo workspace originals are retained, bounded and compressed, after fresh-context and exact sample-identity guards. Root owns final browser-process/profile/scratch disposal.',
  ],
};
const workEnd = Date.now() + 240000;
let root, identity, markerIdentity, nonce, source, playwrightRoot, browser, sourceBefore, totalZip = 0;
let interrupted = false, expired = false, browserCloseExpected = false, cleanupEnd;
const workTimer = setTimeout(() => { expired = true; }, Math.max(1, workEnd - Date.now()));
const contexts = new Set(), closingContexts = new Set(), operations = new Set(), handlers = new Map(), guards = [];
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  const handler = () => { interrupted = true; };
  handlers.set(signal, handler); process.on(signal, handler);
}
function finite(error) {
  return /^[a-z][a-z0-9_]{0,100}$/.test(error?.message ?? '') ? error.message : 'browser_check_failed';
}
function diagnostic(error) {
  const raw = String(error?.message ?? ''), text = raw.replace(/https?:\/\/[^\s"'<>]+/g, value => {
    try { const url = new URL(value); return url.origin + url.pathname; } catch { return '[url]'; }
  }).replace(/(?:data|blob):[^\s"'<>]+/g, '[url]').replace(/[\u0000-\u001f\u007f]/g, ' ');
  return { name: String(error?.name ?? 'Error').slice(0, 64), message: Buffer.from(text).subarray(0, 512).toString('utf8'), sha256: sha(raw) };
}
function read(file, maximum = 1048576) {
  const before = fs.lstatSync(file);
  need(before.isFile() && !before.isSymbolicLink() && before.size <= maximum, 'file_type_or_bound');
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file);
  need(before.dev === after.dev && before.ino === after.ino && before.size === after.size && bytes.length === before.size
    && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, 'file_changed'); return bytes;
}
function owner() {
  const current = fs.lstatSync(root), marker = fs.lstatSync(path.join(root, '.owner'));
  need(current.isDirectory() && !current.isSymbolicLink() && current.uid === process.getuid() && (current.mode & 0o777) === 0o700
    && current.dev === identity.dev && current.ino === identity.ino && fs.realpathSync(root) === root, 'root_identity_changed');
  need(marker.isFile() && !marker.isSymbolicLink() && marker.uid === process.getuid() && (marker.mode & 0o777) === 0o600
    && marker.dev === markerIdentity.dev && marker.ino === markerIdentity.ino && marker.size === 32
    && read(path.join(root, '.owner'), 32).toString() === nonce, 'root_nonce_changed');
}
function sourceVector() {
  return SOURCE_FILES.map(name => {
    const file = path.join(source, name);
    for (let parent = path.dirname(file); parent !== source; parent = path.dirname(parent)) {
      const item = fs.lstatSync(parent); need(item.isDirectory() && !item.isSymbolicLink(), 'source_ancestor_changed');
    }
    const bytes = read(file), item = fs.lstatSync(file);
    return { path: name, bytes: bytes.length, sha256: sha(bytes), mode: item.mode & 0o777, dev: item.dev, ino: item.ino };
  });
}
async function bounded(promise, milliseconds, code) {
  const operation = Promise.resolve(promise); operations.add(operation);
  operation.then(() => operations.delete(operation), () => operations.delete(operation));
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), Math.max(1, milliseconds)); })]); }
  finally { clearTimeout(timer); }
}
function budget(state, maximum = 10000) {
  if (Date.now() >= workEnd) expired = true;
  need(!interrupted && !expired, interrupted ? 'interrupted' : 'work_deadline');
  const remaining = Math.min(workEnd, state.end) - Date.now(); need(remaining > 0, 'case_deadline'); return Math.max(1, Math.min(maximum, remaining));
}
function event(guard, kind, request) {
  if (guard.events.length < 24) {
    let origin = '', pathname = '';
    try { const url = new URL(request?.url() ?? ''); origin = url.origin; pathname = url.pathname.slice(0, 256); } catch {}
    guard.events.push({ kind, method: request?.method() ?? null, origin, pathname, stage: guard.state.row.observations.stage });
  }
}
function policy(request) {
  let url; try { url = new URL(request.url()); } catch { return { kind: 'unexpected', allowed: false, fatal: true }; }
  if (!['GET', 'HEAD'].includes(request.method())) return { kind: 'mutation', allowed: false, fatal: true };
  if (url.origin === ORIGIN && (url.pathname === '/api' || url.pathname.startsWith('/api/'))) return { kind: 'api', allowed: false, fatal: false };
  if ((url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2')
    || (url.origin === 'https://fonts.gstatic.com' && url.pathname.startsWith('/s/') && /\.(?:woff2?|ttf|otf)$/.test(url.pathname))) return { kind: 'fonts', allowed: false, fatal: false };
  if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return { kind: 'weather', allowed: false, fatal: false };
  if (url.origin === 'https://tile.openstreetmap.org' && /^\/\d+\/\d+\/\d+\.png$/.test(url.pathname)) return { kind: 'tiles', allowed: false, fatal: false };
  if (url.origin !== ORIGIN || url.username || url.password) return { kind: 'unexpected', allowed: false, fatal: true };
  const keys = [...url.searchParams.keys()];
  const query = keys.length === 0 || (keys.length === 1 && keys[0] === 'dpl' && url.searchParams.get('dpl') === report.expectedDeployment);
  const staticPath = /^\/_next\/static\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:js|css|woff2?|ttf|otf)$/.test(url.pathname);
  const publicPath = /^\/images\/(?:munich|lisbon|copenhagen|barcelona)\.jpg$/.test(url.pathname)
    || ['/images/world.svg', '/icon.svg', '/favicon.ico'].includes(url.pathname);
  if ((url.pathname === '/' && !url.search) || (staticPath && query) || (publicPath && !url.search)) return { kind: 'app', allowed: true, fatal: false };
  return { kind: 'unexpected', allowed: false, fatal: true };
}
function healthy(guard) {
  need(guard.unexpected === 0 && guard.mutations === 0 && guard.webSockets === 0 && guard.pageErrors === 0 && guard.pageCrashes === 0
    && guard.allowedRequestFailures === 0 && guard.responseErrors === 0 && guard.unexpectedPages === 0 && guard.unexpectedDownloads === 0 && guard.routeErrors === 0,
  'browser_boundary_failure');
}
function track(guard, promise) {
  const job = Promise.resolve(promise); guard.jobs.add(job);
  job.then(() => guard.jobs.delete(job), error => {
    guard.jobs.delete(job); guard.routeErrors++; event(guard, 'route_error');
    if (guard.routeErrors <= 8) guard.failures.push({ kind: 'route_error', code: finite(error) });
  });
  return job;
}
async function installGuard(context, state) {
  const guard = { state, jobs: new Set(), pending: new Set(), requests: new Map(), lastEvent: Date.now(), events: [], failures: [],
    allowedReads: 0, api: 0, weather: 0, tiles: 0, fonts: 0, unexpected: 0, mutations: 0, webSockets: 0,
    pageErrors: 0, pageCrashes: 0, allowedRequestFailures: 0, responseErrors: 0, unexpectedPages: 0, unexpectedDownloads: 0, routeErrors: 0,
    requestsFinished: 0, knownBlockedFailures: 0, allowedAssetPaths: new Set(), mainPage: null };
  guards.push(guard);
  context.on('request', request => {
    const value = policy(request); guard.requests.set(request, value); guard.pending.add(request); guard.lastEvent = Date.now();
    if (value.allowed) { guard.allowedReads++; guard.allowedAssetPaths.add(new URL(request.url()).pathname); }
  });
  context.on('requestfinished', request => { guard.pending.delete(request); guard.requestsFinished++; guard.lastEvent = Date.now(); });
  context.on('requestfailed', request => {
    const value = guard.requests.get(request) ?? policy(request); guard.pending.delete(request); guard.lastEvent = Date.now();
    if (value.allowed) { guard.allowedRequestFailures++; event(guard, 'admitted_request_failed', request); }
    else if (!value.fatal) guard.knownBlockedFailures++;
  });
  context.on('response', response => {
    const request = response.request(), value = guard.requests.get(request) ?? policy(request);
    if (value.allowed && response.status() >= 400) { guard.responseErrors++; event(guard, 'admitted_response_error', request); }
  });
  context.on('weberror', error => {
    guard.pageErrors++; if (guard.pageErrors <= 4) guard.failures.push({ kind: 'page_error', ...diagnostic(error.error()) });
    event(guard, 'page_error');
  });
  context.on('page', page => {
    page.on('crash', () => { guard.pageCrashes++; event(guard, 'page_crash'); });
    if (guard.mainPage) { guard.unexpectedPages++; event(guard, 'unexpected_page'); track(guard, page.close()); }
    else guard.mainPage = page;
  });
  await context.routeWebSocket('**/*', route => {
    guard.webSockets++; event(guard, 'websocket'); track(guard, route.close({ code: 1008, reason: 'Outside acceptance scope' }));
  });
  await context.route('**/*', route => {
    const request = route.request(), value = guard.requests.get(request) ?? policy(request);
    if (!value.allowed) {
      if (value.kind === 'mutation') guard.mutations++; else if (value.kind === 'unexpected') guard.unexpected++; else guard[value.kind]++;
      if (value.fatal) event(guard, value.kind, request);
    }
    return track(guard, value.allowed ? route.continue() : route.abort('blockedbyclient'));
  });
  return guard;
}
async function drain(guard, milliseconds = 2500) {
  const end = Date.now() + milliseconds;
  while ((guard.pending.size || guard.jobs.size || Date.now() - guard.lastEvent < 150) && Date.now() < end) await pause(25);
  need(guard.pending.size === 0 && guard.jobs.size === 0, 'network_drain_unverified'); healthy(guard);
}
async function poll(state, callback, code) {
  const end = Date.now() + budget(state);
  while (Date.now() < end) {
    healthy(state.guard);
    if (await bounded(callback(), Math.min(budget(state), Math.max(1, end - Date.now())), code)) return;
    await pause(40);
  }
  throw new Error(code);
}
async function stored(state) {
  const raw = await bounded(state.page.evaluate(({ key, maximum }) => {
    const value = localStorage.getItem(key); return value === null || value.length <= maximum ? value : { tooLarge: true };
  }, { key: STORAGE_KEY, maximum: WORKSPACE_LIMIT }), budget(state), 'storage_read_timeout');
  if (raw === null) return null;
  need(typeof raw === 'string' && Buffer.byteLength(raw) <= WORKSPACE_LIMIT, 'workspace_bound');
  const value = JSON.parse(raw); need(value && value.version === 1 && Array.isArray(value.trips), 'workspace_shape'); return { raw, value };
}
function dayOf(workspace) {
  const trip = workspace.trips.find(item => item.id === TRIP); need(trip, 'sample_trip_missing');
  const day = trip.days?.find(item => item.id === DAY); need(day && Array.isArray(day.activities), 'sample_day_missing'); return day;
}
function activityOf(workspace, id) {
  const rows = dayOf(workspace).activities.filter(item => item.id === id); need(rows.length === 1, 'sample_activity_identity'); return rows[0];
}
function sampleGuard(value) {
  need(value.selectedTripId === TRIP && value.trips.length === 3 && value.profile?.name === 'Alex Morgan'
    && JSON.stringify(value.trips.map(item => item.id).sort()) === JSON.stringify(['trip-copenhagen', 'trip-lisbon', TRIP].sort())
    && value.trips.every(item => item.isPublic === false), 'fresh_demo_fixture_required');
  const coffee = activityOf(value, COFFEE), garden = activityOf(value, GARDEN), museum = activityOf(value, MUSEUM);
  need(coffee.title === COFFEE_TITLE && coffee.status === 'planned' && coffee.time === '09:30' && coffee.cost === 9 && coffee.source === 'demo'
    && garden.title === GARDEN_TITLE && garden.status === 'planned' && garden.time === '14:30' && garden.cost === 0 && garden.source === 'demo'
    && museum.title === MUSEUM_TITLE && museum.status === 'skipped' && museum.alternativeFor === GARDEN && museum.time === '14:30' && museum.cost === 12 && museum.source === 'demo'
    && dayOf(value).activities.length === 5, 'sample_activity_contract');
}
function card(state, title) {
  return state.page.locator('article.activity-card').filter({ has: state.page.getByRole('heading', { name: title, exact: true }) });
}
async function activate(state, locator) {
  healthy(state.guard);
  if (state.definition.hasTouch) await bounded(locator.tap({ timeout: budget(state) }), budget(state), 'touch_action_timeout');
  else await bounded(locator.click({ timeout: budget(state) }), budget(state), 'click_action_timeout');
}
async function uiMatches(state, expected) {
  const day = dayOf(expected), visible = day.activities.filter(item => !item.alternativeFor), active = visible.filter(item => item.status !== 'skipped');
  const amount = active.reduce((total, item) => total + item.cost, 0);
  if (await state.page.locator('article.activity-card').count() !== visible.length) return false;
  for (const item of visible) {
    const target = card(state, item.title); if (await target.count() !== 1 || !await target.isVisible()) return false;
    const classes = await target.getAttribute('class') ?? '';
    if (/\bdone\b/.test(classes) !== (item.status === 'done') || /\bskipped\b/.test(classes) !== (item.status === 'skipped')) return false;
    if (await target.getByRole('button', { name: item.status === 'done' ? 'Been there' : 'Mark as done', exact: true }).count() !== 1) return false;
  }
  const text = (await state.page.locator('.day-heading').innerText()).replace(/\s+/g, ' ');
  return text.includes(active.length + ' stops') && text.includes('€' + amount + ' estimated');
}
async function snapshot(state, stage, expected) {
  state.row.observations.stage = stage; const serialized = JSON.stringify(expected), expectedHash = sha(serialized); let current;
  await poll(state, async () => {
    current = await stored(state); return current !== null && sha(current.raw) === expectedHash && await uiMatches(state, expected);
  }, 'durable_or_ui_state_mismatch');
  need(current.raw === serialized, 'durable_original_mismatch');
  const bytes = Buffer.from(current.raw), zip = gzipSync(bytes); totalZip += zip.length;
  need(zip.length <= ZIP_LIMIT && totalZip <= ALL_ZIP_LIMIT, 'snapshot_capture_bound');
  const day = dayOf(current.value), visible = day.activities.filter(item => !item.alternativeFor), active = visible.filter(item => item.status !== 'skipped');
  const project = item => ({ id: item.id, status: item.status, time: item.time, cost: item.cost, alternativeFor: item.alternativeFor ?? null });
  const row = { stage, raw: { encoding: 'gzip-base64', bytes: bytes.length, sha256: sha(bytes), compressedBytes: zip.length, data: zip.toString('base64') },
    expectedSha256: expectedHash, coffee: project(activityOf(current.value, COFFEE)), garden: project(activityOf(current.value, GARDEN)), museum: project(activityOf(current.value, MUSEUM)),
    visibleIds: visible.map(item => item.id), activeIds: active.map(item => item.id), activeStops: active.length,
    estimatedEUR: active.reduce((total, item) => total + item.cost, 0), uiEstimate: (await state.page.locator('.day-heading').innerText()).replace(/\s+/g, ' '),
    durableMatchesExpected: true };
  state.row.observations.snapshots.push(row); return row;
}
async function navigate(state, reload = false) {
  await drain(state.guard); state.row.observations.stage = reload ? 'reload' : 'navigation';
  const response = await bounded(reload ? state.page.reload({ waitUntil: 'load', timeout: budget(state, 30000) })
    : state.page.goto(ORIGIN, { waitUntil: 'load', timeout: budget(state, 30000) }), budget(state, 30000), 'root_navigation_timeout');
  need(response && response.status() === 200 && response.url() === ORIGIN + '/', 'root_response_identity');
  const body = await bounded(response.body(), budget(state), 'root_body_timeout'); need(body.length <= 2097152, 'root_body_bound');
  const ids = [...new Set(body.toString('utf8').match(/\bdpl_[A-Za-z0-9]+\b/g) ?? [])];
  state.row.observations.rootNavigations.push({ status: response.status(), sameOrigin: true, rootPath: true, deploymentIdCount: ids.length,
    matchesExpected: ids.length === 1 && ids[0] === report.expectedDeployment, bodyBytes: body.length, bodySha256: sha(body), bodyRetained: false,
    bodyEvidence: 'Observed Playwright decoded HTML body; no wire-byte or compiled-source equivalence claim.' });
  need(ids.length === 1 && ids[0] === report.expectedDeployment, 'root_deployment_mismatch');
  await poll(state, async () => await state.page.getByRole('combobox', { name: 'Choose your trip', exact: true }).inputValue() === TRIP
    && await state.page.getByRole('heading', { name: 'Your itinerary', exact: true }).isVisible()
    && await state.page.locator('.app-shell').getAttribute('aria-busy') === 'false', 'workspace_not_ready');
}
function boundary(guard) {
  return { allowedReads: guard.allowedReads, blockedApi: guard.api, blockedWeather: guard.weather, blockedTiles: guard.tiles, blockedFonts: guard.fonts,
    unexpectedReads: guard.unexpected, blockedMutations: guard.mutations, blockedWebSockets: guard.webSockets, pageErrors: guard.pageErrors, pageCrashes: guard.pageCrashes,
    allowedRequestFailures: guard.allowedRequestFailures, responseErrors: guard.responseErrors, unexpectedPages: guard.unexpectedPages,
    unexpectedDownloads: guard.unexpectedDownloads, routeErrors: guard.routeErrors, requestsFinished: guard.requestsFinished,
    knownBlockedFailures: guard.knownBlockedFailures, pendingRequests: guard.pending.size, pendingJobs: guard.jobs.size,
    allowedAssetPaths: [...guard.allowedAssetPaths].sort(), events: guard.events, diagnostics: guard.failures };
}
async function runCase(definition, row) {
  const state = { definition, row, end: Math.min(Date.now() + 100000, workEnd), page: null, guard: null, context: null };
  need(workEnd - Date.now() >= 100000, 'case_window_unavailable'); owner();
  try {
    const context = await bounded(browser.newContext({ viewport: definition.viewport, isMobile: definition.isMobile, hasTouch: definition.hasTouch,
      deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'UTC', acceptDownloads: false, serviceWorkers: 'block' }), budget(state), 'context_create_timeout');
    state.context = context; contexts.add(context); report.cleanup.contextsCreated++;
    context.once('close', () => {
      contexts.delete(context);
      if (closingContexts.has(context)) report.cleanup.contextsClosed++;
      else report.cleanup.failures.push('unexpected_context_close');
    });
    const fresh = await bounded(context.storageState(), budget(state), 'fresh_storage_timeout');
    need(fresh.cookies.length === 0 && fresh.origins.length === 0, 'fresh_context_required'); row.observations.freshContextEmpty = true;
    state.guard = await installGuard(context, state);
    state.page = await bounded(context.newPage(), budget(state), 'page_create_timeout'); report.cleanup.pagesCreated++;
    state.page.once('close', () => {
      if (closingContexts.has(context)) report.cleanup.pagesClosed++;
      else report.cleanup.failures.push('unexpected_page_close');
    });
    state.page.on('download', download => { state.guard.unexpectedDownloads++; event(state.guard, 'download'); track(state.guard, download.cancel()); });
    state.page.setDefaultTimeout(10000); state.page.setDefaultNavigationTimeout(30000);
    await navigate(state);
    let baseline;
    await poll(state, async () => { baseline = await stored(state); return baseline !== null; }, 'initial_durable_workspace_missing');
    sampleGuard(baseline.value); const expected = copy(baseline.value);
    row.observations.fixture = { source: 'application-authored-private-demo', tripId: TRIP, dayId: DAY, coffeeId: COFFEE, gardenId: GARDEN, museumId: MUSEUM,
      noImportOrStorageSeed: true, originalTripCount: 3, originalTime: '14:30', baselineAlternativeId: MUSEUM };
    row.observations.viewport = await bounded(state.page.evaluate(() => ({ innerWidth, innerHeight, devicePixelRatio,
      maxTouchPoints: navigator.maxTouchPoints, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })), budget(state), 'viewport_observation_timeout');
    need(row.observations.viewport.innerWidth === definition.viewport.width && row.observations.viewport.innerHeight === definition.viewport.height
      && (definition.hasTouch ? row.observations.viewport.maxTouchPoints > 0 : row.observations.viewport.maxTouchPoints === 0), 'viewport_profile_mismatch');
    await snapshot(state, 'baseline', expected);
    await activate(state, card(state, COFFEE_TITLE).getByRole('button', { name: 'Mark as done', exact: true })); activityOf(expected, COFFEE).status = 'done';
    await snapshot(state, 'done_first', expected);
    await activate(state, card(state, COFFEE_TITLE).getByRole('button', { name: 'Been there', exact: true })); activityOf(expected, COFFEE).status = 'planned';
    await snapshot(state, 'done_undone', expected);
    await activate(state, card(state, COFFEE_TITLE).getByRole('button', { name: 'Mark as done', exact: true })); activityOf(expected, COFFEE).status = 'done';
    await snapshot(state, 'done_again', expected); await navigate(state, true); await snapshot(state, 'done_reloaded', expected);
    await activate(state, card(state, COFFEE_TITLE).getByRole('button', { name: 'Skip ' + COFFEE_TITLE, exact: true })); activityOf(expected, COFFEE).status = 'skipped';
    await snapshot(state, 'skipped', expected); await navigate(state, true); await snapshot(state, 'skipped_reloaded', expected);
    await activate(state, card(state, COFFEE_TITLE).getByRole('button', { name: 'Restore ' + COFFEE_TITLE, exact: true })); activityOf(expected, COFFEE).status = 'planned';
    await snapshot(state, 'restored', expected); await navigate(state, true); await snapshot(state, 'restored_reloaded', expected);
    await activate(state, card(state, GARDEN_TITLE).getByRole('button', { name: 'Swap', exact: true }));
    await activate(state, state.page.getByRole('dialog').getByRole('button', { name: new RegExp(MUSEUM_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));
    const day = dayOf(expected), originalGarden = copy(activityOf(expected, GARDEN)), replacement = copy(activityOf(expected, MUSEUM));
    replacement.status = 'planned'; replacement.time = originalGarden.time; delete replacement.alternativeFor;
    originalGarden.status = 'skipped'; originalGarden.alternativeFor = MUSEUM;
    day.activities = [activityOf(expected, COFFEE), ...day.activities.filter(item => ![COFFEE, GARDEN, MUSEUM].includes(item.id)), replacement, originalGarden];
    await snapshot(state, 'swapped', expected);
    need(await card(state, GARDEN_TITLE).count() === 0 && await card(state, MUSEUM_TITLE).count() === 1, 'swap_visibility_mismatch');
    await navigate(state, true); await snapshot(state, 'swapped_reloaded', expected);
    need(row.observations.rootNavigations.length === 5 && row.observations.snapshots.length === 11, 'journey_scope_mismatch');
    await drain(state.guard); healthy(state.guard); budget(state); row.accepted = true; row.error = null; row.observations.stage = 'complete';
  } catch (error) { row.error = finite(error); row.diagnostic = diagnostic(error); }
  finally {
    if (state.guard && state.page && !state.page.isClosed()) {
      try { await bounded(drain(state.guard), 3500, 'case_network_cleanup_timeout'); } catch (error) { row.cleanupError = finite(error); }
    }
    if (state.context) {
      if (state.page?.isClosed()) report.cleanup.failures.push('page_closed_before_context_close');
      closingContexts.add(state.context);
      try { await bounded(state.context.close(), 10000, 'context_close_timeout'); } catch (error) { report.cleanup.failures.push(finite(error)); }
    }
    if (state.guard) {
      try {
        await bounded(Promise.allSettled([...state.guard.jobs]), 3000, 'route_cleanup_timeout');
        need(state.guard.pending.size === 0 && state.guard.jobs.size === 0 && state.guard.routeErrors === 0, 'case_resources_remaining'); healthy(state.guard);
      } catch (error) { row.cleanupError ??= finite(error); }
      row.boundary = boundary(state.guard);
    }
    if (row.cleanupError || report.cleanup.failures.length) { row.accepted = false; row.error ??= 'case_cleanup_unverified'; }
    if (!row.accepted) row.error ??= 'case_failed';
  }
}
try {
  need(process.platform === 'linux' && process.version === 'v24.21.0' && process.env.CI === 'true'
    && /^[a-f0-9]{40}$/.test(report.sourceCommit ?? '') && /^dpl_[A-Za-z0-9]{1,100}$/.test(report.expectedDeployment ?? '')
    && process.env.TRIPPIN_ITINERARY_ORIGIN === ORIGIN, 'approved_ci_profile_required');
  root = fs.realpathSync(process.env.TRIPPIN_ITINERARY_RUN_ROOT ?? ''); nonce = process.env.TRIPPIN_ITINERARY_NONCE;
  need(root === process.env.TRIPPIN_ITINERARY_RUN_ROOT && /^[a-f0-9]{32}$/.test(nonce ?? ''), 'root_scope_invalid');
  identity = fs.lstatSync(root); markerIdentity = fs.lstatSync(path.join(root, '.owner')); owner();
  source = fs.realpathSync(process.env.TRIPPIN_ITINERARY_SOURCE_ROOT ?? ''); sourceBefore = sourceVector(); report.sourceFiles = sourceBefore;
  playwrightRoot = fs.realpathSync(process.env.TRIPPIN_ITINERARY_PLAYWRIGHT_ROOT ?? ''); need(inside(root, playwrightRoot), 'playwright_outside_owned_root');
  const tool = JSON.parse(read(path.join(playwrightRoot, 'package.json'), 65536)); need(tool.name === '@playwright/test' && tool.version === '1.61.1', 'playwright_test_version');
  const require = createRequire(path.join(playwrightRoot, 'package.json')), packageFile = fs.realpathSync(require.resolve('playwright/package.json'));
  need(inside(root, packageFile), 'playwright_package_outside_owned_root');
  const pkg = JSON.parse(read(packageFile, 65536)); need(pkg.name === 'playwright' && pkg.version === '1.61.1', 'playwright_version');
  const { chromium } = require('playwright'), executable = fs.realpathSync(chromium.executablePath()); need(inside(root, executable), 'browser_binary_outside_owned_root');
  report.runtime = { node: process.version, playwright: pkg.version, profiles: CASES.map(({ id, profile, viewport, isMobile, hasTouch }) => ({ id, profile, viewport, isMobile, hasTouch })),
    applicationImports: false, storageMutationByHarness: false };
  browser = await bounded(chromium.launch({ headless: true, timeout: 15000 }), 18000, 'browser_launch_timeout');
  browser.once('disconnected', () => {
    report.cleanup.browserDisconnectedObserved = true;
    if (browserCloseExpected) report.cleanup.browserClosed = true;
    else report.cleanup.failures.push('unexpected_browser_disconnect');
  }); report.runtime.browserVersion = browser.version();
  for (let index = 0; index < CASES.length; index++) {
    if (interrupted || expired || workEnd - Date.now() < 100000) { report.cases[index].error = 'case_window_unavailable'; continue; }
    await runCase(CASES[index], report.cases[index]);
  }
} catch (error) { report.errors.push(finite(error)); report.diagnostic = diagnostic(error); }
finally {
  clearTimeout(workTimer);
  cleanupEnd = Date.now() + 60000;
  for (const context of [...contexts]) {
    closingContexts.add(context);
    try { await bounded(context.close(), Math.max(1, Math.min(10000, cleanupEnd - Date.now())), 'final_context_close_timeout'); }
    catch (error) { report.cleanup.failures.push(finite(error)); }
  }
  if (browser) {
    report.cleanup.remainingContexts = browser.contexts().length;
    if (!browser.isConnected()) report.cleanup.failures.push('browser_disconnected_before_close');
    browserCloseExpected = true;
    try { await bounded(browser.close(), Math.max(1, Math.min(10000, cleanupEnd - Date.now())), 'browser_close_timeout'); }
    catch (error) { report.cleanup.failures.push(finite(error)); }
    if (browser.isConnected()) report.cleanup.failures.push('browser_still_connected');
  }
  try { if (sourceBefore) need(JSON.stringify(sourceVector()) === JSON.stringify(sourceBefore), 'source_files_changed'); if (identity) owner(); }
  catch (error) { report.cleanup.failures.push(finite(error)); }
  const waitEnd = Math.min(Date.now() + 3000, cleanupEnd);
  while (operations.size && Date.now() < waitEnd) await pause(25);
  report.cleanup.pendingJobs = operations.size + guards.reduce((sum, guard) => sum + guard.jobs.size, 0);
  report.cleanup.pendingRequests = guards.reduce((sum, guard) => sum + guard.pending.size, 0);
  report.cleanup.passed = report.cleanup.contextsCreated === 2 && report.cleanup.contextsClosed === 2 && report.cleanup.pagesCreated === 2
    && report.cleanup.pagesClosed === 2 && report.cleanup.browserClosed && report.cleanup.remainingContexts === 0
    && report.cleanup.pendingJobs === 0 && report.cleanup.pendingRequests === 0 && report.cleanup.failures.length === 0;
  if (interrupted) report.errors.push('interrupted'); if (expired || Date.now() > workEnd + 60000) report.errors.push('global_deadline');
  if (!report.cleanup.passed) report.errors.push('resource_cleanup_unverified');
  report.status = report.errors.length === 0 && report.cases.every(row => row.accepted && row.error === null) && report.cleanup.passed ? 'passed' : 'failed';
  report.completedAtUtc = new Date().toISOString();
  let output = JSON.stringify(report);
  if (Buffer.byteLength(output) > REPORT_LIMIT) { report.status = 'failed'; output = JSON.stringify({ schemaVersion: 1, sourceCommit: report.sourceCommit, status: 'failed', errors: ['report_limit'] }); }
  const timer = setTimeout(() => process.exit(1), 2000);
  process.stdout.write('TRIPPIN_ITINERARY_BROWSER_RESULT=' + output + '\n', () => {
    clearTimeout(timer); for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    process.exit(report.status === 'passed' ? 0 : 1);
  });
}
