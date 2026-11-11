import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';

const origin = 'https://trippin-theta.vercel.app';
const storageKey = 'trippin.workspace.v1';
const runtime = 'c4103cade48221d264aeaedbcde7ac0c879f072e';
const deployment = 'dpl_8aMRSmgz8FGEvfdSVdfZCU3eyM7W';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const coffee = 'Coffee, then whatever';
const lunch = 'Lunch at the market';
const eventTitle = 'Design, drinks & new faces';

function policy(request) {
  const url = new URL(request.url());
  if (!['GET', 'HEAD'].includes(request.method())) return 'unexpected';
  if (url.origin === origin && url.pathname.startsWith('/api/')) return 'api';
  if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return 'weather';
  if (url.origin === 'https://tile.openstreetmap.org' && /^\/\d+\/\d+\/\d+\.png$/.test(url.pathname)) return 'tiles';
  if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2'
    || url.origin === 'https://fonts.gstatic.com' && url.pathname.startsWith('/s/')) return 'fonts';
  if (url.origin !== origin || url.username || url.password) return 'unexpected';
  const staticPath = /^\/_next\/static\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:js|css|woff2?|ttf|otf)$/.test(url.pathname);
  const publicPath = /^\/images\/(?:munich|lisbon|copenhagen|barcelona)\.jpg$/.test(url.pathname)
    || ['/images/world.svg', '/icon.svg', '/favicon.ico'].includes(url.pathname);
  const keys = [...url.searchParams.keys()];
  const staticQuery = keys.length === 0 || keys.length === 1 && keys[0] === 'dpl' && url.searchParams.get('dpl') === deployment;
  return url.pathname === '/' && !url.search || staticPath && staticQuery || publicPath && !url.search ? 'allowed' : 'unexpected';
}

async function stored(page) {
  const raw = await page.evaluate(key => localStorage.getItem(key), storageKey);
  expect(typeof raw).toBe('string');
  expect(Buffer.byteLength(raw)).toBeLessThan(2_000_000);
  return raw;
}

function mark(expected, activityId, status) {
  const trip = expected.trips.find(item => item.id === 'trip-munich');
  const activity = trip.days.flatMap(day => day.activities).find(item => item.id === activityId);
  expect(activity).toBeDefined();
  activity.status = status;
}

