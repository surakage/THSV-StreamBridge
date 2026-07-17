import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('public release scripts', () => {
  it('creates manifests, archive checksums, and rejects private runtime files', async () => {
    const source = await readFile('scripts/package-release.ps1', 'utf8');
    expect(source).toContain("product = 'THSV StreamBridge'");
    expect(source).toContain('Get-FileHash -Algorithm SHA256');
    expect(source).toContain('release-manifest.json');
    expect(source).toContain('.sha256');
    for (const forbidden of ['bridge.local.json', 'control-token', 'streambridge.pid', 'state|logs|backups']) expect(source).toContain(forbidden);
  });

  it('verifies before staging and preserves creator data during upgrades', async () => {
    const source = await readFile('scripts/install-release.ps1', 'utf8');
    expect(source.indexOf('Get-FileHash -Algorithm SHA256')).toBeLessThan(source.indexOf("New-Item -ItemType Directory -Path $stage"));
    expect(source).toContain('npm.cmd ci --omit=dev --ignore-scripts');
    expect(source).toContain("Copy-Item -LiteralPath $existingData -Destination $stage -Recurse -Force");
    expect(source).toContain("Move-Item -LiteralPath $destination -Destination $rollback");
    expect(source).toContain("Move-Item -LiteralPath $rollback -Destination $destination");
    expect(source).not.toMatch(/Invoke-Expression|Start-Process|DownloadString|WebClient/u);
  });

  it('requires an explicit switch before deleting creator data', async () => {
    const source = await readFile('scripts/uninstall-release.ps1', 'utf8');
    expect(source).toContain('[switch]$RemoveUserData');
    expect(source).toContain("if (-not $RemoveUserData)");
    expect(source).toContain('The data directory was preserved');
    expect(source).toContain("record.product -ne 'THSV StreamBridge'");
  });

  it('ships an authenticated simulation helper without development tooling', async () => {
    const source = await readFile('scripts/simulate.ps1', 'utf8');
    expect(source).toContain('Authorization = "Bearer $token"');
    expect(source).toContain('ContentType \'application/json\'');
    expect(source).toContain('$BaseUrl/simulate');
    expect(source).not.toMatch(/tsx|node_modules|npm /u);
  });
});
