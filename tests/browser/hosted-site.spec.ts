import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

// The pages uploaded to app.slothbloom.com, opened from that address, against a real StreamBridge on this PC.
const SITE = 'https://app.slothbloom.com';
const TOKEN = 'playwright-control-token-with-32-characters';
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

let site = '';
test.beforeAll(async () => {
  site = await mkdtemp(join(tmpdir(), 'thsv-site-'));
  execFileSync(process.execPath, ['scripts/build-site-bundle.mjs', site]);
});
test.afterAll(async () => { await rm(site, { recursive: true, force: true }); });

async function serveSite(page: Page): Promise<void> {
  await page.route(`${SITE}/**`, async (route) => {
    let path = new URL(route.request().url()).pathname;
    if (path.endsWith('/')) path += 'index.html';
    else if (extname(path) === '') path += '.html';
    const file = normalize(join(site, path));
    try { await route.fulfill({ contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
    catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
}

test('the site pages pair with StreamBridge on this PC and open the Wizard', async ({ page, baseURL, request }) => {
  const port = new URL(baseURL ?? '').port;
  const local = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
  await serveSite(page);
  // A real browser asks the streamer once whether this site may reach apps on this PC; the test says yes.
  await page.context().grantPermissions(['local-network-access'], { origin: SITE });

  // Switched off: the site cannot reach StreamBridge and says how to turn it on.
  await page.goto(`${SITE}/wizard/?bridge-port=${port}`);
  await expect(page.locator('#hosted-connect-state')).toHaveText('StreamBridge on this PC did not answer.');
  await expect(page.locator('#hosted-connect-help')).toContainText('turn on "Open StreamBridge from slothbloom.com"');
  await expect(page.locator('#workspace')).toBeHidden();

  expect((await request.put('/wizard/api/hosted-pages', { headers: local, data: { enabled: true, approvedByCreator: true } })).ok()).toBe(true);
  const { code } = await (await request.post('/wizard/api/hosted-pages/code', { headers: local })).json() as { code: string };

  await page.reload();
  await expect(page.locator('#hosted-connect-state')).toHaveText('Type the code StreamBridge shows on this PC.');
  await page.locator('#hosted-pair-code').fill('000000' === code ? '000001' : '000000');
  await page.getByRole('button', { name: 'Pair this browser' }).click();
  await expect(page.locator('#hosted-connect-state')).toHaveText('That code is not right. Check it and try again.');
  await page.locator('#hosted-pair-code').fill(`${code.slice(0, 3)} ${code.slice(3)}`);
  await page.getByRole('button', { name: 'Pair this browser' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
  await expect(page.locator('#workspace')).toBeVisible();

  // Overlay links are the ones OBS needs, on this PC, and never the site's own address.
  await expect(page.locator('#chat-source-url')).toHaveValue(`http://127.0.0.1:${port}/overlay/chat`);
  await expect(page.locator('#alert-source-url')).toHaveValue(`http://127.0.0.1:${port}/overlay/alerts`);
  await expect(page.locator('#emote-wall-preview')).toHaveAttribute('src', new RegExp(`^http://127\\.0\\.0\\.1:${port}/overlay/emote-wall`, 'u'));
  await page.route('**/overlay/addons/thsv.first-five**', async (route) => { await route.fulfill({ contentType: 'text/html', body: await readFile('overlays/browser/addon-host.html', 'utf8') }); });
  // An overlay preview framed from this PC loads inside the site page and tells the Wizard it is ready.
  const ready = await page.evaluate(async (source) => await new Promise<string>((done) => {
    addEventListener('message', (message: MessageEvent<{ kind?: string } | null>) => { if (message.data?.kind === 'thsv.overlay-editor.ready') done(message.origin); });
    const frame = document.createElement('iframe'); frame.src = source; document.body.append(frame);
    setTimeout(() => { done('no answer'); }, 8000);
  }), `http://127.0.0.1:${port}/overlay/addons/thsv.first-five?editor=wizard`);
  expect(ready).toBe(`http://127.0.0.1:${port}`);

  // The control token never reaches the site: only the pairing key is kept in this browser.
  const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  expect(stored).not.toContain(TOKEN);

  // The Control Panel pop-out on the site uses the same pairing, with no password box.
  const panel = await page.context().newPage();
  await serveSite(panel);
  await panel.goto(`${SITE}/wizard/panel`);
  await expect(panel.locator('#workspace')).toBeVisible();
  await expect(panel.locator('#login')).toBeHidden();
  await panel.close();

  // A later visit opens straight away, and unpairing on the PC locks this browser out again.
  await page.reload();
  await expect(page.locator('#mode')).toContainText('Authenticated');
  const status = await (await request.get('/wizard/api/hosted-pages', { headers: local })).json() as { browsers: Array<{ id: string }> };
  expect(status.browsers).toHaveLength(1);
  await request.delete(`/wizard/api/hosted-pages/browsers/${status.browsers[0]?.id ?? ''}`, { headers: local });
  await page.reload();
  await expect(page.locator('#hosted-connect-state')).toHaveText('This browser is not paired any more. Type a new code to pair it again.');
  await expect(page.locator('#workspace')).toBeHidden();
});
