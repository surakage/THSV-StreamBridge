import { readFile, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

// ?sbCanvas=1920x1080&sbAt=X,Y lets a small browser source show one part of a full-screen overlay. These tests
// draw each overlay on a full 1920x1080 page, then on a page the size of the part the streamer crops it to, and
// check the two pictures match pixel for pixel.

declare global {
  interface Window { __thsvPublishAddOnEvent?: (payload: unknown) => void }
}

interface Area { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface Case {
  readonly name: string;
  readonly path: string;
  readonly area: Area;
  /** Custom CSS the streaming app adds after the page loads. */
  readonly css?: string;
  readonly show: (page: Page) => Promise<void>;
  readonly ready: string;
}

async function installTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'SharedWorker', { configurable: true, value: undefined });
    class TestWebSocket extends EventTarget {
      static readonly OPEN = 1;
      readonly readyState = TestWebSocket.OPEN;
      constructor() {
        super();
        window.__thsvPublishAddOnEvent = (payload: unknown) => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload) }));
        queueMicrotask(() => this.dispatchEvent(new Event('open')));
      }
      send(): void { /* Nothing is sent back in these tests. */ }
      close(): void { this.dispatchEvent(new Event('close')); }
    }
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: TestWebSocket });
  });
}

async function publish(page: Page, moduleId: string, topic: string, payload: Record<string, unknown>): Promise<void> {
  await page.evaluate(({ moduleId: id, topic: name, payload: body }) => window.__thsvPublishAddOnEvent?.({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId: id, topic: name, payload: body }), { moduleId, topic, payload });
}

const NOW = new Date('2026-11-04T12:00:00Z').getTime();
const TIMER_STYLE = { fontFamily: 'broadcast', backgroundMode: 'glass', backgroundColor: '#101722', backgroundOpacity: 0.9, accentColor: '#f4c95d', textColor: '#ffffff', mutedColor: '#d9e2ef', warningColor: '#f4c95d', criticalColor: '#ff6b7d', liveColor: '#f4c95d', borderColor: '#f4c95d', showProgressBar: true };

