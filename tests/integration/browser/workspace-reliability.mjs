// INACTIVE preparation. New owner approval and a reviewed built source are required.
// T2 Chromium UI with authored private trips, guest Auth reply and one synthetic
// workspace-write fault. No live Auth, provider, model, bank or server mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

assert.equal(process.env.TRIPPIN_RELIABILITY_APPROVED, '1', 'Inactive: obtain new owner approval before running this packet.');
const target = new URL(process.env.TRIPPIN_RELIABILITY_ORIGIN);
assert.ok(['http:', 'https:'].includes(target.protocol));
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Only the owned loopback application is allowed.');
assert.equal(target.username + target.password + target.search + target.hash, '');
assert.equal(target.pathname, '/');
const origin = target.origin;
const output = process.env.TRIPPIN_RELIABILITY_OUTPUT;
assert.ok(output && path.isAbsolute(output), 'Provide an owned absolute artifact directory.');
assert.match(process.env.GITHUB_SHA || '', /^[a-f\d]{40}$/i, 'Bind the reviewed source commit.');
assert.ok(process.env.TRIPPIN_PLAYWRIGHT_PACKAGE, 'Use the separately provisioned pinned browser tool.');
const { chromium, expect } = createRequire(process.env.TRIPPIN_PLAYWRIGHT_PACKAGE)('@playwright/test');
const KEY = 'trippin.workspace.v2.guest';
const FAULT = '__TRIPPIN_RELIABILITY_TEST_ONLY_WRITE_FAILURE__';
const MAX_RAW = 120_000, MAX_RESULT = 750_000, CASE_MS = 180_000;
const started = Date.now(), deadlineAt = started + 12 * 60_000;
const results = { source: process.env.GITHUB_SHA, origin, tier: 2, status: 'running', passed: false,
  boundary: 'Actual loopback UI; authored private data; browser-stubbed guest Auth; synthetic workspace write refusal in R-N04 only',
  browserClosed: false, cases: [], sources: {} };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const file of ['components/workspace.tsx', 'components/travel-app.tsx', 'components/new-trip-form.tsx',
  'components/trip-map.tsx', 'app/globals.css', 'lib/trip.ts']) {
  results.sources[file] = hash(await fs.readFile(new URL('../../../' + file, import.meta.url)));
}
await fs.mkdir(output, { recursive: true });
function bounded(promise, milliseconds, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' deadline exceeded')), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
function note(list, message) {
  if (list.length < 20) list.push(String(message).slice(0, 1_000));
}
async function snapshot(page, record, label) {
  assert.ok(record.observations.length < 12);
  const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
  assert.equal(typeof raw, 'string'); assert.ok(raw.length <= MAX_RAW);
  const value = JSON.parse(raw);
  assert.equal(value.trips.length, 1); assert.equal(value.selectedTripId, value.trips[0].id);
  record.observations.push({ label, raw, sha256: hash(raw) });
  return { raw, value, trip: value.trips[0] };
}
async function savedWhen(page, predicate) {
  await expect.poll(async () => {
    const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
    if (typeof raw !== 'string' || raw.length > MAX_RAW) return false;
    try { return Boolean(predicate(JSON.parse(raw))); } catch { return false; }
  }).toBe(true);
}
async function home(page) {
  const response = await page.goto(origin + '/', { waitUntil: 'load' });
  assert.equal(response?.status(), 200);
  await expect(page.getByRole('status').filter({ hasText: 'Opening your travel space' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New trip', exact: true })).toBeEnabled();
}
async function createTrip(page, title, end = '2026-12-01') {
  await page.getByRole('button', { name: 'New trip', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your next little escape', exact: true }); await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Where to\?/).selectOption('munich');
  await dialog.getByLabel(/^Give it a name/).fill(title);
  await dialog.getByLabel(/^First day/).fill('2026-12-01');
  await dialog.getByLabel(/^Last day/).fill(end);
  await dialog.getByLabel(/^Whole-trip budget/).fill('500');
  await dialog.getByRole('button', { name: /Let’s go/ }).click();
  await expect(page.getByRole('combobox', { name: 'Choose your trip', exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await savedWhen(page, value => value.trips?.length === 1 && value.trips[0].title === title && value.trips[0].endDate === end);
}
const card = (page, title) => page.locator('.activity-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
async function addStop(page, title, cost = 0, index = 0, durable = true) {
  await page.locator('.itinerary-title').getByRole('button', { name: 'Add a stop', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A good little detour.', exact: true });
  await fillStop(dialog, title, cost, index);
  await dialog.getByRole('button', { name: 'Add to my day', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(card(page, title)).toBeVisible();
  if (durable) await savedWhen(page, value => value.trips[0].days[0].activities.some(item => item.title === title));
}
async function fillStop(dialog, title, cost, index) {
  await dialog.getByLabel(/^What’s the plan\?/).fill(title);
  await dialog.getByLabel(/^Kind of moment/).selectOption('culture');
  if ((await dialog.getByLabel(/^Start time/).getAttribute('readonly')) === null) {
    // Every field is filled through its actual control; no itinerary is injected.
    await dialog.getByLabel(/^Start time/).fill(`${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`);
  }
  await dialog.getByLabel(/^Little details/).fill('Authored private planning check. No real booking or event.');
  await dialog.getByLabel(/^Place or neighborhood/).fill('Authored Munich place ' + index);
  await dialog.getByLabel(/^Time to enjoy it/).fill('30');
  await dialog.getByLabel(/^Cost estimate/).fill(String(cost));
  await dialog.getByText('Map pin & booking link', { exact: true }).click();
  await dialog.getByLabel(/^Latitude/).fill(String(48.13 + index / 1000));
  await dialog.getByLabel(/^Longitude/).fill(String(11.57 + index / 1000));
}
async function projected(page, total, spent) {
  await page.getByRole('button', { name: 'Budget for Munich', exact: true }).click();
  const escaped = total.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(page.locator('.budget-banner h2')).toHaveText(new RegExp(`^${escaped}\\s*of €500$`));
  await expect(page.getByText(`${spent} recorded · estimates adjust when you link a booking.`, { exact: true })).toBeVisible();
}
async function screenshot(page, record, suffix = '') {
  const bytes = await page.screenshot({ fullPage: false, animations: 'disabled' });
  assert.ok(bytes.byteLength <= 2_000_000, 'Keep screenshots bounded.');
  const name = record.id + suffix + '.png'; await fs.writeFile(path.join(output, name), bytes);
  record.screenshots.push({ name, bytes: bytes.byteLength, sha256: hash(bytes) });
}
async function reloadTrip(page) {
  await home(page);
  await page.getByRole('button', { name: 'Open your trips', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Choose your trip', exact: true })).toBeVisible();
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
}

const cases = [
  { id: 'R-N01', async execute(page, record) {
    await home(page); await createTrip(page, 'Authored alternative reliability');
    await addStop(page, 'Authored original admission', 12);
    const before = await snapshot(page, record, 'original-stop');
    const original = before.trip.days[0].activities[0];
    await page.getByRole('button', { name: 'Reservations', exact: true }).click();
    await page.getByRole('button', { name: 'Save reservation', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Keep the details close.', exact: true });
    await dialog.getByLabel(/^Reservation type/).selectOption('event');
    await dialog.getByLabel(/^Status/).selectOption('reserved');
    await dialog.getByLabel(/^Title/).fill('Authored local admission reservation');
    await dialog.getByLabel(/^Date/).fill('2026-12-01');
    await dialog.getByLabel(/^Total cost/).fill('20');
    await dialog.getByLabel(/^Booking reference/).fill('AUTHORED-LOCAL-ONLY');
    await dialog.getByLabel(/^Replaces an itinerary cost\?/).selectOption(original.id);
    await dialog.getByRole('button', { name: 'Save reservation', exact: true }).click();
    await savedWhen(page, value => value.trips[0].bookings.length === 1
      && value.trips[0].bookings[0].activityId === original.id && value.trips[0].bookings[0].cost === 20);
    await projected(page, '€20', '€0');
    await page.getByRole('button', { name: 'Log expense', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'A little expense.', exact: true });
    await dialog.getByLabel(/^What was it\?/).fill('Authored local payment');
    await dialog.getByLabel(/^Amount/).fill('18');
    await dialog.getByLabel(/^Date/).fill('2026-12-01');
    await dialog.getByLabel(/^Category/).selectOption('culture');
    await dialog.getByLabel(/^Replaces a planned cost\?/).selectOption({ label: 'Reservation · Authored local admission reservation' });
    await dialog.getByRole('button', { name: 'Log expense', exact: true }).click();
    await savedWhen(page, value => value.trips[0].expenses.length === 1 && value.trips[0].expenses[0].amount === 18
      && value.trips[0].expenses[0].bookingId === value.trips[0].bookings[0].id);
    await projected(page, '€18', '€18');
    const paid = await snapshot(page, record, 'linked-actual');
    await card(page, original.title).getByRole('button', { name: 'Swap', exact: true }).click();
    await page.getByRole('dialog', { name: 'A different kind of good.', exact: true })
      .getByRole('button', { name: 'Make your own alternative', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'A new alternative.', exact: true });
    await expect(dialog.getByLabel(/^What’s the plan\?/)).toBeFocused();
    await expect(dialog.getByLabel(/^Start time/)).toHaveValue(original.time);
    assert.equal(await dialog.getByLabel(/^Start time/).getAttribute('readonly') !== null, true);
    await fillStop(dialog, 'Authored replacement admission', 9, 1);
    await dialog.getByRole('button', { name: 'Use this alternative', exact: true }).click();
    await expect(card(page, original.title)).toHaveCount(0);
    await expect(card(page, 'Authored replacement admission')).toBeVisible();
    await savedWhen(page, value => {
      const stops = value.trips[0].days[0].activities, active = stops.find(item => item.title === 'Authored replacement admission');
      return stops.length === 2 && active?.status === 'planned' && !active.alternativeFor
        && stops.some(item => item.id === original.id && item.status === 'skipped' && item.alternativeFor === active.id);
    });
    await projected(page, '€27', '€18');
    const changed = await snapshot(page, record, 'replacement');
    const active = changed.trip.days[0].activities.find(item => !item.alternativeFor);
    const retained = changed.trip.days[0].activities.find(item => item.id === original.id);
    assert.equal(changed.trip.days[0].activities.length, 2); assert.notEqual(active.id, original.id);
    assert.equal(active.status, 'planned'); assert.equal(active.time, original.time); assert.equal(active.source, 'custom');
    assert.deepEqual(retained, { ...original, status: 'skipped', alternativeFor: active.id });
    assert.deepEqual(changed.trip.bookings, paid.trip.bookings); assert.deepEqual(changed.trip.expenses, paid.trip.expenses);
    await reloadTrip(page); assert.equal((await snapshot(page, record, 'replacement-reload')).raw, changed.raw);
    await projected(page, '€27', '€18');
    await card(page, active.title).getByRole('button', { name: 'Swap', exact: true }).click();
    await page.getByRole('dialog', { name: 'A different kind of good.', exact: true })
      .getByRole('button', { name: new RegExp('^Authored original admission') }).click();
    await expect(card(page, original.title)).toBeVisible(); await projected(page, '€18', '€18');
    await savedWhen(page, value => value.trips[0].days[0].activities.some(item => item.id === original.id
      && item.status === 'planned' && !item.alternativeFor));
    const restored = await snapshot(page, record, 'original-restored');
    assert.deepEqual(restored.trip.bookings, paid.trip.bookings); assert.deepEqual(restored.trip.expenses, paid.trip.expenses);
    const returned = restored.trip.days[0].activities.find(item => item.id === original.id);
    assert.equal(returned.status, 'planned'); assert.equal(returned.alternativeFor, undefined);
    assert.equal(restored.trip.days[0].activities.find(item => item.id === active.id).alternativeFor, original.id);
    await reloadTrip(page); assert.equal((await snapshot(page, record, 'restore-reload')).raw, restored.raw);
    await projected(page, '€18', '€18');
  } },
  { id: 'R-N02', async execute(page, record) {
    await home(page); await createTrip(page, 'Authored thirty-one day keyboard trip', '2026-12-31');
    const baseline = await snapshot(page, record, 'thirty-one-days');
    assert.equal(baseline.trip.days.length, 31);
    const tabs = page.getByRole('tablist', { name: 'Trip days', exact: true }).getByRole('tab');
    await expect(tabs).toHaveCount(31);
    const state = async index => {
      await expect(tabs.nth(index)).toBeFocused();
      await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true');
      assert.equal(await tabs.evaluateAll(nodes => nodes.filter(node => node.tabIndex === 0).length), 1);
      assert.equal(await tabs.evaluateAll(nodes => nodes.filter(node => node.getAttribute('aria-selected') === 'true').length), 1);
      await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', await tabs.nth(index).getAttribute('id'));
    };
    await tabs.first().focus(); await state(0);
    for (let index = 1; index <= 31; index++) { await page.keyboard.press('ArrowRight'); await state(index % 31); }
    await page.keyboard.press('ArrowLeft'); await state(30);
    await page.keyboard.press('Home'); await state(0); await page.keyboard.press('End'); await state(30);
    await page.keyboard.press('Control+Home'); await state(30);
    await page.keyboard.press('ArrowUp'); await state(30); await page.keyboard.press('ArrowDown'); await state(30);
    await page.keyboard.press('Tab'); await expect(page.getByRole('tabpanel')).toBeFocused();
    assert.equal((await snapshot(page, record, 'keyboard-finished')).raw, baseline.raw);
    await reloadTrip(page); assert.equal((await snapshot(page, record, 'keyboard-reload')).raw, baseline.raw);
  } },
  { id: 'R-N03', narrow: true, async execute(page, record) {
    const title = 'Authored returning trip with a long name that should wrap across this narrow travel card';
    await home(page); await createTrip(page, title);
    for (let index = 0; index < 10; index++) await addStop(page, `Authored narrow stop ${index + 1}`, 0, index);
    const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
    if (await dismiss.count()) {
      await dismiss.click(); await expect(dismiss).toHaveCount(0);
      record.transientNotificationDismissed = true;
    }
    const baseline = await snapshot(page, record, 'long-itinerary');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 }); await noOverflow(page);
      const toggle = page.getByRole('button', { name: 'Show map', exact: true });
      await page.locator('.day-bottom').scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => scrollY > innerHeight), 'Exercise switching after a long scrolled itinerary.');
      await toggle.focus(); await page.keyboard.press('Enter');
      const back = page.getByRole('button', { name: 'Show itinerary', exact: true });
      await expect(back).toBeFocused(); await expect(back).toHaveAttribute('aria-expanded', 'true');
      const column = page.locator('#trip-map-panel'); await expect(column).toBeVisible();
      await expect(column.locator('.leaflet-container')).toBeVisible();
      await expect(column.locator('.map-label')).toContainText('10 stops');
      await expect(column.locator('.place-marker')).toHaveCount(10);
      await expect(column.getByRole('status').filter({ hasText: 'Map tiles are unavailable.' })).toBeVisible();
      const layout = await column.evaluate(node => {
        const bounds = node.getBoundingClientRect(), map = node.querySelector('.map-panel').getBoundingClientRect();
        return { position: getComputedStyle(node).position, top: bounds.top, left: bounds.left, right: bounds.right,
          width: innerWidth, mapTop: map.top, mapHeight: map.height, viewportHeight: innerHeight };
      });
      assert.equal(layout.position, 'static'); assert.ok(layout.top >= -1 && layout.top < layout.viewportHeight);
      assert.ok(layout.left >= -1 && layout.right <= layout.width + 1);
      assert.ok(layout.mapHeight >= 300 && layout.mapHeight <= 600);
      const links = column.locator('.day-map-links a'); await expect(links).toHaveCount(3);
      const urls = await links.evaluateAll(nodes => nodes.map(node => node.href));
      const points = [];
      for (const [index, href] of urls.entries()) {
        const url = new URL(href); assert.equal(url.origin, 'https://www.google.com'); assert.ok(href.length <= 2048);
        assert.equal(url.searchParams.get('api'), '1'); assert.equal(url.searchParams.get('travelmode'), 'walking');
        const waypoints = url.searchParams.get('waypoints')?.split('|') || []; assert.ok(waypoints.length <= 3);
        const segment = [url.searchParams.get('origin'), ...waypoints, url.searchParams.get('destination')].filter(Boolean);
        points.push(...(index ? segment.slice(1) : segment));
      }
      assert.deepEqual(points, baseline.trip.days[0].activities.map(item => `${item.lat},${item.lng}`));
      for (const link of await links.all()) {
        await link.scrollIntoViewIfNeeded(); await expect(link).toBeVisible();
        let probe;
        for (let attempt = 0; attempt < 3; attempt++) {
          probe = await link.evaluate(node => {
            const bounds = node.getBoundingClientRect(), hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
              hitTag: hit?.tagName || null, hitClass: String(hit?.className || '').slice(0, 160),
              unobscured: Boolean(hit && node.contains(hit)) };
          });
          if (probe.unobscured) break;
          await page.mouse.wheel(0, 120);
        }
        assert.ok(probe.x >= -1 && probe.x + probe.width <= width + 1);
        assert.ok(probe.y >= -1 && probe.y + probe.height <= 844 + 1);
        (record.routeHitTests ||= []).push(probe);
        assert.equal(probe.unobscured, true, 'The route center must be unobscured after dismissing the transient notification.');
      }
      await noOverflow(page); await screenshot(page, record, '-' + width);
      await back.focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Show map', exact: true })).toBeFocused();
      await expect(column).toBeHidden(); await expect(page.locator('.itinerary-panel')).toBeVisible();
      await page.getByRole('button', { name: 'Your trips', exact: true }).click();
      await expect(page.locator('.travel-intro-returning')).toBeVisible(); await expect(page.locator('.home-photo')).toHaveCount(0);
      const savedCard = page.locator('.home-trip-grid button').filter({ hasText: title });
      await expect(savedCard).toBeVisible(); await expect(savedCard.locator('strong')).toHaveText(title);
      await expect(savedCard.locator('time')).toHaveCount(2); await noOverflow(page);
      await savedCard.click();
      await expect(page.getByRole('combobox', { name: 'Choose your trip', exact: true })).toBeVisible();
      assert.equal((await snapshot(page, record, 'returning-' + width)).raw, baseline.raw);
    }
  } },
  { id: 'R-N04', fault: true, async execute(page, record) {
    await home(page); await createTrip(page, 'Authored save refusal and recovery');
    const baseline = await snapshot(page, record, 'durable-before-fault');
    const fault = enabled => page.evaluate(({ name, enabled }) => { window[name] = enabled; }, { name: FAULT, enabled });
    await fault(true); await addStop(page, 'Authored unsaved admission', 9, 0, false);
    const warning = page.getByRole('region', { name: 'Your latest changes aren’t saved', exact: true });
    await expect(warning).toBeVisible();
    assert.equal((await snapshot(page, record, 'refused-durable-write')).raw, baseline.raw);
    // The transient toast expires after five seconds; this warning must persist.
    await page.waitForTimeout(5_500); await expect(warning).toBeVisible();
    await warning.getByRole('button', { name: 'Retry save', exact: true }).click();
    await expect(warning).toBeVisible();
    assert.equal((await snapshot(page, record, 'retry-still-refused')).raw, baseline.raw);
    const downloadPromise = page.waitForEvent('download');
    await warning.getByRole('button', { name: 'Download backup', exact: true }).click();
    const download = await downloadPromise, downloadPath = await download.path();
    assert.ok(downloadPath); assert.equal(await download.failure(), null);
    const bytes = await fs.readFile(downloadPath); assert.ok(bytes.byteLength <= MAX_RAW);
    const backup = JSON.parse(bytes.toString('utf8'));
    assert.equal(backup.trips[0].days[0].activities[0].title, 'Authored unsaved admission');
    assert.equal(baseline.trip.days[0].activities.length, 0);
    await fs.writeFile(path.join(output, 'R-N04-authored-unsaved-backup.json'), bytes);
    record.backup = { bytes: bytes.byteLength, sha256: hash(bytes), source: 'actual browser download of volatile UI state' };
    const url = page.url(), dialogPromise = page.waitForEvent('dialog');
    const originalDocument = await page.evaluate(() => performance.timeOrigin);
    let mainFrameNavigations = 0;
    const onNavigation = frame => { if (frame === page.mainFrame()) mainFrameNavigations++; };
    page.on('framenavigated', onNavigation);
    record.cancellationIntent = { url, active: true, expiresAt: Date.now() + 10_000 };
    try {
      const reload = page.reload({ waitUntil: 'load', timeout: 3_000 }).then(response => ({ response }), error => ({ error: String(error) }));
      const beforeUnload = await bounded(dialogPromise, 10_000, 'beforeunload dialog');
      assert.equal(beforeUnload.type(), 'beforeunload'); await beforeUnload.dismiss();
      const cancelled = await bounded(reload, 5_000, 'dismissed reload completion');
      record.reloadOutcome = { error: cancelled.error || null,
        response: cancelled.response ? { status: cancelled.response.status(), url: cancelled.response.url() } : null,
        mainFrameNavigations, originalDocument, retainedDocument: await page.evaluate(() => performance.timeOrigin) };
      // The native contract is dismissed departure with the same live document,
      // volatile edit and durable bytes; the driver's Promise need not reject.
      assert.equal(mainFrameNavigations, 0);
      assert.equal(record.reloadOutcome.retainedDocument, originalDocument);
      assert.equal(page.url(), url); await expect(warning).toBeVisible();
      await expect(card(page, 'Authored unsaved admission')).toBeVisible();
      assert.equal((await snapshot(page, record, 'dismissed-departure')).raw, baseline.raw);
      record.beforeUnloadDismissed = true;
    } finally { record.cancellationIntent.active = false; page.off('framenavigated', onNavigation); }
    await page.getByRole('button', { name: 'Your trips', exact: true }).click();
    await expect(warning.getByRole('button', { name: 'Leave without saving', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Choose your trip', exact: true })).toBeVisible();
    await fault(false); await warning.getByRole('button', { name: 'Retry save', exact: true }).click();
    await expect(warning).toHaveCount(0);
    await savedWhen(page, value => JSON.stringify(value) === JSON.stringify(backup));
    const saved = await snapshot(page, record, 'retry-confirmed'); assert.deepEqual(saved.value, backup);
    await page.getByRole('button', { name: 'Your trips', exact: true }).click();
    await expect(page.locator('.home-trip-grid button')).toHaveCount(1);
    await page.locator('.home-trip-grid button').click();
    await fault(true); await addStop(page, 'Authored deliberately discarded change', 4, 1, false);
    await expect(warning).toBeVisible(); await page.getByRole('button', { name: 'Your trips', exact: true }).click();
    await warning.getByRole('button', { name: 'Leave without saving', exact: true }).click();
    await expect(page.locator('.home-trip-grid button')).toHaveCount(1);
    assert.equal((await snapshot(page, record, 'explicit-departure')).raw, saved.raw);
    await fault(false); await page.locator('.home-trip-grid button').click();
    await expect(card(page, 'Authored unsaved admission')).toBeVisible();
    await expect(card(page, 'Authored deliberately discarded change')).toHaveCount(0);
    await expect(warning).toHaveCount(0);
  } },
];

let browser;
try {
  browser = await bounded(chromium.launch({ headless: true }), 30_000, 'browser launch');
  results.browserVersion = browser.version();
  for (const candidate of cases) {
    const record = { id: candidate.id, passed: false, contextClosed: false, blocked: {}, guestAuthReplies: 0, expectedNavigationCancellations: 0,
      unexpectedNetwork: [], pageErrors: [], routeErrors: [], observations: [], screenshots: [],
      syntheticFault: candidate.fault ? 'Authored workspace-only Storage.setItem refusal; not a native quota condition' : null };
    results.cases.push(record);
    let context, page;
    const jobs = new Set(), refused = new WeakSet(), admitted = new Set();
    const track = promise => {
      jobs.add(promise); promise.then(() => jobs.delete(promise), error => { jobs.delete(promise); note(record.routeErrors, error); });
      return promise;
    };
    try {
      assert.ok(Date.now() < deadlineAt, 'Packet work deadline.');
      context = await browser.newContext({ viewport: { width: candidate.narrow ? 320 : 1440, height: candidate.narrow ? 844 : 1000 },
        isMobile: Boolean(candidate.narrow), hasTouch: Boolean(candidate.narrow), ignoreHTTPSErrors: true,
        acceptDownloads: true, serviceWorkers: 'block' });
      context.setDefaultTimeout(10_000); context.setDefaultNavigationTimeout(15_000);
      if (candidate.fault) await context.addInitScript(({ key, name }) => {
        Object.defineProperty(window, name, { value: false, writable: true, configurable: false });
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (item, value) {
          if (this === window.localStorage && item === key && window[name] === true) {
            throw new DOMException('Authored workspace reliability write refusal', 'QuotaExceededError');
          }
          return Reflect.apply(original, this, [item, value]);
        };
      }, { key: KEY, name: FAULT });
      await context.routeWebSocket('**/*', socket => {
        note(record.unexpectedNetwork, 'Unexpected WebSocket'); return socket.close();
      });
      context.on('requestfinished', request => admitted.delete(request));
      context.on('requestfailed', request => {
        admitted.delete(request);
        const intent = record.cancellationIntent;
        if (candidate.fault && intent?.active && Date.now() <= intent.expiresAt && request.isNavigationRequest()
          && request.frame() === page?.mainFrame() && request.url() === intent.url && request.method() === 'GET'
          && request.failure()?.errorText === 'net::ERR_ABORTED') {
          record.expectedNavigationCancellations++; return;
        }
        if (!refused.has(request)) note(record.unexpectedNetwork, 'Admitted request failed: ' + new URL(request.url()).pathname);
      });
      await context.route('**/*', route => track((async () => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        const block = async label => { refused.add(request); record.blocked[label] = (record.blocked[label] || 0) + 1; await route.abort('blockedbyclient'); };
        if (url.origin === origin && url.pathname === '/api/auth' && method === 'POST') {
          let body; try { body = request.postDataJSON(); } catch { /* An unreadable action is unexpected. */ }
          if (body && Object.keys(body).length === 1 && body.action === 'session') {
            record.guestAuthReplies++; await route.fulfill({ status: 200, contentType: 'application/json',
              headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ available: false, user: null }) }); return;
          }
        }
        if (method !== 'GET') { note(record.unexpectedNetwork, 'Unexpected mutation ' + method + ' ' + url.origin + url.pathname); await block('unexpected-mutation'); return; }
        const localStatic = url.origin === origin && (url.pathname === '/' || /^\/(?:_next\/static|images)\//.test(url.pathname)
          || ['/icon.svg', '/favicon.ico'].includes(url.pathname));
        if (localStatic) { admitted.add(request); await route.continue(); return; }
        const knownApi = url.origin === origin && ['/api/community', '/api/providers', '/api/bank', '/api/assistant-config'].includes(url.pathname);
        const weather = url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast';
        const tiles = url.origin === 'https://tile.openstreetmap.org' && /^\/\d+\/\d+\/\d+\.png$/.test(url.pathname);
        const fonts = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(url.origin);
        if (knownApi || weather || tiles || fonts) { await block(knownApi ? url.pathname : weather ? 'weather' : tiles ? 'map-tiles' : 'fonts'); return; }
        note(record.unexpectedNetwork, 'Unexpected read ' + url.origin + url.pathname); await block('unexpected-read');
      })()));
      page = await context.newPage();
      page.on('pageerror', error => note(record.pageErrors, error.message));
      page.on('crash', () => note(record.pageErrors, 'Page crash'));
      await bounded(candidate.execute(page, record), Math.min(CASE_MS, deadlineAt - Date.now()), candidate.id);
      await expect.poll(() => admitted.size).toBe(0);
      await bounded(Promise.allSettled([...jobs]), 5_000, candidate.id + ' route drain'); assert.equal(jobs.size, 0);
      assert.ok(record.guestAuthReplies > 0); assert.deepEqual(record.unexpectedNetwork, []);
      assert.deepEqual(record.pageErrors, []); assert.deepEqual(record.routeErrors, []);
      assert.equal((await context.cookies()).filter(cookie => cookie.name.startsWith('trippin_')).length, 0);
      await screenshot(page, record); record.passed = true;
    } catch (error) {
      record.error = String(error).slice(0, 2_000);
      if (page) {
        record.dom = (await page.locator('body').innerText().catch(() => '')).slice(0, 12_000);
        await screenshot(page, record, '-failed').catch(failure => { record.screenshotError = String(failure).slice(0, 1_000); });
      }
    } finally {
      if (context) {
        try { await bounded(context.close(), 15_000, candidate.id + ' context close'); record.contextClosed = true; }
        catch (error) { record.passed = false; record.closeError = String(error).slice(0, 1_000); }
      }
      try { await bounded(Promise.allSettled([...jobs]), 5_000, candidate.id + ' final route drain'); }
      catch (error) { record.passed = false; record.routeDrainError = String(error).slice(0, 1_000); }
      if (record.routeErrors.length || record.pageErrors.length || record.unexpectedNetwork.length) record.passed = false;
    }
  }
} catch (error) { results.error = String(error).slice(0, 2_000); }
finally {
  if (browser) {
    try { await bounded(browser.close(), 20_000, 'browser close'); results.browserClosed = !browser.isConnected(); }
    catch (error) { results.closeError = String(error).slice(0, 1_000); }
  }
  results.elapsedMs = Date.now() - started;
  results.passed = results.browserClosed && results.cases.length === 4 && results.cases.every(item => item.passed && item.contextClosed);
  results.status = results.passed ? 'passed' : 'failed';
  const serialized = JSON.stringify(results, null, 2); assert.ok(Buffer.byteLength(serialized) <= MAX_RESULT, 'Result bound exceeded.');
  await fs.writeFile(path.join(output, 'native-result.json'), serialized);
  console.log('TRIPPIN_RELIABILITY_RESULT ' + JSON.stringify({ passed: results.passed, browserClosed: results.browserClosed,
    cases: results.cases.map(({ id, passed, contextClosed }) => ({ id, passed, contextClosed })) }));
}
assert.equal(results.passed, true, 'All four fresh cases and owned browser/context closure must pass together.');
