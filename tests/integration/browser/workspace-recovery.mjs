// INACTIVE source preparation. A new owner-approved invocation is required.
// T2: actual loopback UI, guest Auth stub and an explicitly authored corruption
// of this disposable context's own UI backup. No real Auth/provider/server write.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

assert.equal(process.env.TRIPPIN_RECOVERY_APPROVED, '1', 'Inactive: obtain new owner approval before running this packet.');
assert.equal(process.versions.node, '24.21.0', 'Use the reviewed Node version.');
const target = new URL(process.env.TRIPPIN_RECOVERY_ORIGIN);
assert.ok(['http:', 'https:'].includes(target.protocol));
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Only the owned loopback application is allowed.');
assert.equal(target.username + target.password + target.search + target.hash, ''); assert.equal(target.pathname, '/');
const origin = target.origin, output = process.env.TRIPPIN_RECOVERY_OUTPUT;
assert.ok(output && path.isAbsolute(output), 'Provide an owned absolute artifact directory without prior driver outputs.');
assert.match(process.env.GITHUB_SHA || '', /^[a-f\d]{40}$/i, 'Bind the reviewed source commit.');
assert.ok(process.env.TRIPPIN_PLAYWRIGHT_PACKAGE, 'Use the separately provisioned pinned browser tool.');
const require = createRequire(process.env.TRIPPIN_PLAYWRIGHT_PACKAGE);
assert.equal(require('@playwright/test/package.json').version, '1.61.1');
const { chromium, expect } = require('@playwright/test');
const KEY = 'trippin.workspace.v2.guest', AUDIT = '__TRIPPIN_RECOVERY_TEST_ONLY_STORAGE_AUDIT__';
const OTHER = 'trippin.workspace.v2.user.22222222-2222-4222-8222-222222222222';
const CANARIES = [
  { key: 'trippin.workspace.v1', raw: 'Authored RC-N02 legacy canary; not a valid workspace.' },
  { key: OTHER, raw: 'Authored RC-N02 other-space canary; no account is admitted.' },
  { key: OTHER + '.recovery.rc-n02-canary', raw: JSON.stringify({ kind: 'authored-scope-canary', raw: 'RC-N02-OTHER-ARCHIVE' }) },
];
const MAX_RAW = 120_000, MAX_RESULT = 500_000, CASE_MS = 150_000;
const failure = 'This confirmation link could not be used. Open your latest confirmation email before logging in.';
const cancellation = 'Recovery canceled. Check this space before trying again, and keep your downloaded original archive and backup.';
const started = Date.now(), deadlineAt = started + 5 * 60_000;
const hash = value => createHash('sha256').update(value).digest('hex');
const results = { source: process.env.GITHUB_SHA, origin, tier: 2, passed: false, status: 'running', browserClosed: false,
  boundary: 'Actual loopback UI; guest Auth stub; declared private corrupt-storage/canary fixture and transparent write audit in RC-N02 only',
  sources: {}, cases: [] };
for (const file of ['components/travel-app.tsx', 'components/workspace.tsx', 'components/new-trip-form.tsx', 'components/dialog.tsx',
  'lib/account-workspace.ts', 'lib/community-management-storage.ts', 'lib/community-management.ts', 'lib/trip.ts', 'lib/types.ts', 'lib/data.ts']) {
  results.sources[file] = hash(await fs.readFile(new URL('../../../' + file, import.meta.url)));
}
await fs.mkdir(output, { recursive: true });
assert.equal((await fs.lstat(output)).isSymbolicLink(), false, 'Do not overwrite a linked artifact directory.');
const priorDriverOutputs = (await fs.readdir(output)).filter(name => name === 'native-result.json' || /^RC-N0[12](?:-|\.)/.test(name));
assert.deepEqual(priorDriverOutputs, [], 'Preserve prior driver outputs; use a fresh invocation directory.');
function bounded(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' deadline exceeded')), ms); })])
    .finally(() => clearTimeout(timer));
}
function note(list, value) { if (list.length < 20) list.push(String(value).slice(0, 1000)); }