const CASES: readonly Case[] = [
  {
    name: 'Ad Break Companion (centered card)', path: '/overlay/addons/thsv.ad-break-companion', area: { x: 739, y: 458, width: 442, height: 164 }, ready: '#timer-shell',
    show: async (page) => await publish(page, 'thsv.ad-break-companion', 'thsv.ad-break-companion.timer.update', {
      variant: 'ad-break', phase: 'scheduled', label: 'AD BREAK IN', remainingSeconds: 60, maximumSeconds: 60, remainingText: '01:00', running: false, live: true,
      badgeText: 'UPCOMING', lastReason: 'A quick break is coming up', contextText: 'Twitch - 3 snoozes available', warning: false, critical: false, style: TIMER_STYLE,
    }),
  },
  {
    name: 'Punishment countdown (pinned with position: fixed)', path: '/overlay/addons/thsv.streamer-punishments?tracker=off', area: { x: 0, y: 0, width: 442, height: 186 }, ready: '#timer-shell',
    css: 'body * { visibility: hidden !important; } .timer-shell, .timer-shell * { visibility: visible !important; } .timer-shell { position: fixed !important; left: 0 !important; top: 0 !important; right: auto !important; bottom: auto !important; width: 440px !important; margin: 0 !important; transform: none !important; } .timer-time { font-size: 72px !important; }',
    show: async (page) => await publish(page, 'thsv.streamer-punishments', 'thsv.streamer-punishments.timer.update', { label: 'DO 10 PUSHUPS', remainingSeconds: 42, maximumSeconds: 60, running: false, live: true, remainingText: '00:42', variant: 'compact', size: 'small', position: 'top-right' }),
  },
  {
    name: 'Reward Timers (top-right panel)', path: '/overlay/addons/thsv.reward-timers', area: { x: 1430, y: 38, width: 450, height: 316 }, ready: '#reward-timers',
    show: async (page) => await publish(page, 'thsv.reward-timers', 'thsv.reward-timers.timers.update', {
      cardKind: 'reward-timers', visible: true, position: 'top-right', maxOnScreen: 2, showAvatar: true, accentColor: '#7ee0ff',
      timers: [
        { id: 'hat on', label: 'Hat on', viewer: 'Otter', platform: 'kick', avatarUrl: '', startedAt: NOW - 10_000, endsAt: NOW + 20_000 },
        { id: 'streamer muted', label: 'Streamer muted', viewer: 'Sloth Explorer', platform: 'twitch', avatarUrl: '', startedAt: NOW - 60_000, endsAt: NOW + 240_000 },
      ],
    }),
  },
  {
    name: 'Chat First (top-left row)', path: '/overlay/addons/thsv.chat-first', area: { x: 36, y: 36, width: 1058, height: 430 }, ready: '#chat-first',
    show: async (page) => await publish(page, 'thsv.chat-first', 'thsv.chat-first.firsts.update', {
      cardKind: 'chat-first', visible: true, title: 'First in chat', layout: 'row', position: 'top-left', showCount: true, displayMode: 'stream', shownAt: NOW, hideAfterMs: 0, latest: 'kick',
      entries: [
        { platform: 'twitch', platformLabel: 'Twitch', name: 'Sloth Explorer', avatarUrl: '', count: 3, at: NOW - 30_000 },
        { platform: 'youtube', platformLabel: 'YouTube', name: 'Canopy Friend', avatarUrl: '', count: 1, at: NOW - 90_000 },
        { platform: 'kick', platformLabel: 'Kick', name: 'Leaf Runner', avatarUrl: '', count: 7, at: NOW - 10_000 },
      ],
    }),
  },
  {
    name: 'Hydration Station (centered card)', path: '/overlay/addons/thsv.village-hydration-station', area: { x: 700, y: 320, width: 520, height: 444 }, ready: '#hydration-shell',
    show: async (page) => await publish(page, 'thsv.village-hydration-station', 'thsv.village-hydration-station.hydration.update', {
      cardKind: 'hydration-station', displayMode: 'volume', sipAnimation: false, visible: true, title: 'Water Goal', totalOunces: 32, goalOunces: 64, percentage: 50,
      nextReminderAt: NOW + 45 * 60_000, showNumbers: true, showNextReminder: true, live: true,
      style: { containerStyle: 'bottle', backgroundMode: 'glass', backgroundColor: '#0b1720', backgroundOpacity: .9, waterColor: '#55d6ff', waterHighlightColor: '#b8f3ff', accentColor: '#7ff5cc', textColor: '#ffffff', mutedColor: '#c9e7ef' },
    }),
  },
  {
    name: 'Magic 8-Ball (card pinned top-left with custom CSS in vw)', path: '/overlay/addons/thsv.magic-eight-ball', area: { x: 0, y: 0, width: 400, height: 170 }, ready: '#card',
    css: '.stage { display: block !important; padding: 0 !important; } .card { position: absolute !important; left: 0 !important; top: 0 !important; box-sizing: border-box !important; width: 400px !important; max-height: 170px !important; min-height: 0 !important; padding: 12px 16px !important; } .card strong { font-size: clamp(14px, 1.1vw, 30px) !important; } .card-image { display: none !important; }',
    show: async (page) => await publish(page, 'thsv.magic-eight-ball', 'thsv.magic-eight-ball.card.show', { title: '🎱 Magic 8-Ball', text: 'Sloth Explorer: Will I win?\nSigns point to yes', platform: 'twitch', durationMs: 60_000 }),
  },
  {
    name: 'Closed Captions (bottom strip)', path: '/overlay/captions', area: { x: 0, y: 901, width: 1920, height: 179 }, ready: '#caption',
    show: async (page) => await page.evaluate(() => window.__thsvPublishAddOnEvent?.({
      contractVersion: 'thsv-live-captions-v1', kind: 'caption.show',
      payload: { text: 'Readable creator speech for the viewers', durationMs: 60_000, style: { fontFamily: 'sans', fontSizePx: 48, fontWeight: 700, textColor: '#ffffff', textAlign: 'center', outlineColor: '#000000', outlineWidthPx: 2, backgroundMode: 'highlight', backgroundColor: '#101722', backgroundOpacity: 0.9, paddingPx: 16, borderRadiusPx: 12, shadowEnabled: false, shadowColor: '#000000', shadowBlurPx: 0, shadowOffsetXpx: 0, shadowOffsetYpx: 0, position: 'bottom', maximumWidthPercent: 80, maximumLines: 2, animation: 'none' } },
    })),
  },
];

async function draw(page: Page, url: string, item: Case, viewport: { width: number; height: number }, clip?: Area): Promise<Buffer> {
  await page.setViewportSize(viewport);
  await page.goto(url);
  if (item.css !== undefined) await page.addStyleTag({ content: item.css });
  await item.show(page);
  await expect(page.locator(item.ready)).toBeVisible();
  await page.waitForTimeout(1_200);
  return await page.screenshot({ ...(clip === undefined ? {} : { clip }), omitBackground: true, animations: 'disabled' });
}

