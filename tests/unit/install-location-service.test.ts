import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectManagedInstallRoot, installLocationFilePath, rememberInstallLocation } from '../../bridge/services/install-location-service.js';

const temporaryRoots: string[] = [];
afterEach(async () => { for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function temporary(): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'thsv-install-location-')); temporaryRoots.push(root); return root; }

async function managedInstall(root: string): Promise<string> {
  await mkdir(join(root, 'runtime'), { recursive: true }); await writeFile(join(root, 'runtime', 'node.exe'), '');
  await mkdir(join(root, 'launcher'), { recursive: true }); await writeFile(join(root, 'launcher', 'start.mjs'), '');
  await mkdir(join(root, 'app', '4.0.14'), { recursive: true });
  return root;
}

describe('install location for the Streamer.bot launcher actions', () => {
  it('writes the same file LaunchBridge.cs reads, as one bare line', async () => {
    const root = await temporary();
    const localAppData = join(root, 'Local');
    const install = join(root, 'output', 'Managed Bridge');
    expect(installLocationFilePath(localAppData)).toBe(join(localAppData, 'THSV StreamBridge', 'install-location.txt'));
    const launcherSource = await readFile('packages/streamerbot/bridge-launcher/src/LaunchBridge.cs', 'utf8');
    expect(launcherSource).toContain('Environment.SpecialFolder.LocalApplicationData), "THSV StreamBridge", "install-location.txt"');

    await expect(rememberInstallLocation(install, localAppData)).resolves.toBe('written');
    expect(await readFile(join(localAppData, 'THSV StreamBridge', 'install-location.txt'), 'utf8')).toBe(install);
    await expect(rememberInstallLocation(install, localAppData)).resolves.toBe('unchanged');
    const moved = join(root, 'elsewhere');
    await expect(rememberInstallLocation(moved, localAppData)).resolves.toBe('written');
    expect(await readFile(join(localAppData, 'THSV StreamBridge', 'install-location.txt'), 'utf8')).toBe(moved);
    expect(await readdir(join(localAppData, 'THSV StreamBridge'))).toEqual(['install-location.txt']);
  });

  it('does nothing without LOCALAPPDATA', async () => {
    expect(installLocationFilePath(undefined)).toBeUndefined();
    expect(installLocationFilePath('  ')).toBeUndefined();
    await expect(rememberInstallLocation(await temporary(), undefined)).resolves.toBe('skipped');
  });

  it('records only a managed installation, never a source checkout', async () => {
    const root = await temporary();
    const install = await managedInstall(join(root, 'Managed Bridge'));
    expect(detectManagedInstallRoot({ THSV_STREAMBRIDGE_INSTALL_ROOT: install }, root)).toBe(install);
    expect(detectManagedInstallRoot({}, join(install, 'app', '4.0.14'))).toBe(install);
    expect(detectManagedInstallRoot({ THSV_STREAMBRIDGE_INSTALL_ROOT: join(root, 'missing') }, join(install, 'app', '4.0.14'))).toBeUndefined();
    expect(detectManagedInstallRoot({}, process.cwd())).toBeUndefined();
    expect(detectManagedInstallRoot({}, join(root, 'Managed Bridge'))).toBeUndefined();
  });

  it('is wired into bridge startup and the managed launcher', async () => {
    const service = await readFile('apps/bridge-service.ts', 'utf8');
    expect(service).toContain("rememberInstallLocation(managedInstallRoot, process.env['LOCALAPPDATA'])");
    expect(service.indexOf('detectManagedInstallRoot(process.env, process.cwd())')).toBeLessThan(service.indexOf('await activeBridge.start()'));
    expect(await readFile('launcher/start.mjs', 'utf8')).toContain('THSV_STREAMBRIDGE_INSTALL_ROOT: installRoot');
    expect(await readFile('installer/install.mjs', 'utf8')).toContain('await rememberInstallLocation(installRoot)');
  });
});