for (const profile of [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false },
  { name: 'narrow', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
]) {
  test(profile.name + ' profile badges and story PNG follow saved completion', async ({ browser }, info) => {
    expect(process.env.SOURCE_COMMIT).toMatch(/^[a-f0-9]{40}$/);
    const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile,
      hasTouch: profile.hasTouch, acceptDownloads: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    const failures = [], jobs = new Set(), pending = new Set();
    const blocked = { api: 0, weather: 0, tiles: 0, fonts: 0 };
    const observations = { runtime, deployment, browserVersion: browser.version(), profile: profile.name,
      stages: [], roots: [], downloads: [], closed: false };
    let expectedDownload = false;
    const track = promise => {
      jobs.add(promise);
      promise.then(() => jobs.delete(promise), () => { jobs.delete(promise); failures.push('route failure'); });
      return promise;
    };
    context.on('request', request => pending.add(request));
    context.on('requestfinished', request => pending.delete(request));
    context.on('requestfailed', request => {
      pending.delete(request);
      if (policy(request) === 'allowed') failures.push('admitted request failed');
    });
    context.on('response', response => {
      if (policy(response.request()) === 'allowed' && response.status() >= 400) failures.push('admitted HTTP error');
    });
    page.on('pageerror', error => failures.push(error.message.slice(0, 300)));
    page.on('crash', () => failures.push('page crash'));
    page.on('download', download => {
      if (!expectedDownload) { failures.push('unexpected download'); track(download.cancel()); }
    });
    await context.routeWebSocket('**/*', route => {
      failures.push('unexpected WebSocket');
      track(Promise.resolve(route.close()));
    });
    await context.route('**/*', route => {
      const kind = policy(route.request());
      if (kind === 'allowed') return track(route.continue());
      if (kind === 'unexpected') failures.push('unexpected network request');
      else blocked[kind]++;
      return track(route.abort('blockedbyclient'));
    });

    async function navigate(reload = false) {
      const response = await (reload ? page.reload({ waitUntil: 'load' }) : page.goto(origin, { waitUntil: 'load' }));
      expect(response.status()).toBe(200);
      expect(response.url()).toBe(origin + '/');
      const body = await response.body();
      const ids = [...new Set(body.toString().match(/\bdpl_[A-Za-z0-9]+\b/g) ?? [])];
      expect(ids).toEqual([deployment]);
      observations.roots.push({ bytes: body.length, sha256: sha(body), deployment: ids[0] });
      await expect(page.getByRole('combobox', { name: 'Choose your trip', exact: true })).toHaveValue('trip-munich');
      await expect(page.getByRole('heading', { name: 'Your itinerary', exact: true })).toBeVisible();
    }
    async function saved(stage, expected) {
      await expect.poll(() => stored(page)).toBe(JSON.stringify(expected));
      observations.stages.push({ stage, sha256: sha(await stored(page)) });
    }
    async function profileView(days, places, moments) {
      await page.getByRole('button', { name: 'Your profile', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'A little about you.', exact: true })).toBeVisible();
      await expect(page.locator('.recap-stats strong')).toHaveText([String(days), String(places), String(moments)]);
      await expect(page.locator('.recap-content')).toContainText('ALEX MORGAN · GERMANY');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    async function itinerary(day) {
      await page.getByRole('button', { name: /^My trips(?:\s*03)?$/ }).filter({ visible: true }).click();
      await page.getByRole('tab', { name: new RegExp('^Day ' + day + '\\b') }).click();
    }
    async function toggle(title, done) {
      const card = page.locator('article.activity-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      await expect(card).toHaveCount(1);
      await card.getByRole('button', { name: done ? 'Mark as done' : 'Been there', exact: true }).click();
    }
    function badge(title) {
      return page.locator('.badges > div').filter({ has: page.getByText(title, { exact: true }) });
    }
    async function download(stage) {
      expectedDownload = true;
      try {
        const waiting = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download story', exact: true }).click();
        const item = await waiting;
        expect(item.suggestedFilename()).toBe('trippin-munich.png');
        const target = info.outputPath(stage + '.png');
        await item.saveAs(target);
        expect(await item.failure()).toBeNull();
        const bytes = await fs.readFile(target);
        expect(bytes.length).toBeGreaterThan(10_000);
        expect(bytes.length).toBeLessThan(4_000_000);
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect(bytes.toString('ascii', 12, 16)).toBe('IHDR');
        expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, 1350]);
        observations.downloads.push({ stage, bytes: bytes.length, sha256: sha(bytes), width: 1080, height: 1350 });
        await info.attach(stage, { path: target, contentType: 'image/png' });
        await expect(page.getByRole('button', { name: 'Download story', exact: true })).toBeEnabled();
        await expect(page.locator('.recap-section [role="alert"]')).toHaveCount(0);
      } finally { expectedDownload = false; }
    }

    try {
      expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
      await navigate();
      await expect.poll(() => page.evaluate(key => localStorage.getItem(key), storageKey)).not.toBeNull();
      const original = await stored(page), baseline = JSON.parse(original), expected = structuredClone(baseline);
      expect(baseline.profile.name).toBe('Alex Morgan');
      expect(baseline.trips.map(trip => trip.id).sort()).toEqual(['trip-copenhagen', 'trip-lisbon', 'trip-munich']);
      expect(baseline.trips.every(trip => !trip.isPublic)).toBe(true);
      expect(baseline.trips.flatMap(trip => trip.days.flatMap(day => day.activities)).every(activity => activity.status !== 'done')).toBe(true);
      await saved('baseline', expected);
      await profileView(4, 0, 0);
      await expect(badge('The first step')).toHaveClass('locked');
      await expect(badge('Your first event')).toHaveClass('locked');
      await download('before-completion');
      await saved('baseline-export-preserved', expected);

      await itinerary(1);
      await toggle(coffee, true); mark(expected, 'm1-coffee', 'done');
      await toggle(lunch, true); mark(expected, 'm1-market', 'done');
      await saved('two-moments-one-place', expected);
      await profileView(4, 1, 2);
      await expect(badge('The first step')).not.toHaveClass('locked');
      await expect(badge('Germany')).not.toHaveClass('locked');
      await expect(badge('Your first event')).toHaveClass('locked');
      await itinerary(2);
      await toggle(eventTitle, true); mark(expected, 'm2-meet', 'done');
      await saved('event-completed', expected);
      await navigate(true);
      await saved('completion-reloaded', expected);
      await profileView(4, 2, 3);
      await expect(badge('Your first event')).not.toHaveClass('locked');
      await expect(badge('New faces')).not.toHaveClass('locked');
      await expect(badge('Sample · ' + eventTitle)).toContainText('Fictional sample event marked complete');
      await download('after-completion');
      expect(observations.downloads[0].sha256).not.toBe(observations.downloads[1].sha256);
      await saved('completed-export-preserved', expected);
      await info.attach('profile', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

      await itinerary(2);
      await toggle(eventTitle, false); mark(expected, 'm2-meet', 'planned');
      await saved('event-undone', expected);
      await profileView(4, 1, 2);
      await expect(badge('Your first event')).toHaveClass('locked');
      await expect(badge('Sample · ' + eventTitle)).toHaveCount(0);
      await itinerary(1);
      await toggle(coffee, false); mark(expected, 'm1-coffee', 'planned');
      await toggle(lunch, false); mark(expected, 'm1-market', 'planned');
      await saved('restored', baseline);
      expect(await stored(page)).toBe(original);
      await navigate(true);
      await saved('restored-reloaded', baseline);
      await profileView(4, 0, 0);
      await expect(badge('The first step')).toHaveClass('locked');
      await expect(badge('Germany')).toHaveCount(0);
      await expect.poll(() => pending.size + jobs.size).toBe(0);
      expect(failures).toEqual([]);
    } finally {
      observations.blocked = blocked;
      observations.failures = failures;
      await context.close();
      await Promise.allSettled([...jobs]);
      observations.closed = true;
      observations.pending = pending.size;
      observations.routeJobs = jobs.size;
      await info.attach('journey', { body: Buffer.from(JSON.stringify(observations)), contentType: 'application/json' });
    }
    expect(observations.pending).toBe(0);
    expect(observations.routeJobs).toBe(0);
    expect(failures).toEqual([]);
  });
}