async function difference(page: Page, first: Buffer, second: Buffer): Promise<{ width: number; height: number; changed: number; painted: number }> {
  await page.goto('about:blank');
  return await page.evaluate(async ([a, b]) => {
    const load = async (data: string) => { const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode(); return image; };
    const [one, two] = await Promise.all([load(a), load(b)]);
    const pixels = (image: HTMLImageElement) => { const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext('2d'); if (context === null) throw new Error('no canvas'); context.drawImage(image, 0, 0); return context.getImageData(0, 0, image.width, image.height).data; };
    const left = pixels(one); const right = pixels(two);
    let changed = 0; let painted = 0;
    for (let index = 0; index < left.length; index += 4) {
      if ((left[index + 3] ?? 0) > 0) painted += 1;
      if (Math.max(...[0, 1, 2, 3].map((offset) => Math.abs((left[index + offset] ?? 0) - (right[index + offset] ?? 0)))) > 24) changed += 1;
    }
    return { width: two.width === one.width && two.height === one.height ? one.width : -1, height: one.height, changed, painted };
  }, [first.toString('base64'), second.toString('base64')] as const);
}

for (const item of CASES) {
  test(`a small source shows the same picture as the full page: ${item.name}`, async ({ page }, testInfo) => {
    await installTransport(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(NOW);
    const [path, query = ''] = item.path.split('?');
    if (path?.startsWith('/overlay/addons/') === true) {
      const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
      await page.route(`**${path}*`, async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
    }
    const { x, y, width, height } = item.area;
    const full = await draw(page, item.path, item, { width: 1920, height: 1080 }, item.area);
    const framed = `${path ?? ''}?${query}${query === '' ? '' : '&'}sbCanvas=1920x1080&sbAt=${String(x)},${String(y)}`;
    const small = await draw(page, framed, item, { width, height });
    expect(await page.evaluate(() => [innerWidth, innerHeight, document.documentElement.dataset.overlayFrame])).toEqual([1920, 1080, '1920x1080']);
    await writeFile(testInfo.outputPath('full-page-cropped.png'), full);
    await writeFile(testInfo.outputPath('small-source.png'), small);
    const result = await difference(page, full, small);
    expect(result.width).toBe(width);
    expect(result.painted).toBeGreaterThan(width * height * 0.05);
    expect(result.changed).toBeLessThanOrEqual(width * height * 0.002);
  });
}

test('without sbCanvas the page is left exactly as it was', async ({ page }) => {
  await installTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.magic-eight-ball', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/overlay/addons/thsv.magic-eight-ball');
  expect(await page.evaluate(() => ({ width: innerWidth, frame: document.documentElement.dataset.overlayFrame ?? null, style: document.getElementById('thsv-overlay-frame') }))).toEqual({ width: 640, frame: null, style: null });
});

test('a small source shows the same picture as the full page: Alerts (top-center card)', async ({ page, request }) => {
  const area = { x: 558, y: 26, width: 804, height: 249 };
  const alert = JSON.parse(await readFile('tests/fixtures/youtube-super-chat.json', 'utf8')) as Record<string, unknown>;
  // One alert, seen by a full page and a small one at the same time (the hub does not repeat an alert).
  const small = await page.context().newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await small.setViewportSize({ width: area.width, height: area.height });
  for (const [view, url] of [[page, '/overlay/alerts'], [small, `/overlay/alerts?sbCanvas=1920x1080&sbAt=${String(area.x)},${String(area.y)}`]] as const) {
    await view.emulateMedia({ reducedMotion: 'reduce' });
    await view.goto(url);
    await expect(view.locator('#status')).toHaveText('LIVE');
  }
  const source = alert['source'] as Record<string, unknown>;
  const response = await request.post('/simulate', { headers: { authorization: 'Bearer playwright-control-token-with-32-characters' }, data: { ...alert, eventId: 'frame-alert', source: { ...source, eventId: 'frame-alert' } } });
  expect(response.status()).toBe(202);
  const shots: Buffer[] = [];
  for (const [view, clip] of [[page, area], [small, undefined]] as const) {
    await expect(view.locator('.alert')).toHaveCount(1);
    await view.waitForTimeout(800);
    shots.push(await view.screenshot({ ...(clip === undefined ? {} : { clip }), omitBackground: true, animations: 'disabled' }));
  }
  const result = await difference(small, shots[0] ?? Buffer.alloc(0), shots[1] ?? Buffer.alloc(0));
  expect(result.width).toBe(area.width);
  expect(result.painted).toBeGreaterThan(area.width * area.height * 0.05);
  expect(result.changed).toBeLessThanOrEqual(area.width * area.height * 0.002);
});
