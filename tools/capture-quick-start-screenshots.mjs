// Captures the Quick start screenshots from a disposable test Bridge (temporary data, no Streamer.bot,
// OBS pointed at a closed port), so no creator's real accounts, settings or apps ever appear.
// Usage: npm run build && node tools/capture-quick-start-screenshots.mjs
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const TOKEN = 'playwright-control-token-with-32-characters';
const port = 8811;
const url = `http://127.0.0.1:${String(port)}`;
const output = join('docs', 'images', 'quick-start');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(tmpdir(), 'thsv-screenshots-'));
const server = spawn(process.execPath, ['tools/run-browser-test-server.mjs'], { env: { ...process.env, THVS_PLAYWRIGHT_PORT: String(port), THSV_BROWSER_TEST_ROOT: root }, stdio: 'ignore', windowsHide: true });

try {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try { if ((await fetch(`${url}/health`)).ok) break; } catch { /* still starting */ }
    if (Date.now() > deadline) throw new Error('The test Bridge did not start.');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const browser = await chromium.launch({ channel: process.env.THSV_SCREENSHOT_BROWSER ?? 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, colorScheme: 'light', deviceScaleFactor: 1 });
  await page.route('**/*', (route) => (new URL(route.request().url()).origin === url ? route.continue() : route.abort()));
  // Live panels keep updating, so capture the element's area instead of waiting for it to stop changing.
  const capture = async (target, file, maxHeight = 1800) => {
    const box = await target.boundingBox();
    if (box === null) throw new Error(`Nothing to capture for ${file}.`);
    await page.screenshot({ path: join(output, file), fullPage: true, animations: 'disabled', clip: { x: box.x, y: box.y + await page.evaluate(() => scrollY), width: box.width, height: Math.min(box.height, maxHeight) } });
  };
  await page.goto(`${url}/wizard/`);
  await page.waitForTimeout(800);
  await capture(page.locator('#login'), '01-unlock.png');
  await page.fill('#token', TOKEN);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#workspace:not(.hidden)');
  await page.waitForTimeout(1500);

  const shot = async (view, selector, file, maxHeight) => {
    await page.click(`button.nav[data-view="${view}"]`);
    await page.waitForTimeout(1500);
    const target = page.locator(selector).first();
    await target.scrollIntoViewIfNeeded();
    await capture(target, file, maxHeight);
  };
  // Status toasts come and go; keep them out of the pictures.
  await page.addStyleTag({ content: '#wizard-feedback{display:none!important}' });
  await page.click('#workspace-mode-toggle').catch(() => undefined);
  await page.waitForTimeout(800);
  const startHere = page.locator('.start-here');
  if (await startHere.count()) await capture(page.locator('#guided-setup'), '02-start-here.png');
  await shot('platforms', '[data-panel="platforms"]', '03-platforms.png');
  await shot('streamerbot', '.universal-import-card', '04-streamerbot-import.png', 760);
  await shot('setup-checklist', '[data-panel="setup-checklist"]', '05-setup-checklist.png');
  await shot('chat-overlay', '[data-panel="chat-overlay"]', '06-browser-sources.png');
  await shot('diagnostics', '[data-panel="diagnostics"]', '07-diagnostics.png');
  await browser.close();
  console.log(`Saved screenshots to ${output}`);
} finally {
  try { await fetch(`${url}/shutdown`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } }); } catch { /* already stopped */ }
  setTimeout(() => { if (server.exitCode === null) server.kill(); }, 2_000).unref();
  await new Promise((resolve) => setTimeout(resolve, 2_500));
  await rm(root, { recursive: true, force: true }).catch(() => undefined);
}