// The sole browser instrumentation: observe this guest workspace/archive writes.
// Native calls, return values and thrown errors remain authoritative. Audit
// overflow/inspection failure is recorded and fails the case, never swallowed.
function installRecoveryAudit({ key, auditName }) {
  const audit = { events: [], overflow: false, inspectionErrors: [], chars: 0 };
  Object.defineProperty(window, auditName, { value: audit, writable: false, configurable: false });
  const setItem = Storage.prototype.setItem, getItem = Storage.prototype.getItem;
  Storage.prototype.setItem = function (item, value) {
    const tracked = this === window.localStorage && (item === key || typeof item === 'string' && item.startsWith(key + '.recovery.'));
    let beforeArchives = [];
    if (tracked && item === key) {
      try {
        if (this.length > 32) audit.overflow = true;
        else for (let index = 0; index < this.length; index++) {
          const candidate = this.key(index);
          if (candidate?.startsWith(key + '.recovery.')) beforeArchives.push({ key: candidate, raw: Reflect.apply(getItem, this, [candidate]) });
        }
      } catch { audit.inspectionErrors.push('Could not observe archives before target write.'); }
    }
    const returned = Reflect.apply(setItem, this, [item, value]);
    if (tracked) {
      try {
        const event = { key: item, raw: String(value), readback: Reflect.apply(getItem, this, [item]), beforeArchives };
        const size = JSON.stringify(event).length;
        if (audit.events.length >= 12 || audit.chars + size > 160_000) audit.overflow = true;
        else { audit.events.push(event); audit.chars += size; }
      } catch { audit.inspectionErrors.push('Could not observe a completed storage write.'); }
    }
    return returned;
  };
}
async function storage(page, record, label) {
  assert.ok(record.observations.length < 10);
  const entries = await page.evaluate(() => {
    if (localStorage.length > 32) throw new Error('Storage observation key bound.');
    const values = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index); values.push({ key, raw: localStorage.getItem(key) });
    }
    return values.sort((a, b) => a.key.localeCompare(b.key));
  });
  assert.ok(Buffer.byteLength(JSON.stringify(entries)) <= MAX_RAW);
  record.observations.push({ label, entries, sha256: hash(JSON.stringify(entries)) }); return entries;
}
async function audit(page) {
  const value = await page.evaluate(name => window[name], AUDIT);
  assert.ok(value); assert.equal(value.overflow, false); assert.deepEqual(value.inspectionErrors, []); return value.events;
}
async function savedWhen(page, predicate) {
  await expect.poll(async () => {
    const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
    if (typeof raw !== 'string' || raw.length > MAX_RAW) return false;
    try { return Boolean(predicate(JSON.parse(raw))); } catch { return false; }
  }).toBe(true);
}
async function settleDisplayedImages(page, record, label) {
  assert.ok((record.imageReadiness ||= []).length < 8);
  record.phase = label;
  const images = page.locator('img'), observed = [];
  for (let index = 0; index < await images.count(); index++) {
    const image = images.nth(index);
    if (!await image.isVisible()) continue;
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0 && node.naturalHeight > 0)).toBe(true);
    observed.push(await image.evaluate(node => ({ path: new URL(node.currentSrc).pathname, width: node.naturalWidth, height: node.naturalHeight })));
  }
  const hero = page.locator('.destination-hero');
  let background = null;
  if (await hero.count()) {
    const value = await hero.evaluate(node => getComputedStyle(node).backgroundImage);
    const match = /^url\(["']?(.+?)["']?\)$/.exec(value); assert.ok(match, 'Observe the actual destination background.');
    const url = new URL(match[1], origin); assert.equal(url.origin, origin);
    await expect.poll(() => page.evaluate(url => performance.getEntriesByName(url, 'resource')
      .some(entry => entry.responseEnd > 0 && entry.decodedBodySize > 0), url.href)).toBe(true);
    background = url.pathname;
  }
  record.imageReadiness.push({ label, images: observed, background });
}
async function homeReady(page) {
  await expect(page.getByRole('status').filter({ hasText: 'Opening your travel space' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restore your own backup', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore your own backup', exact: true })).toBeEnabled();
}
async function navigate(page, url = origin + '/') {
  const response = await page.goto(url, { waitUntil: 'load' }); assert.equal(response?.status(), 200); await homeReady(page);
}
async function createTrip(page) {
  await page.getByRole('button', { name: 'New trip', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your next little escape', exact: true }); await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Where to\?/).selectOption('munich');
  await dialog.getByLabel(/^Give it a name/).fill('Authored recovery chapter');
  await dialog.getByLabel(/^First day/).fill('2026-12-01'); await dialog.getByLabel(/^Last day/).fill('2026-12-01');
  await dialog.getByLabel(/^Whole-trip budget/).fill('500');
  await dialog.getByRole('button', { name: /Let’s go/ }).click(); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Choose your trip', exact: true })).toBeVisible();
  await page.locator('.itinerary-title').getByRole('button', { name: 'Add a stop', exact: true }).click();
  const stop = page.getByRole('dialog', { name: 'A good little detour.', exact: true }); await expect(stop).toBeVisible();
  await stop.getByLabel(/^What’s the plan\?/).fill('Authored recoverable museum');
  await stop.getByLabel(/^Kind of moment/).selectOption('culture'); await stop.getByLabel(/^Start time/).fill('10:00');
  await stop.getByLabel(/^Place or neighborhood/).fill('Authored Munich place'); await stop.getByLabel(/^Cost estimate/).fill('7');
  await stop.getByRole('button', { name: 'Add to my day', exact: true }).click(); await expect(stop).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Authored recoverable museum', exact: true })).toBeVisible();
  await savedWhen(page, value => value.trips?.length === 1 && value.trips[0].title === 'Authored recovery chapter'
    && value.trips[0].days[0].activities.some(item => item.title === 'Authored recoverable museum' && item.cost === 7));
}
async function download(page, record, button, label, filename) {
  assert.ok(record.downloads.length < 6);
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
  assert.equal(file.suggestedFilename(), filename); assert.equal(await file.failure(), null);
  const saved = path.join(output, record.id + '-' + label + '.json'); await file.saveAs(saved);
  const stat = await fs.lstat(saved); assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_RAW);
  const bytes = await fs.readFile(saved), raw = bytes.toString('utf8'), value = JSON.parse(raw);
  record.downloads.push({ label, name: path.basename(saved), bytes: bytes.length, sha256: hash(bytes) }); return { saved, raw, value };
}
async function chooseBackup(page, file) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Restore your own backup', exact: true }).click()]);
  await chooser.setFiles(file);
  const dialog = page.getByRole('dialog', { name: 'Recover your saved travel space', exact: true }); await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/This backup contains 1 saved trip\./)).toBeVisible(); return dialog;
}
function assertCanaries(entries) {
  for (const canary of CANARIES) assert.deepEqual(entries.find(entry => entry.key === canary.key), canary);
}
async function screenshot(page, record, suffix = '') {
  const bytes = await page.screenshot({ fullPage: false, animations: 'disabled' }); assert.ok(bytes.length <= 2_000_000);
  const name = record.id + suffix + '.png'; await fs.writeFile(path.join(output, name), bytes);
  record.screenshots.push({ name, bytes: bytes.length, sha256: hash(bytes) });
}

