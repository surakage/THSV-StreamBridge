import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const temporary: string[] = [];
const windowsPowerShellEnvironment = { ...process.env };
windowsPowerShellEnvironment['PSModulePath'] = join(process.env['WINDIR'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules');
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

function run(script: string, args: readonly string[] = []): string {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { encoding: 'utf8', timeout: 20_000, env: windowsPowerShellEnvironment });
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-backup-')); temporary.push(root);
  await mkdir(join(root, 'scripts'), { recursive: true });
  await copyFile('scripts/backup.ps1', join(root, 'scripts', 'backup.ps1'));
  await copyFile('scripts/restore.ps1', join(root, 'scripts', 'restore.ps1'));
  for (const path of ['config', 'data/runtime', 'data/state', 'data/addons/sample.no-op']) await mkdir(join(root, path), { recursive: true });
  await writeFile(join(root, 'config', 'bridge.example.json'), '{"version":"original"}\n');
  await writeFile(join(root, 'data', 'runtime', 'bridge.local.json'), '{"creator":"original"}\n');
  await writeFile(join(root, 'data', 'state', 'state.json'), '{"value":1}\n');
  await writeFile(join(root, 'data', 'addons', 'sample.no-op', 'module-package.json'), '{"module":"original"}\n');
  return root;
}

describe('backup and restore scripts', () => {
  it('hashes configuration, state, and add-ons, then restores them through the staged approval path', async () => {
    if (process.platform !== 'win32') return;
    const root = await fixture();
    run(join(root, 'scripts', 'backup.ps1'));
    const backups = (await readdir(join(root, 'data', 'backups'))).filter((name) => !name.startsWith('.'));
    expect(backups).toHaveLength(1);
    const backup = join(root, 'data', 'backups', backups[0] as string);
    const manifest = JSON.parse(await readFile(join(backup, 'backup-manifest.json'), 'utf8')) as { files: { path: string }[] };
    expect(manifest.files.map((file) => file.path)).toEqual(expect.arrayContaining(['config/bridge.example.json', 'bridge.local.json', 'state/state.json', 'addons/sample.no-op/module-package.json']));
    await writeFile(join(root, 'config', 'bridge.example.json'), '{"version":"changed"}\n');
    await writeFile(join(root, 'data', 'runtime', 'bridge.local.json'), '{"creator":"changed"}\n');
    await writeFile(join(root, 'data', 'state', 'state.json'), '{"value":2}\n');
    await writeFile(join(root, 'data', 'addons', 'sample.no-op', 'module-package.json'), '{"module":"changed"}\n');
    run(join(root, 'scripts', 'restore.ps1'), ['-BackupPath', backup, '-ApproveRestore']);
    await expect(readFile(join(root, 'config', 'bridge.example.json'), 'utf8')).resolves.toContain('original');
    await expect(readFile(join(root, 'data', 'runtime', 'bridge.local.json'), 'utf8')).resolves.toContain('original');
    await expect(readFile(join(root, 'data', 'state', 'state.json'), 'utf8')).resolves.toContain('1');
    await expect(readFile(join(root, 'data', 'addons', 'sample.no-op', 'module-package.json'), 'utf8')).resolves.toContain('original');
  });

  it('rejects unapproved and tampered restores before changing current data', async () => {
    if (process.platform !== 'win32') return;
    const root = await fixture(); run(join(root, 'scripts', 'backup.ps1'));
    const backup = join(root, 'data', 'backups', (await readdir(join(root, 'data', 'backups')))[0] as string);
    const unapproved = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'restore.ps1'), '-BackupPath', backup], { encoding: 'utf8', env: windowsPowerShellEnvironment });
    expect(unapproved.status).not.toBe(0);
    await writeFile(join(backup, 'state', 'state.json'), '{"tampered":true}\n');
    await writeFile(join(root, 'data', 'state', 'state.json'), '{"current":true}\n');
    const tampered = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'restore.ps1'), '-BackupPath', backup, '-ApproveRestore'], { encoding: 'utf8', env: windowsPowerShellEnvironment });
    expect(tampered.status).not.toBe(0);
    await expect(readFile(join(root, 'data', 'state', 'state.json'), 'utf8')).resolves.toContain('current');
  });
});
