import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { createRequire } from 'node:module';
const { chromium, expect } = createRequire(process.env.TRIPPIN_PLAYWRIGHT_PACKAGE)('@playwright/test');
const lib = new URL('../../../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib) && /^\.\/[\w-]+$/.test(specifier)) return next(new URL(specifier + '.ts', context.parentURL).href, context);
  return next(specifier, context);
} });
const { initialWorkspace, createTrip, serializeWorkspace } = await import('../../../lib/trip.ts');
const origin = 'https://localhost:3443', key = 'trippin.workspace.v2.guest';
const output = process.env.TRIPPIN_NATIVE_OUTPUT;
const results = { source: process.env.GITHUB_SHA, boundary: 'T2 built Next app; authored provider; emulated Chromium', cases: [], browserClosed: false };
const browser = await chromium.launch({ headless: true });
results.browserVersion = browser.version();
function fixture() {
  const workspace = initialWorkspace('Authored traveler');
  const a = createTrip('lisbon', '2026-12-04', '2026-12-05', 'Authored route'); a.id = 'authored-route';
  a.days[0].activities = Array.from({ length: 6 }, (_, i) => ({ id: 'authored-stop-' + i, title: 'Authored stop ' + i,
    category: 'culture', description: 'Fictional route test', time: '10:00', duration: 30, cost: 0,
    lat: 38 + i / 100, lng: -9 - i / 100, location: 'Authored place', status: 'planned', source: 'custom' }));
  const b = createTrip('munich', '2026-12-04', '2026-12-05', 'Other authored trip'); b.id = 'authored-other';
  a.budget = 500; b.budget = 700;
  workspace.trips = [a, b]; workspace.selectedTripId = a.id;
  return workspace;
}
async function home(page, url = origin) {
  const response = await page.goto(url, { waitUntil: 'load' }); assert.equal(response.status(), 200);
  await expect(page.getByRole('heading', { name: /Less planning/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Opening your travel space' })).toHaveCount(0);
}
async function create(page, title, method = 'click') {
  const button = page.getByRole('button', { name: 'New trip', exact: true });
  if (method === 'keyboard') { await button.focus(); await page.keyboard.press('Enter'); } else if (method === 'touch') await button.tap(); else await button.click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Give it a name/).fill(title);
  await dialog.getByLabel(/^First day/).fill('2026-12-04'); await dialog.getByLabel(/^Last day/).fill('2026-12-05');
  const save = dialog.getByRole('button', { name: /Let’s go/ });
  if (method === 'keyboard') { await save.focus(); await page.keyboard.press('Enter'); } else if (method === 'touch') await save.tap(); else await save.click();
  await expect(page.getByRole('combobox', { name: 'Choose your trip' })).toBeVisible();
}
async function saved(page, selected = key) {
  const raw = await page.evaluate(key => localStorage.getItem(key), selected);
  assert.equal(typeof raw, 'string'); return JSON.parse(raw);
}
async function restore(page, workspace, name = 'authored-backup.json') {
  const file = path.join(output, name); await fs.writeFile(file, serializeWorkspace(workspace));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore your own backup', exact: true }).click();
  await (await chooser).setFiles(file);
  await expect(page.getByRole('combobox', { name: 'Choose your trip' })).toBeVisible();
}
async function login(page, email) {
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Email/).fill(email); await dialog.getByLabel(/^Password/).fill('authored-password-123');
  await dialog.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
}
const cases = [
  ['C01', async page => {
    await home(page); assert.equal(await page.locator('.home-trip-grid').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('trippin.workspace.v1')), null);
    await create(page, 'My first authored escape');
    const before = await saved(page); assert.equal(before.trips.length, 1); assert.equal(before.trips[0].title, 'My first authored escape');
    assert.equal(before.trips[0].days.flatMap(day => day.activities).length, 0);
    await home(page); await page.getByRole('button', { name: /Open your trips/ }).click();
    assert.deepEqual(await saved(page), before);
  }],
  ['C02', async page => {
    await home(page); await restore(page, fixture());
    const links = await page.locator('.day-map-links a').evaluateAll(nodes => nodes.map(n => n.href));
    assert.equal(links.length, 2);
    const first = new URL(links[0]), second = new URL(links[1]);
    assert.equal(first.searchParams.get('origin'), '38,-9'); assert.equal(first.searchParams.get('destination'), '38.04,-9.04');
    assert.equal(first.searchParams.get('waypoints'), '38.01,-9.01|38.02,-9.02|38.03,-9.03');
    assert.equal(second.searchParams.get('origin'), '38.04,-9.04'); assert.equal(second.searchParams.get('destination'), '38.05,-9.05');
    await page.getByRole('button', { name: 'Budget for Lisbon', exact: true }).click();
    await page.getByLabel(/^Food \/ day/).fill('33'); await page.getByLabel(/^Transport \/ day/).fill('7');
    await page.getByLabel(/^Trip budget/).fill('555'); await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await saved(page)).trips[0].budget).toBe(555);
    await page.getByRole('combobox', { name: 'Choose your trip' }).selectOption('authored-other');
    const value = await saved(page); assert.equal(value.trips[0].dailyFoodBudget, 33); assert.equal(value.trips[1].budget, 700);
    assert.equal(value.trips[1].dailyFoodBudget, undefined);
  }],
  ['C03', async page => {
    await home(page); await create(page, 'Narrow touch escape', 'touch');
    assert.equal(await page.locator('.sidebar').count(), 0); assert.equal(await page.getByRole('button', { name: /Discover/ }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Your trips', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 }); await create(page, 'Keyboard escape', 'keyboard');
    assert.equal((await saved(page)).trips.length, 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }],
  ['C04', async (page, context) => {
    await home(page); await create(page, 'Guest only'); await page.getByRole('button', { name: 'Your trips', exact: true }).click();
    await page.getByRole('button', { name: /^Sign up/ }).click(); const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Your name/).fill('Alice'); await dialog.getByLabel(/^Email/).fill('alice@example.test');
    await dialog.getByLabel(/^Password/).fill('authored-password-123'); await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /confirm your account/ })).toBeVisible();
    assert.equal((await context.cookies()).filter(c => c.name.startsWith('trippin_')).length, 0);
    await login(page, 'alice@example.test'); await create(page, 'Alice only');
    const cookies = (await context.cookies()).filter(c => c.name.startsWith('trippin_')); assert.equal(cookies.length, 2);
    for (const cookie of cookies) { assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, 'Lax'); }
    assert.equal(await page.evaluate(() => document.cookie.includes('trippin_at') || document.cookie.includes('trippin_rt')), false);
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    assert.equal((await saved(page)).trips[0].title, 'Guest only');
    await login(page, 'bob@example.test'); assert.equal(await page.locator('.home-trip-grid').count(), 0);
    await create(page, 'Bob only'); await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await login(page, 'alice@example.test'); await page.getByRole('button', { name: /Open your trips/ }).click();
    const a = await saved(page, 'trippin.workspace.v2.user.11111111-1111-4111-8111-111111111111');
    assert.deepEqual(a.trips.map(t => t.title), ['Alice only']);
    const b = await saved(page, 'trippin.workspace.v2.user.22222222-2222-4222-8222-222222222222');
    assert.deepEqual(b.trips.map(t => t.title), ['Bob only']);
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    assert.ok(!/authored-access-only|authored-refresh-only|authored-password-123/.test(storage));
    await page.getByRole('button', { name: 'Your profile', exact: true }).first().click();
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click();
    const file = await download; const bytes = await fs.readFile(await file.path());
    assert.ok(!/authored-access-only|authored-refresh-only|authored-password-123/.test(bytes.toString()));
  }],
  ['C05', async page => {
    await home(page); await restore(page, fixture()); const baseline = await saved(page);
    await home(page); await page.getByRole('button', { name: /Open your trips/ }).click(); assert.deepEqual(await saved(page), baseline);
    await page.getByRole('button', { name: 'Your trips', exact: true }).click();
    // Timing boundary only: the actual File bytes, picker, parser and UI remain real.
    await page.evaluate(() => {
      const original = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = async function () {
        const bytes = await original.call(this);
        if (this.name === 'delayed-authored.json') { window.__readStarted = true; await new Promise(resolve => { window.__releaseRead = resolve; }); }
        return bytes;
      };
    });
    const file = path.join(output, 'delayed-authored.json'); await fs.writeFile(file, serializeWorkspace(initialWorkspace('Old delayed file')));
    const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Restore your own backup', exact: true }).click(); await (await chooser).setFiles(file);
    await expect.poll(() => page.evaluate(() => window.__readStarted === true)).toBe(true);
    await create(page, 'Newer intent'); await page.evaluate(() => window.__releaseRead());
    await expect(page.getByRole('combobox', { name: 'Choose your trip' })).toBeVisible();
    await expect.poll(async () => (await saved(page)).trips.length).toBe(3);
    assert.ok((await saved(page)).trips.some(t => t.title === 'Newer intent'));
  }],
  ['C06', async page => {
    await home(page, origin + '/#plan=invalid!'); const invalid = page.url();
    await page.getByRole('button', { name: /Open shared itinerary/ }).click();
    await expect(page.locator('.home-notice[role="alert"]')).toContainText('cannot be added'); assert.equal(page.url(), invalid);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
    const trip = fixture().trips[0], hash = Buffer.from(JSON.stringify(trip)).toString('base64');
    await page.goto(origin + '/#plan=' + hash);
    // A fragment-only navigation has no HTTP Response. Reload the actual link
    // explicitly before checking its fresh empty-space entry.
    const response = await page.reload({ waitUntil: 'load' }); assert.equal(response.status(), 200);
    await expect(page.getByRole('heading', { name: /Less planning/ })).toBeVisible();
    await page.getByRole('button', { name: /Open shared itinerary/ }).click();
    await expect(page.getByRole('combobox', { name: 'Choose your trip' })).toBeVisible();
    await expect.poll(async () => (await saved(page)).trips.length).toBe(1);
    await expect.poll(() => page.url()).toBe(origin + '/');
    assert.equal((await saved(page)).trips[0].title, trip.title);
  }],
];
try {
  for (const [id, execute] of cases) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', acceptDownloads: true,
      viewport: { width: id === 'C03' ? 320 : 1280, height: 900 }, hasTouch: id === 'C03', isMobile: id === 'C03' });
    const record = { id, passed: false, contextClosed: false, blocked: {}, failures: [] }; results.cases.push(record);
    const jobs = new Set();
    const track = promise => { jobs.add(promise); promise.then(() => jobs.delete(promise), () => { jobs.delete(promise); record.failures.push('route failure'); }); return promise; };
    await context.routeWebSocket('**/*', route => { record.failures.push('Unexpected WebSocket'); return route.close(); });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      const allowed = url.origin === origin && (request.method() === 'GET' && (url.pathname === '/' || /^\/(?:_next\/static|images)\//.test(url.pathname) || ['/icon.svg', '/favicon.ico'].includes(url.pathname)) || url.pathname === '/api/auth' && request.method() === 'POST');
      if (allowed) return track(route.continue());
      const known = url.origin === origin && url.pathname.startsWith('/api/') || ['https://api.open-meteo.com', 'https://tile.openstreetmap.org', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(url.origin);
      const label = known ? url.origin + url.pathname.split('/').slice(0, 3).join('/') : 'unexpected';
      record.blocked[label] = (record.blocked[label] || 0) + 1;
      if (!known) record.failures.push('Unexpected network ' + url.origin + url.pathname);
      return track(route.abort('blockedbyclient'));
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => record.failures.push(error.message)); page.on('crash', () => record.failures.push('Page crash'));
    try {
      await execute(page, context); assert.deepEqual(record.failures, []); record.passed = true;
      await page.screenshot({ path: path.join(output, id + '.png'), fullPage: false });
    } catch (error) {
      record.error = String(error); record.dom = (await page.locator('body').innerText().catch(() => '')).slice(0, 15000);
      await page.screenshot({ path: path.join(output, id + '-failed.png') }).catch(() => {}); throw error;
    } finally {
      await context.close(); await Promise.allSettled([...jobs]); record.contextClosed = true;
    }
  }
} finally {
  await browser.close(); results.browserClosed = !browser.isConnected();
  await fs.writeFile(path.join(output, 'native-result.json'), JSON.stringify(results, null, 2));
  console.log('TRIPPIN_NATIVE_RESULT ' + JSON.stringify(results));
}
assert.equal(results.cases.length, 6); assert.ok(results.cases.every(c => c.passed && c.contextClosed));
