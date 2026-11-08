#!/usr/bin/env node
// T2 focused browser-client integration: actual public UI and private Chromium
// scratch estimates over authored private fixtures. Server integrations are excluded.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const ORIGIN = 'https://trippin-theta.vercel.app';
const RUNTIME_COMMIT = process.env.TRIPPIN_STAY_RUNTIME_COMMIT ?? null;
const STORAGE_KEY = 'trippin.workspace.v1';
const TRIP = 'trip-munich', DAY = 'munich-day-2', ACTIVITY = 'm2-art';
const AUTHORED_TITLE = 'QA authored same-day stay', DATE = '2026-11-08';
const STAGES = ['baseline', 'time_value', 'decimals', 'equal_totals', 'negative_clamped', 'maximum_clamped',
  'sample_reloaded', 'same_day_created', 'same_day_nightly_ignored', 'same_day_reloaded', 'authored_trip_removed', 'final_reloaded'];
const DEFAULTS = { a: { nightly: 95, fees: 20, transit: 0, minutes: 10 }, b: { nightly: 65, fees: 30, transit: 9, minutes: 35 }, timeValue: 0 };
const DECIMALS = { a: { nightly: 100.25, fees: 1.25, transit: 2.5, minutes: 10 }, b: { nightly: 99.99, fees: 1.01, transit: 2.49, minutes: 35 }, timeValue: 0 };
const TIED = { a: { nightly: 95, fees: 20, transit: 0, minutes: 10 }, b: { nightly: 95, fees: 20, transit: 0, minutes: 10 }, timeValue: 20 };
const ZERO = { a: { nightly: 0, fees: 0, transit: 0, minutes: 0 }, b: { nightly: 0, fees: 0, transit: 0, minutes: 0 }, timeValue: 0 };
const MAXIMUM = { a: { nightly: 100000, fees: 100000, transit: 100000, minutes: 600 }, b: { nightly: 100000, fees: 100000, transit: 100000, minutes: 600 }, timeValue: 10000 };
const INPUTS = [
  { key: 'a.nightly', label: 'Stay A · closer in Per night (€)', maximum: 100000, step: '0.01' },
  { key: 'a.fees', label: 'Stay A · closer in Total fees (€)', maximum: 100000, step: '0.01' },
  { key: 'a.transit', label: 'Stay A · closer in Daily commute (€)', maximum: 100000, step: '0.01' },
  { key: 'a.minutes', label: 'Stay A · closer in Minutes to center', maximum: 600, step: '1' },
  { key: 'b.nightly', label: 'Stay B · further out Per night (€)', maximum: 100000, step: '0.01' },
  { key: 'b.fees', label: 'Stay B · further out Total fees (€)', maximum: 100000, step: '0.01' },
  { key: 'b.transit', label: 'Stay B · further out Daily commute (€)', maximum: 100000, step: '0.01' },
  { key: 'b.minutes', label: 'Stay B · further out Minutes to center', maximum: 600, step: '1' },
  { key: 'timeValue', label: 'Your time, if you’d like to price it (€ / hour)', maximum: 10000, step: '0.01' },
];
const CASES = [
  { id: 'S01', profile: 'desktop-chromium', title: 'desktop stay cash time bounds and same-day comparison preserve the private workspace',
    viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false },
  { id: 'S02', profile: 'mobile-chromium', title: 'narrow touch stay cash time bounds and same-day comparison preserve the private workspace',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const SOURCE_FILES = ['lib/data.ts', 'lib/trip.ts', 'components/workspace.tsx', 'components/trip-map.tsx', 'app/globals.css',
  'app/layout.tsx', 'lib/types.ts', 'components/stay-comparison.tsx', 'components/new-trip-form.tsx', 'components/trip-settings.tsx'];
const REPORT_LIMIT = 524288, WORKSPACE_LIMIT = 262144, ZIP_LIMIT = 32768, ALL_ZIP_LIMIT = 131072;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const need = (condition, code) => { if (!condition) throw new Error(code); };
const inside = (parent, child) => child.startsWith(parent + path.sep);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const copy = value => JSON.parse(JSON.stringify(value));
const report = {
  schemaVersion: 1, sourceCommit: process.env.SOURCE_COMMIT ?? null, origin: ORIGIN,
  expectedDeployment: process.env.TRIPPIN_STAY_EXPECTED_DEPLOYMENT ?? null, expectedRuntimeCommit: RUNTIME_COMMIT,
  runtimeCommitEvidence: 'Root-reviewed deployment metadata binds the READY alias to the runtime commit; actual root HTML is separately checked for its sole expected deployment ID.',
  tier: 'tier2', layer: 'focused-browser-client-integration', status: 'failed', startedAtUtc: new Date().toISOString(),
  cases: CASES.map(({ id, title, profile }) => ({ id, title, profile, accepted: false, error: 'unrun', observations: { stage: 'unrun', snapshots: [], rootNavigations: [] } })),
  errors: [], limits: { workSeconds: 240, caseSeconds: 100, cleanupSeconds: 60, stdoutSeconds: 2,
    navigationSeconds: 30, actionSeconds: 10, workspaceBytes: WORKSPACE_LIMIT, snapshotGzipBytes: ZIP_LIMIT,
    allSnapshotGzipBytes: ALL_ZIP_LIMIT, reportBytes: REPORT_LIMIT, boundaryEvents: 24 },
  cleanup: { passed: false, contextsCreated: 0, contextsClosed: 0, pagesCreated: 0, pagesClosed: 0,
    browserClosed: false, browserDisconnectedObserved: false, pendingJobs: null, pendingRequests: null, remainingContexts: null, failures: [] },
  proofLimits: [
    'Two fresh private browser contexts exercise the actual hosted stay calculator over the labeled Munich demo, then create and delete one authored same-day private trip through visible controls only.',
    'Calculator values are scratch estimates. All original trips/profile remain byte-exact; only the explicitly authored temporary trip and selectedTripId change, and final whole-workspace bytes equal the original baseline.',
    'Cash/time, rounded-cent comparison, ties, decimal inputs, negative/upper bounds and zero-night calculations use independent literal expectations; no application calculation helper or internal handler is invoked.',
    'Every root navigation/reload checks actual response HTML for one explicitly supplied expected deployment ID. Root-reviewed metadata separately binds its runtime Git source; wire-byte/compiled-source equivalence is not claimed.',
    'Known API/weather/tile/font reads are deliberately blocked. Unknown reads, mutations, WebSockets, admitted-request failures and uncaught page errors remain fatal.',
    'Narrow touch is Chromium emulation, not physical-device, cross-browser or assistive-technology acceptance. Earlier core, creation/share, CSV/backup/zoom, itinerary and wallet case identities are not replayed.',
    'Bounded compressed workspace originals contain only guarded built-in demo data and this authored private fixture. No account, provider, reservation, purchase, public share, model or server mutation is exercised.',
    'Root owns browser process/profile/scratch disposal; this driver proves only its expected context/page/browser and pending-job closure.',
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
function tripOf(workspace, id = TRIP) {
  const rows = workspace.trips.filter(item => item.id === id); need(rows.length === 1, 'trip_identity'); return rows[0];
}
function sampleGuard(value) {
  need(value.selectedTripId === TRIP && value.trips.length === 3 && value.profile?.name === 'Alex Morgan'
    && JSON.stringify(value.trips.map(item => item.id).sort()) === JSON.stringify(['trip-copenhagen', 'trip-lisbon', TRIP].sort())
    && value.trips.every(item => item.isPublic === false), 'fresh_demo_fixture_required');
  const trip = tripOf(value), day = trip.days?.find(item => item.id === DAY), activity = day?.activities.find(item => item.id === ACTIVITY);
  need(trip.budget === 850 && trip.currency === 'EUR' && trip.startDate === '2026-10-22' && trip.endDate === '2026-10-25'
    && trip.days.length === 4 && trip.expenses.length === 0
    && JSON.stringify(trip.bookings.map(item => [item.id, item.cost])) === JSON.stringify([['m-flight', 168], ['m-stay', 285]])
    && value.profile.dailyFoodBudget === 38 && value.profile.dailyTransportBudget === 10
    && day?.date === '2026-10-23' && activity?.title === 'Get a little lost in modern art'
    && activity.status === 'planned' && activity.cost === 12 && activity.source === 'demo', 'sample_stay_contract');
}
async function activate(state, locator) {
  healthy(state.guard);
  if (state.definition.hasTouch) await bounded(locator.tap({ timeout: budget(state) }), budget(state), 'touch_action_timeout');
  else await bounded(locator.click({ timeout: budget(state) }), budget(state), 'click_action_timeout');
}
const text = value => value.replace(/\s+/g, ' ').trim();
const cents = value => Math.round((value + Number.EPSILON) * 100);
const money = value => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR',
  minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
function valueAt(values, key) {
  const [group, field] = key.split('.'); return field ? values[group][field] : values[group];
}
function calculated(values, days, nights) {
  const options = ['a', 'b'].map(key => {
    const stay = values[key], cashCents = cents(stay.nightly * nights + stay.fees + stay.transit * days);
    const hours = stay.minutes * 2 * days / 60, totalCents = cents(stay.nightly * nights + stay.fees + stay.transit * days + hours * values.timeValue);
    return { cashCents, hours, totalCents };
  });
  const [a, b] = options, differenceCents = Math.abs(a.totalCents - b.totalCents), qualifier = values.timeValue > 0 ? ' including your time value' : '';
  const conclusion = differenceCents === 0
    ? 'Both stays have the same total of ' + money(a.totalCents / 100) + qualifier + '.'
    : (a.totalCents < b.totalCents ? 'Stay A' : 'Stay B') + ' has the lower total by ' + money(differenceCents / 100) + qualifier + '.';
  return { days, nights, options, differenceCents, conclusion,
    totalsTexts: options.map(option => money(option.totalCents / 100)),
    commuteTexts: options.map(option => option.hours.toFixed(1) + ' hrs commuting'),
    totalLabels: [0, 1].map(() => values.timeValue > 0 ? 'Including your time value' : 'Stay and commute costs') };
}
async function showView(state, name, heading) {
  if (!await state.page.getByRole('heading', { name: heading, exact: true }).isVisible()) {
    const navigation = state.page.getByRole('navigation', { name: 'Main navigation', exact: true });
    if (name === 'My trips') {
      const control = navigation.getByRole('button', { name: /^My trips(?:\s*\d{2})?$/ });
      const row = { view: 'itinerary', count: await bounded(control.count(), budget(state), 'navigation_count_timeout'), visible: false,
        tagName: null, innerText: null, textContent: null, ariaLabel: null, countBadgeText: null, countBadgeDisplay: null, countBadgeVisible: null };
      state.row.observations.navigationControls.push(row);
      need(row.count === 1, 'itinerary_navigation_not_unique');
      row.visible = await bounded(control.isVisible(), budget(state), 'navigation_visibility_timeout');
      Object.assign(row, await bounded(control.evaluate(element => {
        const normalize = value => value.replace(/\s+/g, ' ').trim(), badge = element.querySelector(':scope > span');
        return { tagName: element.tagName, innerText: normalize(element.innerText), textContent: normalize(element.textContent ?? ''), ariaLabel: element.getAttribute('aria-label'),
          countBadgeText: badge ? normalize(badge.textContent ?? '') : null,
          countBadgeDisplay: badge ? getComputedStyle(badge).display : null,
          countBadgeVisible: badge ? badge.getClientRects().length > 0 && getComputedStyle(badge).visibility !== 'hidden' : false };
      }), budget(state), 'navigation_metadata_timeout'));
      need(row.visible && row.tagName === 'BUTTON' && typeof row.innerText === 'string' && row.innerText.length <= 80
        && /^My trips(?:\s*\d{2})?$/.test(row.innerText) && typeof row.textContent === 'string' && row.textContent.length <= 80
        && /^My trips\s*04$/.test(row.textContent) && row.ariaLabel === null && row.countBadgeText === '04'
        && typeof row.countBadgeDisplay === 'string' && /^[a-z-]{1,32}$/.test(row.countBadgeDisplay)
        && typeof row.countBadgeVisible === 'boolean', 'itinerary_navigation_identity');
      await activate(state, control);
    } else await activate(state, navigation.getByRole('button', { name, exact: true }));
  }
  await poll(state, async () => await state.page.getByRole('heading', { name: heading, exact: true }).isVisible(), 'view_not_ready');
}
function comparison(state) {
  return state.page.locator('section.stay-comparison').filter({ has: state.page.getByRole('heading', { name: 'Cheaper stay. Longer way?', exact: true }) });
}
async function inputMetadata(state, descriptor) {
  const locator = comparison(state).getByLabel(descriptor.label, { exact: true });
  need(await bounded(locator.count(), budget(state), 'input_count_timeout') === 1, 'calculator_input_not_unique');
  const result = await bounded(locator.evaluate(element => ({
    tagName: element.tagName, type: element.getAttribute('type'), ariaLabel: element.getAttribute('aria-label'),
    value: element.value, min: element.min, max: element.max, step: element.step,
    validity: { valid: element.validity.valid, badInput: element.validity.badInput,
      rangeUnderflow: element.validity.rangeUnderflow, rangeOverflow: element.validity.rangeOverflow, stepMismatch: element.validity.stepMismatch },
  })), budget(state), 'input_metadata_timeout');
  need(result.tagName === 'INPUT' && result.type === 'number' && result.ariaLabel === descriptor.label
    && result.min === '0' && result.max === String(descriptor.maximum) && result.step === descriptor.step
    && typeof result.value === 'string' && result.value.length <= 32, 'calculator_input_contract');
  return result;
}
async function edit(state, descriptor, requestedValue, expectedValue, phase) {
  const before = await inputMetadata(state, descriptor);
  const row = { phase, key: descriptor.key, requestedValue, expectedValue, before, after: null, completed: false };
  state.row.observations.inputEdits.push(row);
  await bounded(comparison(state).getByLabel(descriptor.label, { exact: true }).fill(requestedValue, { timeout: budget(state) }),
    budget(state), 'calculator_fill_timeout');
  await poll(state, async () => {
    row.after = await inputMetadata(state, descriptor);
    return row.after.value !== '' && Number(row.after.value) === expectedValue && row.after.validity.valid;
  }, 'calculator_input_value_or_bound');
  row.completed = true;
}
async function setInputs(state, values, phase, requested) {
  state.row.observations.stage = phase;
  for (const descriptor of INPUTS) await edit(state, descriptor,
    requested ? requested(descriptor) : String(valueAt(values, descriptor.key)), valueAt(values, descriptor.key), phase);
}
async function calculatorObservation(state, values, days, nights) {
  const expected = calculated(values, days, nights), section = comparison(state); let result;
  await poll(state, async () => {
    if (await section.count() !== 1 || !await section.isVisible()) return false;
    const inputs = [];
    for (const descriptor of INPUTS) inputs.push({ key: descriptor.key, label: descriptor.label, ...await inputMetadata(state, descriptor) });
    if (inputs.some((input, index) => input.value === '' || Number(input.value) !== valueAt(values, INPUTS[index].key) || !input.validity.valid)) return false;
    const cards = section.locator('.stay-option');
    if (await cards.count() !== 2) return false;
    const totalsTexts = [], commuteTexts = [], totalLabels = [];
    for (let index = 0; index < 2; index++) {
      const label = index === 0 ? 'Stay A · closer in' : 'Stay B · further out', card = cards.nth(index);
      totalsTexts.push(text(await card.getByLabel(label + ' comparison total', { exact: true }).innerText()));
      commuteTexts.push(text(await card.locator('.stay-total span').innerText()));
      const qualifier = card.getByText(expected.totalLabels[index], { exact: true });
      if (await qualifier.count() !== 1 || !await qualifier.isVisible()) return false;
      totalLabels.push(text(await qualifier.innerText()));
    }
    const paragraph = section.locator('.stay-conclusion p'), small = paragraph.locator('small');
    const conclusion = text(await paragraph.evaluate(element => Array.from(element.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent ?? '').join('')));
    const nightsDaysText = text(await small.innerText());
    result = { inputs, totalsTexts, commuteTexts, totalLabels, conclusion, nightsDaysText };
    return JSON.stringify(totalsTexts) === JSON.stringify(expected.totalsTexts)
      && JSON.stringify(commuteTexts) === JSON.stringify(expected.commuteTexts)
      && JSON.stringify(totalLabels) === JSON.stringify(expected.totalLabels) && conclusion === expected.conclusion
      && nightsDaysText.startsWith(nights + ' nights · ' + days + ' days · two journeys per day.');
  }, 'calculator_visible_result_mismatch');
  need(Buffer.byteLength(JSON.stringify(result)) <= 8192, 'calculator_observation_bound');
  return { ...result, expected };
}
async function snapshot(state, stage, expected, values, days = 4, nights = 3) {
  state.row.observations.stage = stage;
  await showView(state, 'Trip budget', 'The whole picture.');
  const serialized = JSON.stringify(expected), expectedHash = sha(serialized); let current;
  await poll(state, async () => {
    current = await stored(state); return current !== null && current.raw === serialized;
  }, 'whole_workspace_changed');
  const calculator = await calculatorObservation(state, values, days, nights);
  const after = await stored(state); need(after !== null && after.raw === current.raw, 'workspace_changed_during_calculation');
  const bytes = Buffer.from(current.raw), zip = gzipSync(bytes); totalZip += zip.length;
  need(zip.length <= ZIP_LIMIT && totalZip <= ALL_ZIP_LIMIT, 'snapshot_capture_bound');
  const row = { stage, raw: { encoding: 'gzip-base64', bytes: bytes.length, sha256: sha(bytes), compressedBytes: zip.length, data: zip.toString('base64') },
    expectedSha256: expectedHash, durableMatchesExpected: true, selectedTripId: current.value.selectedTripId,
    tripIds: current.value.trips.map(trip => trip.id), calculator };
  state.row.observations.snapshots.push(row); return row;
}
async function fill(state, locator, value) {
  await bounded(locator.fill(value, { timeout: budget(state) }), budget(state), 'form_fill_timeout');
}
async function dialogReady(state, locator, phase, title) {
  await bounded(locator.waitFor({ state: 'visible', timeout: budget(state) }), budget(state), 'dialog_visible_timeout');
  const count = await bounded(locator.count(), budget(state), 'dialog_count_timeout');
  const visible = await bounded(locator.isVisible(), budget(state), 'dialog_visibility_timeout');
  const actual = await bounded(locator.evaluate(element => {
    const normalize = value => value.replace(/[\u200b\ufeff]/g, '').replace(/\s+/g, ' ').trim();
    const ids = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    return { tagName: element.tagName, open: element.tagName === 'DIALOG' && element.open === true,
      title: normalize(ids.map(id => document.getElementById(id)?.textContent ?? '').join(' ')) };
  }), budget(state), 'dialog_metadata_timeout');
  const row = { phase, title: actual.title, count, visible, tagName: actual.tagName, open: actual.open };
  state.row.observations.dialogReadiness.push(row);
  need(count === 1 && visible && actual.tagName === 'DIALOG' && actual.open && actual.title === title, 'dialog_identity_or_readiness');
}
function authoredTrip(tripId, dayId) {
  return {
    id: tripId, title: AUTHORED_TITLE, city: 'Munich', country: 'Germany', countryCode: 'DE', startDate: DATE, endDate: DATE,
    lat: 48.1372, lng: 11.5756, image: '/images/munich.jpg',
    description: 'Old-world streets, green escapes, and a table worth staying for.', budget: 850, currency: 'EUR', isPublic: false,
    days: [{ id: dayId, date: DATE, label: 'Find your rhythm', activities: [] }],
    expenses: [], bookings: [], joinRequests: [], companions: [],
  };
}
function baselineIds(value) {
  const result = new Set();
  const visit = item => {
    if (!item || typeof item !== 'object') return;
    if (typeof item.id === 'string') result.add(item.id);
    for (const child of Object.values(item)) if (child && typeof child === 'object') visit(child);
  };
  visit(value); return result;
}
async function createSameDay(state, baseline) {
  state.row.observations.stage = 'create_same_day';
  await activate(state, state.page.getByRole('button', { name: 'Create a trip', exact: true }));
  const dialog = state.page.getByRole('dialog', { name: 'A new chapter.', exact: true });
  await dialogReady(state, dialog, 'create_same_day', 'A new chapter.');
  const destination = dialog.getByLabel(/^Where to\?/);
  need(await destination.count() === 1 && await destination.locator('option').count() === 5, 'authored_destination_control');
  await bounded(destination.selectOption('munich', { timeout: budget(state) }), budget(state), 'authored_destination_choice');
  need(await destination.inputValue() === 'munich', 'authored_destination_mismatch');
  await fill(state, dialog.getByLabel('Give it a name', { exact: true }), AUTHORED_TITLE);
  await fill(state, dialog.getByLabel('First day', { exact: true }), DATE);
  await fill(state, dialog.getByLabel('Last day', { exact: true }), DATE);
  await fill(state, dialog.getByLabel('Whole-trip budget (€)', { exact: true }), '850');
  await poll(state, async () => (await dialog.locator('.form-note').allTextContents()).some(value => text(value).startsWith('1 day, ready to shape.')),
    'same_day_form_count_mismatch');
  await activate(state, dialog.getByRole('button', { name: 'Let’s go', exact: true }));
  const previousIds = baselineIds(baseline.value); let fixture;
  await poll(state, async () => {
    const current = await stored(state);
    if (!current || current.value.trips.length !== baseline.value.trips.length + 1) return false;
    const matches = current.value.trips.filter(trip => trip.title === AUTHORED_TITLE);
    if (matches.length !== 1 || matches[0].days?.length !== 1) return false;
    fixture = matches[0];
    return [fixture.id, fixture.days[0].id].every(id => typeof id === 'string' && id.length > 0 && id.length <= 160
      && id.trim() === id && !id.includes('\0') && !previousIds.has(id)) && fixture.id !== fixture.days[0].id
      && current.value.selectedTripId === fixture.id;
  }, 'authored_trip_identity_missing');
  state.row.observations.identities = { tripId: fixture.id, dayId: fixture.days[0].id };
  const expected = copy(baseline.value); expected.trips.push(authoredTrip(fixture.id, fixture.days[0].id)); expected.selectedTripId = fixture.id;
  return expected;
}
async function removeSameDay(state, expected) {
  state.row.observations.stage = 'remove_same_day';
  await showView(state, 'My trips', 'Your itinerary');
  need(await state.page.getByRole('combobox', { name: 'Choose your trip', exact: true }).inputValue() === expected.selectedTripId, 'delete_wrong_trip');
  await activate(state, state.page.getByRole('button', { name: 'Edit trip details', exact: true }));
  const dialog = state.page.getByRole('dialog', { name: 'A few helpful details.', exact: true });
  await dialogReady(state, dialog, 'remove_same_day', 'A few helpful details.');
  need(await dialog.getByLabel('Trip name', { exact: true }).inputValue() === AUTHORED_TITLE, 'delete_authored_title_mismatch');
  const confirmation = dialog.getByRole('checkbox', { name: 'Delete this trip from this browser.', exact: true });
  need(await confirmation.count() === 1 && !await confirmation.isChecked(), 'delete_confirmation_contract');
  const remove = dialog.getByRole('button', { name: 'Delete trip', exact: true });
  need(await remove.isDisabled(), 'delete_requires_confirmation');
  await activate(state, confirmation); need(await confirmation.isChecked() && await remove.isEnabled(), 'delete_confirmation_not_applied');
  await activate(state, remove);
}
async function navigate(state, reload = false, selectedTripId = TRIP) {
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
  await poll(state, async () => await state.page.getByRole('combobox', { name: 'Choose your trip', exact: true }).inputValue() === selectedTripId
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
    need(JSON.stringify(expected) === baseline.raw, 'baseline_serialization_mismatch');
    row.observations.fixture = { source: 'application-authored-private-demo-and-visible-authored-trip', originalTripId: TRIP,
      noImportOrStorageSeed: true, originalTripCount: 3, authoredTitle: AUTHORED_TITLE, destinationId: 'munich', date: DATE, budget: 850 };
    row.observations.identities = { tripId: null, dayId: null }; row.observations.baselineSha256 = sha(baseline.raw);
    row.observations.dialogReadiness = []; row.observations.inputEdits = []; row.observations.navigationControls = [];
    row.observations.viewport = await bounded(state.page.evaluate(() => ({ innerWidth, innerHeight, devicePixelRatio,
      maxTouchPoints: navigator.maxTouchPoints, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })), budget(state), 'viewport_observation_timeout');
    need(row.observations.viewport.innerWidth === definition.viewport.width && row.observations.viewport.innerHeight === definition.viewport.height
      && (definition.hasTouch ? row.observations.viewport.maxTouchPoints > 0 : row.observations.viewport.maxTouchPoints === 0), 'viewport_profile_mismatch');
    const first = await snapshot(state, 'baseline', expected, DEFAULTS);
    need(first.calculator.expected.options[0].cashCents === 30500 && first.calculator.expected.options[1].cashCents === 26100
      && first.calculator.expected.differenceCents === 4400, 'default_literal_arithmetic');
    await edit(state, INPUTS[8], '20', 20, 'time_value');
    const timeValues = { ...copy(DEFAULTS), timeValue: 20 };
    const timed = await snapshot(state, 'time_value', expected, timeValues);
    need(JSON.stringify(timed.calculator.expected.totalsTexts) === JSON.stringify(['€331.67', '€354.33'])
      && timed.calculator.expected.differenceCents === 2266, 'time_literal_arithmetic');
    await setInputs(state, DECIMALS, 'decimals');
    const decimal = await snapshot(state, 'decimals', expected, DECIMALS);
    need(JSON.stringify(decimal.calculator.expected.totalsTexts) === JSON.stringify(['€312', '€310.94'])
      && decimal.calculator.expected.differenceCents === 106, 'decimal_literal_arithmetic');
    await setInputs(state, TIED, 'equal_totals');
    const tied = await snapshot(state, 'equal_totals', expected, TIED);
    need(tied.calculator.expected.differenceCents === 0 && tied.calculator.conclusion.startsWith('Both stays have the same total of €331.67'),
      'tie_not_explicit');
    await setInputs(state, ZERO, 'negative_clamped', () => '-1');
    await snapshot(state, 'negative_clamped', expected, ZERO);
    await setInputs(state, MAXIMUM, 'maximum_clamped', descriptor => String(descriptor.maximum + 1));
    const maximum = await snapshot(state, 'maximum_clamped', expected, MAXIMUM);
    need(maximum.calculator.expected.options.every(option => option.cashCents === 80000000 && option.totalCents === 160000000), 'maximum_literal_arithmetic');
    await navigate(state, true); await snapshot(state, 'sample_reloaded', expected, DEFAULTS);

    const authored = await createSameDay(state, baseline), authoredId = row.observations.identities.tripId;
    const sameDay = await snapshot(state, 'same_day_created', authored, DEFAULTS, 1, 0);
    need(JSON.stringify(sameDay.calculator.expected.totalsTexts) === JSON.stringify(['€20', '€39'])
      && sameDay.calculator.expected.differenceCents === 1900, 'zero_night_literal_arithmetic');
    const ignored = copy(DEFAULTS); ignored.a.nightly = 123.45; ignored.b.nightly = 999.99;
    await edit(state, INPUTS[0], '123.45', 123.45, 'same_day_nightly_ignored');
    await edit(state, INPUTS[4], '999.99', 999.99, 'same_day_nightly_ignored');
    row.observations.nightlyIgnored = await calculatorObservation(state, ignored, 1, 0);
    need((await stored(state))?.raw === JSON.stringify(authored), 'nightly_edit_changed_workspace');
    const halfCent = copy(ignored); halfCent.a.fees = 1; halfCent.a.minutes = 3; halfCent.timeValue = 0.05;
    await edit(state, INPUTS[1], '1', 1, 'same_day_nightly_ignored');
    await edit(state, INPUTS[3], '3', 3, 'same_day_nightly_ignored');
    await edit(state, INPUTS[8], '0.05', 0.05, 'same_day_nightly_ignored');
    const half = await snapshot(state, 'same_day_nightly_ignored', authored, halfCent, 1, 0);
    need(half.calculator.expected.options[0].totalCents === 101 && half.calculator.expected.options[1].totalCents === 3906
      && half.calculator.expected.differenceCents === 3805, 'half_cent_literal_arithmetic');
    await navigate(state, true, authoredId); await snapshot(state, 'same_day_reloaded', authored, DEFAULTS, 1, 0);
    await removeSameDay(state, authored);
    await snapshot(state, 'authored_trip_removed', expected, DEFAULTS);
    await navigate(state, true); const final = await snapshot(state, 'final_reloaded', expected, DEFAULTS);
    need(final.raw.sha256 === sha(baseline.raw), 'final_baseline_not_restored');
    row.observations.finalBaselineByteExact = true; row.observations.finalSha256 = final.raw.sha256;
    need(row.observations.rootNavigations.length === 4 && row.observations.snapshots.length === STAGES.length
      && row.observations.snapshots.every((item, index) => item.stage === STAGES[index]), 'journey_scope_mismatch');
    need(row.observations.dialogReadiness.length === 2 && row.observations.navigationControls.length === 1 && row.observations.inputEdits.length === 42
      && row.observations.inputEdits.every(item => item.completed), 'input_observation_scope');
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
    && /^[a-f0-9]{40}$/.test(report.sourceCommit ?? '') && /^[a-f0-9]{40}$/.test(RUNTIME_COMMIT ?? '') && /^dpl_[A-Za-z0-9]{1,100}$/.test(report.expectedDeployment ?? '')
    && process.env.TRIPPIN_STAY_ORIGIN === ORIGIN, 'approved_ci_profile_required');
  root = fs.realpathSync(process.env.TRIPPIN_STAY_RUN_ROOT ?? ''); nonce = process.env.TRIPPIN_STAY_NONCE;
  need(root === process.env.TRIPPIN_STAY_RUN_ROOT && /^[a-f0-9]{32}$/.test(nonce ?? ''), 'root_scope_invalid');
  identity = fs.lstatSync(root); markerIdentity = fs.lstatSync(path.join(root, '.owner')); owner();
  source = fs.realpathSync(process.env.TRIPPIN_STAY_SOURCE_ROOT ?? ''); sourceBefore = sourceVector(); report.sourceFiles = sourceBefore;
  playwrightRoot = fs.realpathSync(process.env.TRIPPIN_STAY_PLAYWRIGHT_ROOT ?? ''); need(inside(root, playwrightRoot), 'playwright_outside_owned_root');
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
  process.stdout.write('TRIPPIN_STAY_BROWSER_RESULT=' + output + '\n', () => {
    clearTimeout(timer); for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    process.exit(report.status === 'passed' ? 0 : 1);
  });
}
