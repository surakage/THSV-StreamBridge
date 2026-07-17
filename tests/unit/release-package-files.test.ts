import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('public release scripts', () => {
  it('declares and ships the owner-selected MIT License', async () => {
    const metadata = JSON.parse(await readFile('package.json', 'utf8')) as { license?: string };
    const license = await readFile('LICENSE', 'utf8');
    expect(metadata.license).toBe('MIT');
    expect(license).toContain('MIT License');
    expect(license).toContain('Copyright (c) 2026 surakage');
    expect(license).toContain('Permission is hereby granted, free of charge');
    expect(license).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  });

  it('creates manifests, archive checksums, and rejects private runtime files', async () => {
    const source = await readFile('scripts/package-release.ps1', 'utf8');
    expect(source).toContain("product = 'THSV StreamBridge'");
    expect(source).toContain('Get-FileHash -Algorithm SHA256');
    expect(source).toContain('release-manifest.json');
    expect(source).toContain('.sha256');
    for (const forbidden of ['bridge.local.json', 'control-token', 'streambridge.pid', 'state|logs|backups']) expect(source).toContain(forbidden);
    for (const archived of ['viewer-progression', 'companion-actions', 'speaker-orchestration', 'bloom-idle-sprite.png']) expect(source).toContain(archived);
    expect(source).not.toContain("Copy-Item -LiteralPath (Join-Path $repo 'archive')");
  });

  it('verifies before staging and preserves creator data during upgrades', async () => {
    const source = await readFile('scripts/install-release.ps1', 'utf8');
    expect(source.indexOf('Get-FileHash -Algorithm SHA256')).toBeLessThan(source.indexOf("New-Item -ItemType Directory -Path $stage"));
    expect(source).toContain('npm.cmd ci --omit=dev --ignore-scripts');
    expect(source).toContain("Copy-Item -LiteralPath $existingData -Destination $stage -Recurse -Force");
    expect(source).toContain("Move-Item -LiteralPath $destination -Destination $rollback");
    expect(source).toContain("Move-Item -LiteralPath $rollback -Destination $destination");
    expect(source).toContain('[switch]$AllowDowngrade');
    expect(source).toContain('Compare-SemVer');
    expect(source).toContain('Refusing to downgrade THSV StreamBridge');
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

  it('packages asset provenance and direct dependency notices', async () => {
    const packageSource = await readFile('scripts/package-release.ps1', 'utf8');
    const notices = await readFile('THIRD-PARTY-NOTICES.md', 'utf8');
    expect(packageSource).toContain("'THIRD-PARTY-NOTICES.md'");
    expect(packageSource).toContain("Where-Object Name -eq '__pycache__'");
    expect(packageSource).toContain("Where-Object Extension -in @('.pyc', '.pyo')");
    expect(notices).toContain("OpenAI's built-in image-generation service");
    expect(notices).toContain('To the extent the THSV StreamBridge owner holds copyright or other licensable rights');
    expect(notices).toContain('| `ws` | `8.21.1` | MIT |');
    expect(notices).toContain('| `zod` | `4.4.3` | MIT |');
  });
});
