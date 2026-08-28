import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const windowsIt = process.platform === 'win32' ? it : it.skip;

describe('protected release public-API fallback', () => {
  windowsIt('resolves the previous release when GitHub CLI credentials are stale', async () => {
    const mockBin = await mockReleaseCommands();
    const script = resolve('scripts/resolve-previous-release.ps1');
    const result = runPowerShell(script, ['-CurrentTag', 'v4.0.9', '-ResolveOnly'], mockBin);
    expect(result.status, String(result.stderr)).toBe(0);
    expect(JSON.parse(lastJsonLine(String(result.stdout)))).toMatchObject({ currentTag: 'v4.0.9', previousTag: 'v4.0.8' });
  });

  windowsIt('uses public attestation retrieval and offline verification when GitHub CLI auth fails', async () => {
    const mockBin = await mockReleaseCommands(); const root = await mkdtemp(join(tmpdir(), 'thsv-release-verify-'));
    const archive = join(root, 'THSV-StreamBridge-4.0.8.zip'); const checksum = `${archive}.sha256`; const bytes = Buffer.from('release-archive');
    await writeFile(archive, bytes); await writeFile(checksum, `${createHash('sha256').update(bytes).digest('hex')}  THSV-StreamBridge-4.0.8.zip\n`);
    const script = resolve('scripts/verify-release-archive.ps1');
    const result = runPowerShell(script, ['-ArchivePath', archive, '-ChecksumPath', checksum], mockBin);
    expect(result.status, String(result.stderr)).toBe(0);
    expect(String(result.stdout)).toContain('THSV-StreamBridge-4.0.8.zip');
  });
});

async function mockReleaseCommands(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-release-cli-'));
  await writeFile(join(root, 'gh.cmd'), '@echo off\r\nexit /b 1\r\n');
  await writeFile(join(root, 'node.cmd'), [
    '@echo off',
    'if /I "%~2"=="list" (',
    '  echo [{"tagName":"v4.0.8","isPrerelease":false}]',
    '  exit /b 0',
    ')',
    'if /I "%~2"=="attestations" (',
    '  echo {"attestations":[]}>"%~5"',
    '  exit /b 0',
    ')',
    'if /I "%~2"=="verify-attestations" exit /b 0',
    'exit /b 1',
  ].join('\r\n'));
  return root;
}

function runPowerShell(script: string, arguments_: string[], mockBin: string): ReturnType<typeof spawnSync> {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...arguments_], {
    encoding: 'utf8', env: { ...process.env, PATH: `${mockBin};${process.env['PATH'] ?? ''}` }, timeout: 20_000,
  });
}

function lastJsonLine(output: string): string { return output.trim().split(/\r?\n/u).at(-1) ?? ''; }
