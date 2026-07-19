import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

interface ReleaseEntry { readonly path: string; readonly size: number; readonly sha256: string }

const windowsPowerShellEnvironment = { ...process.env };
delete windowsPowerShellEnvironment['PSModulePath'];

async function writeRelease(source: string, version: string, appText: string): Promise<void> {
  await mkdir(join(source, 'scripts'), { recursive: true });
  await mkdir(join(source, 'config'), { recursive: true });
  await mkdir(join(source, 'dist'), { recursive: true });
  await copyFile('scripts/install-release.ps1', join(source, 'scripts', 'install-release.ps1'));
  await copyFile('scripts/uninstall-release.ps1', join(source, 'scripts', 'uninstall-release.ps1'));
  await writeFile(join(source, 'config', 'bridge.example.json'), '{"configVersion":"1.0.0"}\n');
  await writeFile(join(source, 'dist', 'app.js'), appText);
  await writeFile(join(source, 'package.json'), JSON.stringify({ name: '@thsv/streambridge', version }));
  const paths = ['scripts/install-release.ps1', 'scripts/uninstall-release.ps1', 'config/bridge.example.json', 'dist/app.js', 'package.json'];
  const files: ReleaseEntry[] = [];
  for (const path of paths) {
    const bytes = await readFile(join(source, path));
    files.push({ path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await writeFile(join(source, 'release-manifest.json'), JSON.stringify({ product: 'THSV StreamBridge', version, files }));
}

function runPowerShell(script: string, args: string[]): string {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { encoding: 'utf8', timeout: 20_000, env: windowsPowerShellEnvironment });
  if (result.status !== 0) throw new Error(`PowerShell failed (${String(result.status)}):\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

describe('Windows release installer', () => {
  it('verifies, installs, upgrades with data preservation, and uninstalls safely', async () => {
    if (process.platform !== 'win32') return;
    const temp = await mkdtemp(join(tmpdir(), 'thsv-release-'));
    const source = join(temp, 'release source');
    const install = join(temp, 'installed app');
    try {
      await writeRelease(source, '0.13.0-test.1', 'first release\n');
      runPowerShell(join(source, 'scripts', 'install-release.ps1'), ['-SourceRoot', source, '-InstallRoot', install, '-SkipDependencyInstall']);
      expect(await readFile(join(install, 'dist', 'app.js'), 'utf8')).toBe('first release\n');
      expect(JSON.parse(await readFile(join(install, 'data', 'runtime', 'install-manifest.json'), 'utf8'))).toMatchObject({ product: 'THSV StreamBridge', version: '0.13.0-test.1' });
      await writeFile(join(install, 'data', 'runtime', 'bridge.local.json'), '{"creator":"preserved"}\n');
      await writeFile(join(install, 'data', 'state', 'viewer-progression.json'), '{"points":42}\n');
      await writeFile(join(install, 'data', 'state', 'companion.json'), '{"sleeping":true}\n');

      await writeRelease(source, '0.13.0-test.2', 'second release\n');
      runPowerShell(join(source, 'scripts', 'install-release.ps1'), ['-SourceRoot', source, '-InstallRoot', install, '-SkipDependencyInstall']);
      expect(await readFile(join(install, 'dist', 'app.js'), 'utf8')).toBe('second release\n');
      expect(await readFile(join(install, 'data', 'runtime', 'bridge.local.json'), 'utf8')).toContain('preserved');
      expect(await readFile(join(install, 'data', 'state', 'viewer-progression.json'), 'utf8')).toContain('42');
      expect(await readFile(join(install, 'data', 'state', 'companion.json'), 'utf8')).toContain('true');

      await writeRelease(source, '0.13.0-test.1', 'downgraded release\n');
      const downgrade = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(source, 'scripts', 'install-release.ps1'), '-SourceRoot', source, '-InstallRoot', install, '-SkipDependencyInstall'], { encoding: 'utf8', timeout: 20_000, env: windowsPowerShellEnvironment });
      expect(downgrade.status).not.toBe(0);
      expect(`${downgrade.stdout}${downgrade.stderr}`).toContain('Refusing to downgrade THSV StreamBridge');
      expect(await readFile(join(install, 'dist', 'app.js'), 'utf8')).toBe('second release\n');
      runPowerShell(join(source, 'scripts', 'install-release.ps1'), ['-SourceRoot', source, '-InstallRoot', install, '-SkipDependencyInstall', '-AllowDowngrade']);
      expect(await readFile(join(install, 'dist', 'app.js'), 'utf8')).toBe('downgraded release\n');
      expect(await readFile(join(install, 'data', 'state', 'viewer-progression.json'), 'utf8')).toContain('42');

      runPowerShell(join(install, 'scripts', 'uninstall-release.ps1'), ['-InstallRoot', install]);
      expect(await readFile(join(install, 'data', 'state', 'viewer-progression.json'), 'utf8')).toContain('42');
      await expect(stat(join(install, 'dist'))).rejects.toThrow();

      runPowerShell(join(source, 'scripts', 'install-release.ps1'), ['-SourceRoot', source, '-InstallRoot', install, '-SkipDependencyInstall']);
      runPowerShell(join(install, 'scripts', 'uninstall-release.ps1'), ['-InstallRoot', install, '-RemoveUserData']);
      await expect(stat(install)).rejects.toThrow();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 30_000);

  it('rejects a release whose contents do not match its manifest', async () => {
    if (process.platform !== 'win32') return;
    const temp = await mkdtemp(join(tmpdir(), 'thsv-release-tamper-'));
    const source = join(temp, 'source');
    const install = join(temp, 'install');
    try {
      await writeRelease(source, '0.13.0-test.1', 'trusted\n');
      await writeFile(join(source, 'dist', 'app.js'), 'tampered\n');
      const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(source, 'scripts', 'install-release.ps1'), '-SourceRoot', source, '-InstallRoot', install, '-SkipDependencyInstall'], { encoding: 'utf8', timeout: 20_000, env: windowsPowerShellEnvironment });
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(/size mismatch|hash mismatch/u);
      await expect(stat(install)).rejects.toThrow();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 30_000);
});
