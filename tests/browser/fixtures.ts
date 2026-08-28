import { expect, test as base } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOKEN = 'playwright-control-token-with-32-characters';

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error('Could not reserve a browser-test server port.');
  return port;
}

async function waitForServer(url: string, child: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Isolated browser-test server exited before becoming ready (${String(child.exitCode)}).`);
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(750) });
      if (response.ok) return;
    } catch { /* Startup is still in progress. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Isolated browser-test server did not become ready within 20 seconds.');
}

export const test = base.extend<{ isolatedServerUrl: string }>({
  isolatedServerUrl: async ({ browserName }, use, testInfo) => {
    void browserName;
    const root = await mkdtemp(join(tmpdir(), `thsv-browser-${String(testInfo.workerIndex)}-`));
    const port = await reservePort();
    const url = `http://127.0.0.1:${String(port)}`;
    const cleanEnvironment = { ...process.env };
    delete cleanEnvironment.FORCE_COLOR;
    const child = spawn(process.execPath, ['tools/run-browser-test-server.mjs'], {
      cwd: process.cwd(),
      env: { ...cleanEnvironment, NO_COLOR: '1', THVS_PLAYWRIGHT_PORT: String(port), THSV_BROWSER_TEST_ROOT: root },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.stderr.on('data', (chunk) => { output += String(chunk); });
    try {
      await waitForServer(url, child);
      await use(url);
    } finally {
      try { await fetch(`${url}/shutdown`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(3_000) }); } catch { /* Already stopped. */ }
      if (child.exitCode === null) {
        await Promise.race([
          new Promise<void>((resolve) => child.once('exit', () => resolve())),
          new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
        ]);
      }
      if (child.exitCode === null) {
        child.kill();
        await Promise.race([
          new Promise<void>((resolve) => child.once('exit', () => resolve())),
          new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
        ]);
      }
      if (testInfo.status !== testInfo.expectedStatus && output) await testInfo.attach('isolated-server.log', { body: output, contentType: 'text/plain' });
      await rm(root, { recursive: true, force: true });
    }
  },
  baseURL: async ({ isolatedServerUrl }, use) => await use(isolatedServerUrl),
});

export { expect };