const cases = [
  { id: 'RC-N01', async execute(page, record) {
    const clean = origin + '/?from=confirmation-native';
    await navigate(page, clean + '#error=access_denied&error_code=otp_expired&error_description=AUTHORED-PRIVATE-DESCRIPTION&access_token=AUTHORED-NOT-A-REAL-TOKEN');
    await expect(page.locator('.home-error[role="alert"]')).toHaveText(failure); assert.equal(page.url(), clean);
    assert.equal(await page.evaluate(() => location.hash), '');
    assert.doesNotMatch(await page.locator('body').innerText(), /AUTHORED-PRIVATE-DESCRIPTION|AUTHORED-NOT-A-REAL-TOKEN|otp_expired|access_denied/);
    await expect(page.locator('.account-label')).toHaveCount(0); await expect(page.locator('.home-trip-grid button')).toHaveCount(0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), null);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Welcome back', exact: true }); await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveText(failure); await expect(dialog.getByLabel(/^Email/)).toBeFocused();
    await expect(dialog.getByLabel(/^Email/)).toHaveValue(''); await expect(dialog.getByLabel(/^Password/)).toHaveValue('');
    assert.equal(page.url(), clean);
    record.confirmation = { fragmentScrubbed: true, searchPreserved: true, sanitizedFeedback: failure, admittedAccount: false, credentialSubmission: false };
  } },
  { id: 'RC-N02', instrument: true, async execute(page, record) {
    await navigate(page); await createTrip(page);
    const baseline = await storage(page, record, 'own-ui-baseline'), baselineRaw = baseline.find(entry => entry.key === KEY)?.raw;
    assert.equal(typeof baselineRaw, 'string'); const expected = JSON.parse(baselineRaw);
    assert.equal(expected.version, 1); assert.equal(expected.trips.length, 1); assert.equal(expected.selectedTripId, expected.trips[0].id);
    assert.equal(expected.trips[0].bookings.length, 0); assert.equal(expected.trips[0].expenses.length, 0);
    await settleDisplayedImages(page, record, 'initial-itinerary-before-profile');
    await page.getByRole('navigation', { name: 'Your space', exact: true }).getByRole('button', { name: 'Your profile', exact: true }).click();
    const backup = await download(page, record, page.locator('.profile-page').getByRole('button', { name: 'Export backup', exact: true }), 'valid-ui-backup', 'trippin-backup.json');
    assert.deepEqual(backup.value, expected); assert.equal(backup.raw, baselineRaw);
    await page.getByRole('button', { name: 'Your trips', exact: true }).click(); await homeReady(page);
    await expect(page.locator('.home-trip-grid button')).toHaveCount(1);
    await settleDisplayedImages(page, record, 'saved-card-before-corruption-reload');
    assert.equal(backup.raw.endsWith('}'), true);
    const corruptRaw = backup.raw.slice(0, -1) + String.fromCharCode(0xd800);
    // EXPLICIT T2 FAULT: corrupt only this case's own guest workspace, plus
    // three named opaque scope canaries. No admitted user or valid trip is seeded.
    await page.evaluate(({ key, raw, canaries }) => {
      localStorage.setItem(key, raw); for (const entry of canaries) localStorage.setItem(entry.key, entry.raw);
    }, { key: KEY, raw: corruptRaw, canaries: CANARIES });
    await page.reload({ waitUntil: 'load' }); await homeReady(page);
    await expect(page.getByRole('button', { name: 'Download saved data for recovery', exact: true })).toBeVisible();
    await expect(page.locator('.home-error[role="alert"]')).toContainText('Saved trips could not be opened.');
    await expect(page.getByRole('button', { name: 'New trip', exact: true })).toBeDisabled();
    const broken = await storage(page, record, 'declared-corrupt-space'); assertCanaries(broken);
    assert.equal(broken.find(entry => entry.key === KEY)?.raw, corruptRaw); assert.deepEqual(await audit(page), []);
    const original = await download(page, record, page.getByRole('button', { name: 'Download saved data for recovery', exact: true }), 'original-before-selection', 'trippin-storage-recovery.json');
    assert.deepEqual(original.value, { version: 1, kind: 'trippin.storage-recovery', sourceKey: KEY, raw: corruptRaw });
    assert.equal(original.value.raw.charCodeAt(original.value.raw.length - 1), 0xd800);
    let dialog = await chooseBackup(page, backup.saved);
    assert.deepEqual(await storage(page, record, 'staged-no-write'), broken); assert.deepEqual(await audit(page), []);
    const selected = await download(page, record, dialog.getByRole('button', { name: 'Download selected original archive', exact: true }), 'selected-original', 'trippin-storage-recovery.json');
    assert.deepEqual(selected.value, original.value);
    await dialog.getByRole('button', { name: 'Cancel recovery', exact: true }).click(); await expect(dialog).toHaveCount(0);
    await expect(page.locator('.home-error[role="alert"]')).toHaveText(cancellation);
    assert.deepEqual(await storage(page, record, 'canceled-no-write'), broken); assert.deepEqual(await audit(page), []);
    dialog = await chooseBackup(page, backup.saved); assert.deepEqual(await audit(page), []);
    assert.equal(await page.evaluate(() => typeof navigator.locks?.request === 'function'), true, 'Recovery uses actual browser Web Locks, without a lock mock.');
    record.nativeWebLocksAvailable = true;
    await dialog.getByRole('button', { name: 'Archive original and restore backup', exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(page.getByRole('combobox', { name: 'Choose your trip', exact: true })).toBeVisible();
    await savedWhen(page, value => JSON.stringify(value) === baselineRaw);
    await expect(page.getByRole('heading', { name: 'Authored recoverable museum', exact: true })).toBeVisible();
    const restored = await storage(page, record, 'verified-restored'); assertCanaries(restored);
    const archives = restored.filter(entry => entry.key.startsWith(KEY + '.recovery.')); assert.equal(archives.length, 1);
    const archive = archives[0], envelope = JSON.parse(archive.raw);
    assert.match(archive.key, /^trippin\.workspace\.v2\.guest\.recovery\.[a-zA-Z\d_-]{1,80}$/);
    assert.deepEqual(envelope, { version: 1, kind: 'trippin-workspace-recovery', recoveryId: archive.key.slice((KEY + '.recovery.').length), sourceKey: KEY, targetKey: KEY, raw: corruptRaw });
    assert.equal(restored.find(entry => entry.key === KEY)?.raw, baselineRaw);
    assert.deepEqual(restored.filter(entry => entry.key !== KEY && entry.key !== archive.key), broken.filter(entry => entry.key !== KEY));
    const writes = await audit(page), archiveWrites = writes.filter(entry => entry.key === archive.key), targetWrites = writes.filter(entry => entry.key === KEY);
    assert.equal(archiveWrites.length, 1); assert.ok(targetWrites.length >= 1 && targetWrites.length <= 6);
    assert.equal(writes[0].key, archive.key); assert.equal(writes[0].raw, archive.raw); assert.equal(writes[0].readback, archive.raw);
    for (const entry of targetWrites) {
      assert.equal(entry.raw, baselineRaw); assert.equal(entry.readback, baselineRaw); assert.deepEqual(entry.beforeArchives, [archive]);
    }
    assert.equal(writes.length, archiveWrites.length + targetWrites.length);
    record.writeOrder = writes; record.syntheticFault = { kind: 'authored-invalid-JSON-and-lone-UTF16-surrogate', targetKey: KEY,
      derivedFrom: path.basename(backup.saved), finalCodeUnit: 0xd800, canaryKeys: CANARIES.map(entry => entry.key), nativeQuota: false };
    await settleDisplayedImages(page, record, 'restored-itinerary-before-reload');
    await page.reload({ waitUntil: 'load' }); await homeReady(page);
    const afterReload = await storage(page, record, 'restored-reload'); assert.deepEqual(afterReload, restored);
    const card = page.locator('.home-trip-grid button').filter({ has: page.getByText('Authored recovery chapter', { exact: true }) });
    await expect(card).toHaveCount(1); await expect(card).toBeVisible();
    const collection = await download(page, record, page.getByRole('button', { name: 'Download original recovery archives', exact: true }), 'current-space-archives', 'trippin-storage-recovery.json');
    assert.deepEqual(collection.value, { version: 1, kind: 'trippin.storage-recovery-collection', archives: [archive] });
    assert.equal(JSON.parse(collection.value.archives[0].raw).raw, corruptRaw);
    await settleDisplayedImages(page, record, 'restored-card-before-reopen');
    await card.click(); await expect(page.getByRole('heading', { name: 'Authored recoverable museum', exact: true })).toBeVisible();
    await settleDisplayedImages(page, record, 'reopened-itinerary-before-profile');
    await page.getByRole('navigation', { name: 'Your space', exact: true }).getByRole('button', { name: 'Your profile', exact: true }).click();
    const finalBackup = await download(page, record, page.locator('.profile-page').getByRole('button', { name: 'Export backup', exact: true }), 'restored-ui-backup', 'trippin-backup.json');
    assert.deepEqual(finalBackup.value, expected); assert.equal(finalBackup.raw, baselineRaw);
    assert.deepEqual(await storage(page, record, 'final-scope-preserved'), restored);
  } },
];

let browser;
try {
  browser = await bounded(chromium.launch({ headless: true }), 30_000, 'browser launch'); results.browserVersion = browser.version();
  for (const candidate of cases) {
    const record = { id: candidate.id, passed: false, contextClosed: false, blocked: {}, guestAuthReplies: 0, startedAt: Date.now(), phase: 'case-start',
      unexpectedNetwork: [], pageErrors: [], routeErrors: [], observations: [], downloads: [], screenshots: [] };
    results.cases.push(record);
    const jobs = new Set(), refused = new WeakSet(), admitted = new Set(); let context, page;
    const track = promise => { jobs.add(promise); promise.then(() => jobs.delete(promise), error => { jobs.delete(promise); note(record.routeErrors, error); }); return promise; };
    try {
      assert.ok(Date.now() < deadlineAt, 'Packet work deadline.');
      context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
      context.setDefaultTimeout(10_000); context.setDefaultNavigationTimeout(15_000);
      if (candidate.instrument) await context.addInitScript(installRecoveryAudit, { key: KEY, auditName: AUDIT });
      await context.routeWebSocket('**/*', socket => { note(record.unexpectedNetwork, 'Unexpected WebSocket'); return socket.close(); });
      context.on('requestfinished', request => admitted.delete(request));
      context.on('requestfailed', request => {
        admitted.delete(request);
        if (!refused.has(request)) note(record.unexpectedNetwork, JSON.stringify({ kind: 'admitted-request-failed', path: new URL(request.url()).pathname,
          method: request.method(), resourceType: request.resourceType(), navigation: request.isNavigationRequest(),
          errorText: request.failure()?.errorText || null, phase: record.phase, elapsedMs: Date.now() - record.startedAt }));
      });
      await context.route('**/*', route => track((async () => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        const block = async label => { refused.add(request); record.blocked[label] = (record.blocked[label] || 0) + 1; await route.abort('blockedbyclient'); };
        if (url.origin === origin && url.pathname === '/api/auth' && method === 'POST') {
          let body; try { body = request.postDataJSON(); } catch { /* An unreadable action remains unexpected. */ }
          if (body && Object.keys(body).length === 1 && body.action === 'session') {
            record.guestAuthReplies++; await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ available: false, user: null }) }); return;
          }
        }
        if (method !== 'GET') { note(record.unexpectedNetwork, 'Unexpected mutation ' + method + ' ' + url.origin + url.pathname); await block('unexpected-mutation'); return; }
        const localStatic = url.origin === origin && (url.pathname === '/' || /^\/(?:_next\/static|images)\//.test(url.pathname) || ['/icon.svg', '/favicon.ico'].includes(url.pathname));
        if (localStatic) { admitted.add(request); await route.continue(); return; }
        const knownApi = url.origin === origin && ['/api/community', '/api/providers', '/api/bank', '/api/assistant-config'].includes(url.pathname);
        const weather = url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast';
        const tiles = url.origin === 'https://tile.openstreetmap.org' && /^\/\d+\/\d+\/\d+\.png$/.test(url.pathname);
        const fonts = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(url.origin);
        if (knownApi || weather || tiles || fonts) { await block(knownApi ? url.pathname : weather ? 'weather' : tiles ? 'map-tiles' : 'fonts'); return; }
        note(record.unexpectedNetwork, 'Unexpected read ' + url.origin + url.pathname); await block('unexpected-read');
      })()));
      page = await context.newPage(); page.on('pageerror', error => note(record.pageErrors, error.message)); page.on('crash', () => note(record.pageErrors, 'Page crash'));
      context.on('page', extra => { if (extra !== page) note(record.unexpectedNetwork, 'Unexpected additional page'); });
      await bounded(candidate.execute(page, record), Math.min(CASE_MS, deadlineAt - Date.now()), candidate.id);
      await expect.poll(() => admitted.size).toBe(0); await bounded(Promise.allSettled([...jobs]), 5000, 'route drain'); assert.equal(jobs.size, 0);
      assert.ok(record.guestAuthReplies > 0); assert.deepEqual(record.unexpectedNetwork, []); assert.deepEqual(record.pageErrors, []); assert.deepEqual(record.routeErrors, []);
      assert.deepEqual(await context.cookies(), []); assert.equal(context.pages().length, 1);
      await screenshot(page, record); record.passed = true;
    } catch (error) {
      record.error = String(error).slice(0, 2000);
      if (page) {
        record.dom = (await page.locator('body').innerText().catch(() => '')).slice(0, 12_000);
        await screenshot(page, record, '-failed').catch(error => { record.screenshotError = String(error).slice(0, 1000); });
      }
    } finally {
      if (context) {
        try { await bounded(context.close(), 15_000, candidate.id + ' context close'); record.contextClosed = true; }
        catch (error) { record.passed = false; record.closeError = String(error).slice(0, 1000); }
      }
      try { await bounded(Promise.allSettled([...jobs]), 5000, 'final route drain'); }
      catch (error) { record.passed = false; record.routeDrainError = String(error).slice(0, 1000); }
      if (record.routeErrors.length || record.pageErrors.length || record.unexpectedNetwork.length) record.passed = false;
    }
  }
} catch (error) { results.error = String(error).slice(0, 2000); }
finally {
  if (browser) {
    try { await bounded(browser.close(), 20_000, 'browser close'); results.browserClosed = !browser.isConnected(); }
    catch (error) { results.closeError = String(error).slice(0, 1000); }
  }
  results.elapsedMs = Date.now() - started;
  results.passed = results.browserClosed && results.cases.length === 2 && results.cases.every(record => record.passed && record.contextClosed);
  results.status = results.passed ? 'passed' : 'failed';
  const serialized = JSON.stringify(results, null, 2); assert.ok(Buffer.byteLength(serialized) <= MAX_RESULT, 'Result bound exceeded.');
  await fs.writeFile(path.join(output, 'native-result.json'), serialized, { flag: 'wx' });
  console.log('TRIPPIN_RECOVERY_RESULT ' + JSON.stringify({ passed: results.passed, browserClosed: results.browserClosed, cases: results.cases.map(({ id, passed, contextClosed }) => ({ id, passed, contextClosed })) }));
}
assert.equal(results.passed, true, 'Both fresh cases and normal browser/context closure must pass together.');
