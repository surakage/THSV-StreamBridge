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
    expect(source).toContain('$assetName = "THSV-StreamBridge-$($package.version)"');
    expect(source).toContain('node.exe');
    expect(source).toContain('SHASUMS256.txt');
    expect(source).toContain('official SHA-256 verification');
    expect(source).toContain('npm.cmd ci --omit=dev --ignore-scripts');
    expect(source).toContain('Install THSV StreamBridge.cmd');
    expect(source).toContain('Get-FileHash -Algorithm SHA256');
    expect(source).toContain('release-manifest.json');
    expect(source).toContain("Get-ChildItem -LiteralPath (Join-Path $repo 'addons') -Directory");
    expect(source).toContain('npm.cmd run addon:package -- $_.FullName $addOnArchive');
    expect(source).toContain('THSV-StreamBridge-AddOn-');
    expect(source).toContain('THSV-StreamBridge-AddOns-index.json');
    expect(source).toContain("trustModel = 'GitHub release asset hashes plus GitHub artifact attestations; no silent install or auto-enable.'");
    expect(source).toContain('revoked = @()');
    expect(source).toContain("Join-Path $bundleRoot 'Streamer.bot'");
    expect(source).toContain("Where-Object { $_.Name -notin $addOnPackageFolderNames }");
    expect(source).toContain('They are intentionally not included in the main StreamBridge package.');
    expect(source).toContain('*.thsv-addon*');
    expect(source).toContain("'wizard'");
    expect(source).toContain('$releaseDocs');
    expect(source).toContain("'streamerbot-csharp-references.md'");
    expect(source).toContain("Get-ChildItem -LiteralPath $_.FullName -Filter '*.sb'");
    expect(source).toContain("Remove-Item -LiteralPath (Join-Path $appRoot 'package-lock.json')");
    expect(source).toContain("Remove-Item -LiteralPath (Join-Path $appRoot 'node_modules\\.package-lock.json')");
    expect(source).toContain("'app\\examples'");
    expect(source).toContain("'app\\docs\\stage-2-completion.md'");
    expect(source).toContain('.sha256');
    for (const forbidden of ['bridge.local.json', 'control-token', 'streambridge.pid', 'state|logs|backups']) expect(source).toContain(forbidden);
    for (const archived of ['viewer-progression', 'companion-actions', 'speaker-orchestration', 'bloom-idle-sprite.png']) expect(source).toContain(archived);
    expect(source).not.toContain("Copy-Item -LiteralPath (Join-Path $repo 'archive')");
  });

  it('publishes every optional add-on as a separately verified release asset', async () => {
    const workflow = await readFile('.github/workflows/release.yml', 'utf8');
    expect(workflow).toContain('packages\\THSV-StreamBridge-AddOn-*.zip');
    expect(workflow).toContain('packages/THSV-StreamBridge-AddOn-*.zip');
    expect(workflow).toContain('packages\\THSV-StreamBridge-AddOn-*.zip.sha256');
    expect(workflow).toContain('packages/THSV-StreamBridge-AddOns-index.json');
    expect(workflow).toContain('packages\\THSV-StreamBridge-AddOns-index.json');
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

  it('keeps the public installer visible with an explicit success or failure result', async () => {
    const source = await readFile('installer/Install THSV StreamBridge.cmd', 'utf8');
    expect(source).toContain('The window will stay open so you can review the final result.');
    expect(source).toContain('[SUCCESS] THSV StreamBridge installation completed.');
    expect(source).toContain('[FAILED] THSV StreamBridge was not installed successfully.');
    expect(source).toContain('pause >nul');
    expect(source).toContain('exit /b %THSV_INSTALL_EXIT%');
  });

  it('keeps the public uninstaller visible and explains preserved creator data', async () => {
    const source = await readFile('launcher/Uninstall THSV StreamBridge.cmd', 'utf8');
    expect(source).toContain('The window will stay open so you can review the final result.');
    expect(source).toContain('[SUCCESS] THSV StreamBridge was removed successfully.');
    expect(source).toContain('[FAILED] THSV StreamBridge could not be removed completely.');
    expect(source).toContain('Reinstalling later will reuse this preserved configuration.');
    expect(source).toContain('pause >nul');
    expect(source).toContain('$env:THSV_UNINSTALL_SELF');
    expect(source).toContain('Remove-Item -LiteralPath $path -Recurse -Force');
    expect(source).toContain("Join-Path $env:THSV_UNINSTALL_ROOT 'app'");
  });

  it('keeps every installed launcher visible with explicit results', async () => {
    const expectations = [
      ['Start THSV StreamBridge.cmd', '[SUCCESS] THSV StreamBridge is running.', '[FAILED] THSV StreamBridge could not be started.'],
      ['Stop THSV StreamBridge.cmd', '[SUCCESS] THSV StreamBridge is stopped.', '[FAILED] THSV StreamBridge could not be stopped cleanly.'],
      ['Open THSV Setup Wizard.cmd', '[SUCCESS] The setup wizard was opened.', '[FAILED] The setup wizard could not be opened.'],
    ] as const;
    for (const [name, success, failure] of expectations) {
      const source = await readFile(`launcher/${name}`, 'utf8');
      expect(source).toContain(success);
      expect(source).toContain(failure);
      expect(source).toContain('pause >nul');
      expect(source).toContain('exit /b %THSV_LAUNCH_EXIT%');
    }
  });

  it('requires an explicit switch before deleting creator data', async () => {
    const source = await readFile('launcher/uninstall.mjs', 'utf8');
    expect(source).toContain("process.argv.includes('--delete-user-data')");
    expect(source).toContain("process.argv.includes('--confirm-delete-everything')");
    expect(source).toContain('Creator configuration, add-ons, state, logs, backups, and secrets were preserved');
    expect(source).toContain("record.product !== 'THSV StreamBridge'");
    expect(source).toContain('maxRetries: 2');
    expect(source).toContain('retryDelay: 100');
    expect(source).toContain("error?.code !== 'EBUSY'");
    expect(source).toContain('deferredCleanup.add(path)');
    expect(source).toContain('visible uninstaller will retry them after its window closes');
    expect(source).toContain('uninstall was cancelled before application files were removed');
    expect(source).toContain('Nothing will be reported as fully deleted');
  });

  it('keeps the release installer only in the downloaded package', async () => {
    const source = await readFile('installer/install.mjs', 'utf8');
    expect(source).not.toContain("copyFile(join(sourceRoot, 'installer', 'Install THSV StreamBridge.cmd')");
    expect(source).toContain('installation was cancelled before replacing application files');
  });

  it('can stop the authenticated local service when its PID record is missing', async () => {
    const source = await readFile('launcher/stop.mjs', 'utf8');
    expect(source.indexOf("readFile(configPath, 'utf8')")).toBeLessThan(source.indexOf("readFile(pidPath, 'utf8')"));
    expect(source).toContain('Authenticated localhost shutdown remains available without a PID record.');
    expect(source).toContain("fetch(`${baseUrl}/shutdown`");
    expect(source).toContain('if (pid !== undefined && isAlive(pid))');
    expect(source).toContain('const shutdownTimeoutMs = 15_000');
  });

  it('opens the configured wizard only after verifying the loopback service identity', async () => {
    const source = await readFile('launcher/open-wizard.mjs', 'utf8');
    expect(source).toContain("readFile(configPath, 'utf8')");
    expect(source).toContain('http://127.0.0.1:');
    expect(source).toContain("health?.service !== 'THSV StreamBridge'");
    expect(source).toContain("`${baseUrl}/wizard/`");
  });

  it('does not discard development ownership markers before a spawned child is confirmed stopped', async () => {
    const source = await readFile('tools/dev.mjs', 'utf8');
    expect(source).toContain('await terminateChild(child, 4_000)');
    expect(source).toContain("spawnSync('taskkill.exe'");
    expect(source.indexOf('await terminateChild(child, 4_000)')).toBeLessThan(source.indexOf('await removeOwnedRuntimeMarkers();'));
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
