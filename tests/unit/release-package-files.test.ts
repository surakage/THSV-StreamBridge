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

  it('creates a self-contained Windows archive with a verified bundled runtime and no private data', async () => {
    const source = await readFile('scripts/package-release.ps1', 'utf8');
    expect(source).toContain("product = 'THSV StreamBridge'");
    expect(source).toContain('layoutVersion = 2');
    expect(source).toContain('-windows-x64');
    expect(source).toContain('node.exe');
    expect(source).toContain('SHASUMS256.txt');
    expect(source).toContain('official SHA-256 verification');
    expect(source).toContain('npm.cmd ci --omit=dev --ignore-scripts');
    expect(source).toContain('Install THSV StreamBridge.cmd');
    expect(source).toContain('Get-FileHash -Algorithm SHA256');
    expect(source).toContain('release-manifest.json');
    expect(source).toContain("'wizard'");
    expect(source).toContain("'examples'");
    expect(source).toContain('.sha256');
    for (const forbidden of ['bridge.local.json', 'control-token', 'streambridge.pid', 'state|logs|backups']) expect(source).toContain(forbidden);
    for (const archived of ['viewer-progression', 'companion-actions', 'speaker-orchestration', 'bloom-idle-sprite.png']) expect(source).toContain(archived);
    expect(source).not.toContain("Copy-Item -LiteralPath (Join-Path $repo 'archive')");
  });

  it('backs up add-ons and ships a verified approval-gated restore path', async () => {
    const backup = await readFile('scripts/backup.ps1', 'utf8');
    const restore = await readFile('scripts/restore.ps1', 'utf8');
    expect(backup).toContain("data\\addons");
    expect(backup).toContain('backup-manifest.json');
    expect(backup).toContain('Get-FileHash -Algorithm SHA256');
    expect(restore).toContain('[switch]$ApproveRestore');
    expect(restore.indexOf('Get-FileHash -Algorithm SHA256')).toBeLessThan(restore.indexOf("& (Join-Path $repo 'scripts\\backup.ps1')"));
    expect(restore).toContain('.restore-rollback-');
  });

  it('verifies before private staging and preserves creator data in versioned installations', async () => {
    const source = await readFile('installer/install.mjs', 'utf8');
    expect(source.indexOf('await verifyRelease(sourceRoot, manifest)')).toBeLessThan(source.indexOf('await mkdir(installRoot'));
    expect(source).toContain("join(installRoot, 'app', manifest.version)");
    expect(source).toContain("join(destination, 'addons', 'packages')");
    expect(source).toContain("join(root, 'secrets', 'control-token')");
    expect(source).toContain('randomBytes(32).toString');
    expect(source).toContain('previousVersion');
    expect(source).toContain('failed its health check and was rolled back');
    expect(source).toContain('compareVersions');
    expect(source).toContain('Refusing to downgrade ${PRODUCT}');
    expect(source).not.toMatch(/Invoke-Expression|DownloadString|WebClient|npm\.cmd/u);
  });

  it('requires an explicit switch before deleting creator data', async () => {
    const source = await readFile('launcher/uninstall.mjs', 'utf8');
    expect(source).toContain("process.argv.includes('--delete-user-data')");
    expect(source).toContain("process.argv.includes('--confirm-delete-everything')");
    expect(source).toContain('Creator configuration, add-ons, state, logs, backups, and secrets were preserved');
    expect(source).toContain("record.product !== 'THSV StreamBridge'");
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
    expect(packageSource).toContain('npm.cmd ci --omit=dev --ignore-scripts');
    expect(packageSource).toContain('NODE-LICENSE.txt');
    expect(notices).toContain("OpenAI's built-in image-generation service");
    expect(notices).toContain('To the extent the THSV StreamBridge owner holds copyright or other licensable rights');
    expect(notices).toContain('| `ws` | `8.21.1` | MIT |');
    expect(notices).toContain('| `zod` | `4.4.3` | MIT |');
  });
});
