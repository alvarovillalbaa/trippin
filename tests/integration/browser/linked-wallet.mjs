#!/usr/bin/env node
// T2 focused browser-client integration: actual public UI and private Chromium
// persistence over the app's authored demo samples. Server integrations are excluded.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const ORIGIN = 'https://trippin-theta.vercel.app';
const RUNTIME_COMMIT = 'ac01586f10a0f1ff8609c00ee43300c57249a012';
const STORAGE_KEY = 'trippin.workspace.v1';
const TRIP = 'trip-munich', DAY = 'munich-day-2', ACTIVITY = 'm2-art';
const BOOKING_TITLE = 'QA authored gallery reservation', EXPENSE_TITLE = 'QA authored gallery payment';
const REFERENCE = 'AUTHORED-LOCAL', DATE = '2026-10-23', NOTES = 'Authored check only; no reservation or purchase.';
const STAGES = ['baseline', 'reservation_saved', 'reservation_saved_reloaded', 'reservation_edited', 'reservation_edited_reloaded',
  'actual_logged', 'actual_logged_reloaded', 'reservation_removed', 'reservation_removed_reloaded', 'actual_deleted', 'actual_deleted_reloaded'];
const LEDGERS = [
  { total: 687, spent: 0, bookings: 453, activities: 42, reservationCount: 2, expenseCount: 0 },
  { total: 695, spent: 0, bookings: 473, activities: 30, reservationCount: 3, expenseCount: 0 },
  { total: 699, spent: 0, bookings: 477, activities: 30, reservationCount: 3, expenseCount: 0 },
  { total: 693, spent: 18, bookings: 471, activities: 30, reservationCount: 3, expenseCount: 1 },
  { total: 693, spent: 18, bookings: 453, activities: 48, reservationCount: 2, expenseCount: 1 },
  { total: 687, spent: 0, bookings: 453, activities: 42, reservationCount: 2, expenseCount: 0 },
].map(value => ({ ...value, budget: 850, remaining: 850 - value.total, food: 152, transport: 40, manual: 0, days: 4 }));
const CASES = [
  { id: 'W01', profile: 'desktop-chromium', title: 'desktop linked reservations actual expenses and reconciliation persist across reloads',
    viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false },
  { id: 'W02', profile: 'mobile-chromium', title: 'narrow touch linked reservations actual expenses and reconciliation persist across reloads',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const SOURCE_FILES = ['lib/data.ts', 'lib/trip.ts', 'components/workspace.tsx', 'components/trip-map.tsx', 'app/globals.css', 'app/layout.tsx', 'lib/types.ts'];
const REPORT_LIMIT = 524288, WORKSPACE_LIMIT = 262144, ZIP_LIMIT = 32768, ALL_ZIP_LIMIT = 131072;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const need = (condition, code) => { if (!condition) throw new Error(code); };
const inside = (parent, child) => child.startsWith(parent + path.sep);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const copy = value => JSON.parse(JSON.stringify(value));
const report = {
  schemaVersion: 1, sourceCommit: process.env.SOURCE_COMMIT ?? null, origin: ORIGIN,
  expectedDeployment: process.env.TRIPPIN_WALLET_EXPECTED_DEPLOYMENT ?? null, expectedRuntimeCommit: RUNTIME_COMMIT,
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
    'The manual reservation and actual expense are authored checks only. A linked actual replaces its reservation estimate, and follows the unchanged itinerary activity when that reservation is removed.',
    'Every root navigation/reload checks actual response HTML for one expected deployment ID. Static URL admission and response metadata are observational; compiled asset/source-byte equivalence is not claimed.',
    'Known API/weather/tile/font reads are deliberately blocked as in the accepted portability packet. Unknown reads, mutations, WebSockets, admitted-request failures and uncaught page errors fail this packet.',
    'Narrow mobile/touch is Chromium emulation, not physical-device, cross-browser or assistive-technology acceptance. No old core, shared-import, CSV/backup, zoom or itinerary lifecycle case is rerun.',
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
  const trip = tripOf(value), activity = activityOf(value, ACTIVITY), totals = { food: 0, transport: 0, other: 0 };
  for (const item of trip.days.flatMap(day => day.activities).filter(item => item.status !== 'skipped')) {
    const category = ['food', 'transport'].includes(item.category) ? item.category : 'other'; totals[category] += item.cost;
  }
  need(trip.budget === 850 && trip.currency === 'EUR' && trip.days.length === 4 && trip.expenses.length === 0
    && JSON.stringify(trip.bookings.map(item => [item.id, item.cost, item.activityId ?? null])) === JSON.stringify([['m-flight', 168, null], ['m-stay', 285, null]])
    && value.profile.dailyFoodBudget === 38 && value.profile.dailyTransportBudget === 10
    && totals.food === 89 && totals.transport === 16 && totals.other === 42
    && activity.title === 'Get a little lost in modern art' && activity.category === 'culture' && activity.status === 'planned'
    && activity.cost === 12 && activity.source === 'demo' && dayOf(value).date === DATE, 'sample_wallet_contract');
}
function tripOf(workspace) {
  const rows = workspace.trips.filter(item => item.id === TRIP); need(rows.length === 1, 'sample_trip_identity'); return rows[0];
}
function bookingCard(state) {
  return state.page.locator('article.booking-card').filter({ has: state.page.getByRole('heading', { name: BOOKING_TITLE, exact: true }) });
}
async function activate(state, locator) {
  healthy(state.guard);
  if (state.definition.hasTouch) await bounded(locator.tap({ timeout: budget(state) }), budget(state), 'touch_action_timeout');
  else await bounded(locator.click({ timeout: budget(state) }), budget(state), 'click_action_timeout');
}
const text = value => value.replace(/\s+/g, ' ').trim();
const money = value => '€' + value;
async function showView(state, name, heading) {
  if (!await state.page.getByRole('heading', { name: heading, exact: true }).isVisible()) {
    await activate(state, state.page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name, exact: true }));
  }
  await poll(state, async () => await state.page.getByRole('heading', { name: heading, exact: true }).isVisible(), 'wallet_view_not_ready');
}
async function walletObservation(state, expected, ledger) {
  await showView(state, 'Bookings', 'Less digging. More going.');
  const booking = tripOf(expected).bookings.find(item => item.id === state.bookingId) ?? null;
  let observation;
  await poll(state, async () => {
    const count = await state.page.locator('article.booking-card').count(), target = bookingCard(state);
    if (count !== ledger.reservationCount || await target.count() !== (booking ? 1 : 0)) return false;
    if (!booking) { observation = { reservationCount: count, authoredReservationVisible: false, cardText: null }; return true; }
    if (!await target.isVisible()) return false;
    const status = text(await target.locator('.page-eyebrow').innerText()), reference = text(await target.locator('.booking-reference').innerText());
    const cost = text(await target.locator('.booking-info > p').first().innerText()), notes = text(await target.locator('.booking-notes').innerText());
    if (status !== 'EVENT · RESERVED' || reference !== 'Reference: ' + REFERENCE || notes !== NOTES
      || !cost.endsWith(' · ' + money(booking.cost))) return false;
    observation = { reservationCount: count, authoredReservationVisible: true, cardText: text(await target.innerText()) };
    need(Buffer.byteLength(observation.cardText) <= 2048, 'wallet_card_bound'); return true;
  }, 'wallet_card_mismatch');
  return observation;
}
async function budgetObservation(state) {
  const projectedText = text(await state.page.locator('.budget-banner h2').innerText());
  const remainingText = text(await state.page.locator('.budget-banner p').innerText()), breakdown = [];
  const rows = state.page.locator('.budget-breakdown > div');
  for (let index = 0; index < await rows.count(); index++) breakdown.push({ label: text(await rows.nth(index).locator('span').innerText()),
    amountText: text(await rows.nth(index).locator('strong').innerText()) });
  const recordedText = text(await state.page.locator('.section-heading').filter({ has: state.page.getByRole('heading', { name: 'What you’ve actually spent.', exact: true }) }).locator('p').innerText());
  const expenseRows = state.page.locator('.expense-row'), expenses = [];
  for (let index = 0; index < await expenseRows.count(); index++) expenses.push({ title: text(await expenseRows.nth(index).locator('strong').innerText()),
    amountText: text(await expenseRows.nth(index).locator('b').innerText()) });
  const value = { projectedText, remainingText, breakdown, recordedText, expenses };
  need(Buffer.byteLength(JSON.stringify(value)) <= 4096, 'budget_ui_bound'); return value;
}
function uiMatches(value, ledger) {
  return JSON.stringify(value.projectedText.match(/€\s*\d+(?:[.,]\d+)*/g)) === JSON.stringify([money(ledger.total), money(ledger.budget)])
    && value.remainingText === money(ledger.remaining) + ' of breathing room.'
    && JSON.stringify(value.breakdown) === JSON.stringify([
      { label: 'Flights, stays & tickets', amountText: money(ledger.bookings) }, { label: 'Things to do', amountText: money(ledger.activities) },
      { label: 'Food & daily travel', amountText: money(ledger.food + ledger.transport) }, { label: 'Other expenses', amountText: money(ledger.manual) }])
    && value.recordedText === money(ledger.spent) + ' recorded · estimates adjust when you link a booking.'
    && JSON.stringify(value.expenses) === JSON.stringify(ledger.expenseCount ? [{ title: EXPENSE_TITLE, amountText: '€18' }] : []);
}
async function snapshot(state, stage, expected, ledgerIndex) {
  state.row.observations.stage = stage; const serialized = JSON.stringify(expected), expectedHash = sha(serialized); let current;
  const ledger = LEDGERS[ledgerIndex], wallet = await walletObservation(state, expected, ledger);
  await showView(state, 'Trip budget', 'The whole picture.'); let ui;
  await poll(state, async () => {
    current = await stored(state); ui = await budgetObservation(state);
    return current !== null && sha(current.raw) === expectedHash && uiMatches(ui, ledger);
  }, 'durable_or_ui_state_mismatch');
  need(current.raw === serialized, 'durable_original_mismatch');
  const bytes = Buffer.from(current.raw), zip = gzipSync(bytes); totalZip += zip.length;
  need(zip.length <= ZIP_LIMIT && totalZip <= ALL_ZIP_LIMIT, 'snapshot_capture_bound');
  const trip = tripOf(current.value), reservation = trip.bookings.find(item => item.id === state.bookingId) ?? null;
  const expense = trip.expenses.find(item => item.id === state.expenseId) ?? null;
  const row = { stage, raw: { encoding: 'gzip-base64', bytes: bytes.length, sha256: sha(bytes), compressedBytes: zip.length, data: zip.toString('base64') },
    expectedSha256: expectedHash, bookingId: state.bookingId, expenseId: state.expenseId, reservation, expense,
    bookingIds: trip.bookings.map(item => item.id), expenseIds: trip.expenses.map(item => item.id), ledger, ui, wallet, durableMatchesExpected: true };
  state.row.observations.snapshots.push(row); return row;
}
async function fill(state, locator, value) {
  await bounded(locator.fill(value, { timeout: budget(state) }), budget(state), 'form_fill_timeout');
}
async function choose(state, locator, value) {
  await bounded(locator.selectOption(value, { timeout: budget(state) }), budget(state), 'form_choice_timeout');
}
async function appendedId(state, collection, title, previousIds) {
  let id;
  await poll(state, async () => {
    const current = await stored(state); if (!current) return false;
    const rows = tripOf(current.value)[collection], matching = rows.filter(item => item.title === title);
    if (rows.length !== previousIds.length + 1 || matching.length !== 1) return false;
    id = matching[0].id;
    return typeof id === 'string' && id.length > 0 && id.length <= 160 && id.trim() === id && !id.includes('\0')
      && !previousIds.includes(id) && id !== state.bookingId && id !== state.expenseId;
  }, 'authored_new_identity_missing');
  return id;
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
  const state = { definition, row, end: Math.min(Date.now() + 100000, workEnd), page: null, guard: null, context: null, bookingId: null, expenseId: null };
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
    row.observations.fixture = { source: 'application-authored-private-demo', tripId: TRIP, dayId: DAY, activityId: ACTIVITY,
      noImportOrStorageSeed: true, originalTripCount: 3, activityCost: 12, bookingTitle: BOOKING_TITLE, expenseTitle: EXPENSE_TITLE,
      date: DATE, reference: REFERENCE, notes: NOTES };
    row.observations.identities = { bookingId: null, expenseId: null }; row.observations.baselineSha256 = sha(baseline.raw);
    row.observations.viewport = await bounded(state.page.evaluate(() => ({ innerWidth, innerHeight, devicePixelRatio,
      maxTouchPoints: navigator.maxTouchPoints, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })), budget(state), 'viewport_observation_timeout');
    need(row.observations.viewport.innerWidth === definition.viewport.width && row.observations.viewport.innerHeight === definition.viewport.height
      && (definition.hasTouch ? row.observations.viewport.maxTouchPoints > 0 : row.observations.viewport.maxTouchPoints === 0), 'viewport_profile_mismatch');
    await snapshot(state, 'baseline', expected, 0);
    await showView(state, 'Bookings', 'Less digging. More going.');
    await activate(state, state.page.getByRole('button', { name: 'Save reservation', exact: true }));
    const bookingDialog = state.page.getByRole('dialog', { name: 'Keep the details close.', exact: true });
    await choose(state, bookingDialog.getByLabel('Reservation type', { exact: true }), 'event');
    await choose(state, bookingDialog.getByLabel('Status', { exact: true }), 'reserved');
    await fill(state, bookingDialog.getByLabel('Title', { exact: true }), BOOKING_TITLE);
    await fill(state, bookingDialog.getByLabel('Date', { exact: true }), DATE);
    await fill(state, bookingDialog.getByLabel('Total cost (€)', { exact: true }), '20');
    await fill(state, bookingDialog.getByLabel('Booking reference', { exact: true }), REFERENCE);
    await choose(state, bookingDialog.getByLabel('Replaces an itinerary cost?', { exact: true }), ACTIVITY);
    await fill(state, bookingDialog.getByLabel('Booking or ticket URL', { exact: true }), '');
    await fill(state, bookingDialog.getByLabel('Anything else?', { exact: true }), NOTES);
    await activate(state, bookingDialog.getByRole('button', { name: 'Save reservation', exact: true }));
    state.bookingId = await appendedId(state, 'bookings', BOOKING_TITLE, tripOf(expected).bookings.map(item => item.id));
    row.observations.identities.bookingId = state.bookingId;
    tripOf(expected).bookings.push({ id: state.bookingId, activityId: ACTIVITY, type: 'event', title: BOOKING_TITLE,
      reference: REFERENCE, date: DATE, cost: 20, notes: NOTES, status: 'reserved', source: 'custom' });
    await snapshot(state, 'reservation_saved', expected, 1);
    await navigate(state, true); await snapshot(state, 'reservation_saved_reloaded', expected, 1);

    await showView(state, 'Bookings', 'Less digging. More going.');
    await activate(state, bookingCard(state).getByRole('button', { name: 'Edit booking ' + BOOKING_TITLE, exact: true }));
    await fill(state, bookingDialog.getByLabel('Total cost (€)', { exact: true }), '24');
    await activate(state, bookingDialog.getByRole('button', { name: 'Save reservation', exact: true }));
    tripOf(expected).bookings.find(item => item.id === state.bookingId).cost = 24;
    await snapshot(state, 'reservation_edited', expected, 2);
    await navigate(state, true); await snapshot(state, 'reservation_edited_reloaded', expected, 2);

    await activate(state, state.page.getByRole('button', { name: 'Log expense', exact: true }));
    const expenseDialog = state.page.getByRole('dialog', { name: 'A little expense.', exact: true });
    await fill(state, expenseDialog.getByLabel('What was it?', { exact: true }), EXPENSE_TITLE);
    await fill(state, expenseDialog.getByLabel('Amount (€)', { exact: true }), '18');
    await fill(state, expenseDialog.getByLabel('Date', { exact: true }), DATE);
    await choose(state, expenseDialog.getByLabel('Category', { exact: true }), 'culture');
    await choose(state, expenseDialog.getByLabel('Replaces a planned cost?', { exact: true }), 'booking:' + state.bookingId);
    await activate(state, expenseDialog.getByRole('button', { name: 'Log expense', exact: true }));
    state.expenseId = await appendedId(state, 'expenses', EXPENSE_TITLE, tripOf(expected).expenses.map(item => item.id));
    row.observations.identities.expenseId = state.expenseId;
    tripOf(expected).expenses.push({ id: state.expenseId, title: EXPENSE_TITLE, category: 'culture', amount: 18, date: DATE, bookingId: state.bookingId });
    await snapshot(state, 'actual_logged', expected, 3);
    await navigate(state, true); await snapshot(state, 'actual_logged_reloaded', expected, 3);

    await showView(state, 'Bookings', 'Less digging. More going.');
    await activate(state, bookingCard(state).getByRole('button', { name: 'Remove booking ' + BOOKING_TITLE, exact: true }));
    tripOf(expected).bookings = tripOf(expected).bookings.filter(item => item.id !== state.bookingId);
    const actual = tripOf(expected).expenses.find(item => item.id === state.expenseId); delete actual.bookingId; actual.activityId = ACTIVITY;
    await snapshot(state, 'reservation_removed', expected, 4);
    await navigate(state, true); await snapshot(state, 'reservation_removed_reloaded', expected, 4);

    await activate(state, state.page.getByRole('button', { name: 'Delete expense ' + EXPENSE_TITLE, exact: true }));
    tripOf(expected).expenses = tripOf(expected).expenses.filter(item => item.id !== state.expenseId);
    await snapshot(state, 'actual_deleted', expected, 5);
    await navigate(state, true); const final = await snapshot(state, 'actual_deleted_reloaded', expected, 5);
    need(JSON.stringify(expected) === baseline.raw && final.raw.sha256 === sha(baseline.raw), 'final_baseline_not_restored');
    row.observations.finalBaselineByteExact = true; row.observations.finalSha256 = final.raw.sha256;
    need(row.observations.rootNavigations.length === 6 && row.observations.snapshots.length === STAGES.length
      && row.observations.snapshots.every((item, index) => item.stage === STAGES[index]), 'journey_scope_mismatch');
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
    && process.env.TRIPPIN_WALLET_ORIGIN === ORIGIN, 'approved_ci_profile_required');
  root = fs.realpathSync(process.env.TRIPPIN_WALLET_RUN_ROOT ?? ''); nonce = process.env.TRIPPIN_WALLET_NONCE;
  need(root === process.env.TRIPPIN_WALLET_RUN_ROOT && /^[a-f0-9]{32}$/.test(nonce ?? ''), 'root_scope_invalid');
  identity = fs.lstatSync(root); markerIdentity = fs.lstatSync(path.join(root, '.owner')); owner();
  source = fs.realpathSync(process.env.TRIPPIN_WALLET_SOURCE_ROOT ?? ''); sourceBefore = sourceVector(); report.sourceFiles = sourceBefore;
  playwrightRoot = fs.realpathSync(process.env.TRIPPIN_WALLET_PLAYWRIGHT_ROOT ?? ''); need(inside(root, playwrightRoot), 'playwright_outside_owned_root');
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
  process.stdout.write('TRIPPIN_WALLET_BROWSER_RESULT=' + output + '\n', () => {
    clearTimeout(timer); for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    process.exit(report.status === 'passed' ? 0 : 1);
  });
}
