import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

interface ReleaseFile { readonly path: string; readonly size: number; readonly sha256: string }

async function writePortableRelease(root: string, version: string, marker: string): Promise<void> {
  for (const directory of ['installer', 'launcher', 'runtime', 'app/config', 'app/dist/apps']) await mkdir(join(root, directory), { recursive: true });
  await copyFile('installer/install.mjs', join(root, 'installer', 'install.mjs'));
  await copyFile('installer/Install THSV StreamBridge.cmd', join(root, 'installer', 'Install THSV StreamBridge.cmd'));
  for (const name of ['start.mjs', 'stop.mjs', 'uninstall.mjs', 'Start THSV StreamBridge.cmd', 'Stop THSV StreamBridge.cmd', 'Open THSV Setup Wizard.cmd', 'Uninstall THSV StreamBridge.cmd']) await copyFile(join('launcher', name), join(root, 'launcher', name));
  await copyFile(process.execPath, join(root, 'runtime', 'node.exe'));
  await writeFile(join(root, 'runtime', 'NODE-LICENSE.txt'), 'test runtime license\n');
  await writeFile(join(root, 'runtime', 'node-version.txt'), process.version);
  await writeFile(join(root, 'app', 'dist', 'apps', 'bridge-service.js'), `${marker}\n`);
  await writeFile(join(root, 'app', 'config', 'bridge.example.json'), JSON.stringify({
    logging: { directory: 'data/logs' }, security: { controlTokenFile: 'data/runtime/control-token' },
    deduplication: { stateFile: 'data/state/deduplication.json' }, timedActions: { stateFile: 'data/state/timed-actions.json' },
    streamerbot: { deliveryStateFile: 'data/state/delivery-outbox.json' },
  }));
  const paths = [
    'installer/install.mjs', 'installer/Install THSV StreamBridge.cmd',
    'launcher/start.mjs', 'launcher/stop.mjs', 'launcher/uninstall.mjs',
    'launcher/Start THSV StreamBridge.cmd', 'launcher/Stop THSV StreamBridge.cmd', 'launcher/Open THSV Setup Wizard.cmd', 'launcher/Uninstall THSV StreamBridge.cmd',
    'runtime/node.exe', 'runtime/NODE-LICENSE.txt', 'runtime/node-version.txt',
    'app/dist/apps/bridge-service.js', 'app/config/bridge.example.json',
  ];
  const files: ReleaseFile[] = [];
  for (const path of paths) {
    const value = await readFile(join(root, path));
    files.push({ path, size: value.length, sha256: createHash('sha256').update(value).digest('hex') });
  }
  await writeFile(join(root, 'release-manifest.json'), JSON.stringify({
    product: 'THSV StreamBridge', layoutVersion: 2, version,
    canonicalDownload: 'https://github.com/surakage/THSV-StreamBridge/releases',
    runtime: { nodeVersion: process.versions.node, platform: 'win32', arch: 'x64' }, files,
  }));
}

function install(source: string, destination: string, ...extra: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [join(source, 'installer', 'install.mjs'), '--install-root', destination, '--no-start', '--skip-acl', ...extra], { encoding: 'utf8', timeout: 60_000 });
}

function processOutput(result: ReturnType<typeof spawnSync>): string {
  return `${String(result.stdout)}\n${String(result.stderr)}`;
}

describe('portable Windows release installer', () => {
  it('installs side by side, preserves creator data, rejects downgrades, and generates unique per-install tokens', async () => {
    if (process.platform !== 'win32') return;
    const temporary = await mkdtemp(join(tmpdir(), 'thsv-portable-release-'));
    const source = join(temporary, 'release'); const firstInstall = join(temporary, 'creator one'); const secondInstall = join(temporary, 'creator two');
    await writePortableRelease(source, '2.0.0', 'first');
    const firstResult = install(source, firstInstall);
    expect(firstResult.status, processOutput(firstResult)).toBe(0);
    const firstToken = (await readFile(join(firstInstall, 'data', 'secrets', 'control-token'), 'utf8')).trim();
    expect(Buffer.from(firstToken, 'base64url')).toHaveLength(32);
    expect(await readFile(join(firstInstall, 'app', '2.0.0', 'dist', 'apps', 'bridge-service.js'), 'utf8')).toBe('first\n');
    const configuration = JSON.parse(await readFile(join(firstInstall, 'data', 'configuration', 'bridge.local.json'), 'utf8')) as { security: { controlTokenFile: string }; logging: { directory: string } };
    expect(configuration.security.controlTokenFile).toBe(join(firstInstall, 'data', 'secrets', 'control-token'));
    expect(configuration.logging.directory).toBe(join(firstInstall, 'data', 'logs'));
    await writeFile(join(firstInstall, 'data', 'state', 'creator-state.json'), '{"preserved":true}\n');
    await writeFile(join(firstInstall, 'addons', 'state', 'creator-addon.json'), '{"preserved":true}\n');

    await writePortableRelease(source, '2.1.0', 'second');
    const upgrade = install(source, firstInstall);
    expect(upgrade.status, processOutput(upgrade)).toBe(0);
    expect((await readFile(join(firstInstall, 'data', 'secrets', 'control-token'), 'utf8')).trim()).toBe(firstToken);
    expect(await readFile(join(firstInstall, 'data', 'state', 'creator-state.json'), 'utf8')).toContain('preserved');
    expect(await readFile(join(firstInstall, 'addons', 'state', 'creator-addon.json'), 'utf8')).toContain('preserved');
    expect(JSON.parse(await readFile(join(firstInstall, 'data', 'runtime', 'install-manifest.json'), 'utf8'))).toMatchObject({ activeVersion: '2.1.0', previousVersion: '2.0.0' });

    await writePortableRelease(source, '2.0.0', 'downgrade');
    const downgrade = install(source, firstInstall);
    expect(downgrade.status).not.toBe(0);
    expect(processOutput(downgrade)).toContain('Refusing to downgrade');

    const secondResult = install(source, secondInstall);
    expect(secondResult.status, processOutput(secondResult)).toBe(0);
    const secondToken = (await readFile(join(secondInstall, 'data', 'secrets', 'control-token'), 'utf8')).trim();
    expect(secondToken).not.toBe(firstToken);

    const uninstall = spawnSync(process.execPath, [join(firstInstall, 'launcher', 'uninstall.mjs'), '--install-root', firstInstall], { encoding: 'utf8', timeout: 30_000 });
    expect(uninstall.status, processOutput(uninstall)).toBe(0);
    expect(await readFile(join(firstInstall, 'data', 'state', 'creator-state.json'), 'utf8')).toContain('preserved');
    expect(await readFile(join(firstInstall, 'addons', 'state', 'creator-addon.json'), 'utf8')).toContain('preserved');
    await expect(stat(join(firstInstall, 'app'))).rejects.toThrow();
  }, 120_000);

  it('rejects tampered release contents before creating an installation', async () => {
    if (process.platform !== 'win32') return;
    const temporary = await mkdtemp(join(tmpdir(), 'thsv-portable-tamper-'));
    const source = join(temporary, 'release'); const destination = join(temporary, 'install');
    await writePortableRelease(source, '2.0.0', 'trusted');
    await writeFile(join(source, 'app', 'dist', 'apps', 'bridge-service.js'), 'tampered\n');
    const result = install(source, destination);
    expect(result.status).not.toBe(0);
    expect(processOutput(result)).toMatch(/size mismatch|hash mismatch/u);
    await expect(stat(destination)).rejects.toThrow();
  }, 60_000);
});
