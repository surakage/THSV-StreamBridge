import { expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { HostedPagesService } from '../../bridge/services/hosted-pages-service.js';
import { PhoneRemoteServer, PhoneRemoteService } from '../../bridge/services/phone-remote-server.js';
import type { Logger } from '../../bridge/services/logger.js';

const quiet = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as Logger;

test('a phone pairs with the code from the PC, opens the Control Panel, and pairs again after it is removed', async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'thsv-phone-browser-'));
  const bridge: Server = createServer((_request, response) => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ tabs: [] })); });
  await new Promise<void>((done) => bridge.listen(0, '127.0.0.1', done));
  const probe = createServer(); await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done));
  const port = (probe.address() as AddressInfo).port; await new Promise<void>((done) => probe.close(() => done()));
  const devices = new HostedPagesService(join(root, 'phone-remote.json'), Date.now, { turnOn: 'Turn on the Phone Control Panel first.', devices: 'phones', device: 'Phone' });
  const phone = new PhoneRemoteService(devices, new PhoneRemoteServer({ devices, port, bridgePort: (bridge.address() as AddressInfo).port, controlToken: 'pc-only-token', logger: quiet, wizardDirectory: resolve('wizard', 'browser') }), port, quiet);
  try {
    await phone.start(); await phone.setEnabled(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:${String(port)}/`);
    await expect(page.getByRole('heading', { name: 'Pair this phone' })).toBeVisible();
    await page.getByLabel('Pairing code').fill('000000');
    await page.getByRole('button', { name: 'Pair' }).click();
    await expect(page.locator('#login-error')).not.toBeEmpty();
    const { code } = phone.createCode();
    await page.getByLabel('Pairing code').fill(`${code.slice(0, 3)} ${code.slice(3)}`);
    await page.getByRole('button', { name: 'Pair' }).click();
    await expect(page.locator('#workspace')).toBeVisible();
    expect(phone.status().phones).toHaveLength(1);

    // Opening it again goes straight in with the saved key.
    await page.reload();
    await expect(page.locator('#workspace')).toBeVisible();

    // Removed on the PC: the phone asks to pair again.
    await phone.unpair(phone.status().phones[0]?.id ?? '');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Pair this phone' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally {
    await phone.stop();
    await new Promise<void>((done) => bridge.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
