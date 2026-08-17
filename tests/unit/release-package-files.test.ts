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
    expect(source).toContain('start-streamerbot-safely.mjs');
    expect(source).toContain('Start THSV Streamer.bot Safely.cmd');
    expect(source).toContain('function Get-Sha256Hex');
    expect(source).toContain('[System.Security.Cryptography.SHA256]::Create()');
    expect(source).toContain('release-manifest.json');
    expect(source).toContain("Get-ChildItem -LiteralPath (Join-Path $repo 'addons') -Directory");
    expect(source).toContain('npm.cmd run addon:package -- $_.FullName $addOnArchive');
    expect(source).toContain('THSV-StreamBridge-AddOn-');
    expect(source).toContain("Get-ChildItem -LiteralPath $resolvedPackages -Filter 'THSV-StreamBridge-*.zip*'");
    expect(source).toContain("Where-Object { $_.Name -notlike 'THSV-StreamBridge-AddOn-*' }");
    expect(source).toContain('THSV-StreamBridge-AddOns-index.json');
    expect(source).toContain("trustModel = 'GitHub release asset hashes plus GitHub artifact attestations; no silent install or auto-enable.'");
    expect(source).toContain('revoked = @()');
    expect(source).toContain("Join-Path $bundleRoot 'Streamer.bot'");
    expect(source).toContain('$hasStreamerBotPackage = Test-Path -LiteralPath $streamerBotManifestPath');
    expect(source).toContain('No Streamer.bot import is required. This add-on uses the existing normalized-event and capability-broker connection.');
    expect(source).not.toContain('is missing its separate Streamer.bot package');
    expect(source).toContain("Get-ChildItem -LiteralPath (Join-Path $repo 'packages\\streamerbot') -Directory | ForEach-Object");
    expect(source).toContain('selective, version-matched Streamer.bot package');
    expect(source).toContain('$bundledExtensionIds');
    expect(source).toContain('do not publish a second');
    expect(source.indexOf("if ($bundledExtensionIds -contains $currentModuleId)")).toBeLessThan(source.indexOf('$bundleName = "THSV-StreamBridge-AddOn-'));
    expect(source).toContain("Join-Path $appRoot 'packages\\extensions'");
    expect(source).toContain("Join-Path $appRoot 'integrations\\viewer-foundation'");
    expect(source).toContain("Join-Path $repo 'addons\\viewer-foundation'");
    expect(source).toContain("Join-Path $appRoot 'integrations\\community-analytics'");
    expect(source).toContain("Join-Path $repo 'addons\\community-analytics'");
    expect(source).toContain("Join-Path $appRoot 'integrations\\kofi-donations'");
    expect(source).toContain("Join-Path $repo 'addons\\kofi-donations'");
    expect(source).not.toContain("+ @('thsv.viewer-foundation')");
    expect(source).toContain('thsv-addon")');
    expect(source).toContain('$indexedStreamerBotFolders');
    expect(source).toContain('Release staging contains unindexed Streamer.bot packages');
    expect(source).toContain('Release staging has a mismatched Streamer.bot manifest');
    expect(source).toContain('Release staging has a mismatched Streamer.bot import');
    expect(source).toContain('Normal setup should use the wizard-generated universal import');
    expect(source).toContain('*.thsv-addon*');
    expect(source).toContain("'wizard'");
    expect(source).toContain('$releaseDocs');
    expect(source).toContain("'streamerbot-csharp-references.md'");
    for (const currentGuide of ['complete-setup-guide.md', 'future-projects-and-addons.md', 'kofi-donations.md', 'module-system.md', 'product-scope.md', 'release-candidate-status.md', 'scene-actions.md', 'viewer-foundation.md']) expect(source).toContain(`'${currentGuide}'`);
    expect(source).toContain("Get-ChildItem -LiteralPath $_.FullName -Filter '*.sb'");
    expect(source).toContain("Remove-Item -LiteralPath (Join-Path $appRoot 'package-lock.json')");
    expect(source).toContain("Remove-Item -LiteralPath (Join-Path $appRoot 'node_modules\\.package-lock.json')");
    expect(source).toContain("'app\\examples'");
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
    expect(backup).toContain('function Get-Sha256Hex');
    expect(backup).toContain('[System.Security.Cryptography.SHA256]::Create()');
    expect(restore).toContain('[switch]$ApproveRestore');
    expect(restore.indexOf('Get-Sha256Hex $path')).toBeLessThan(restore.indexOf("& (Join-Path $repo 'scripts\\backup.ps1')"));
    expect(restore).toContain('.restore-rollback-');
  });

  it('protects installer staging without relying on a PowerShell ACL module or unavailable static method', async () => {
    const installer = await readFile('scripts/install-release.ps1', 'utf8');
    expect(installer).toContain("Join-Path $env:SystemRoot 'System32\\icacls.exe'");
    expect(installer).toContain("'*S-1-5-18:(OI)(CI)F'");
    expect(installer).toContain("'*S-1-5-32-544:(OI)(CI)F'");
    expect(installer).not.toContain('Set-Acl');
    expect(installer).not.toContain('[System.IO.Directory]::SetAccessControl');
  });

  it('verifies before private staging and preserves creator data in versioned installations', async () => {
    const source = await readFile('installer/install.mjs', 'utf8');
    expect(source.indexOf('await verifyRelease(sourceRoot, manifest)')).toBeLessThan(source.indexOf('await mkdir(installRoot'));
    expect(source).toContain("join(installRoot, 'app', manifest.version)");
    expect(source).toContain("join(destination, 'addons', 'packages')");
    expect(source).toContain("join(root, 'secrets', 'control-token')");
    expect(source).toContain('randomBytes(32).toString');
    expect(source).toContain('Wizard recovery key saved to:');
    expect(source).toContain('`${PRODUCT} Recovery Key.txt`');
    expect(source).toContain('protectPrivateFile(recoveryKeyPath)');
    expect(source).not.toContain('process.stdout.write(controlToken');
    expect(source).toContain('THSV StreamBridge Folder.lnk');
    expect(source).toContain('THSV Streaming Tools.lnk');
    expect(source).toContain('removeLegacyConvenienceShortcuts(installRoot)');
    expect(source).toContain("process.platform !== 'win32' || argumentsMap.has('no-shortcuts')");
    expect(source).not.toContain('$tools.Save()');
    expect(source).toContain('One-button Stream Deck target:');
    expect(source).toContain('previousVersion');
    expect(source).toContain('failed its health check and was rolled back');
    expect(source.indexOf('await rollbackDirectories(moved)')).toBeLessThan(source.indexOf("const recovery = spawnSync(join(runtimeTarget, 'node.exe')"));
    expect(source).toContain('cleanup is best-effort');
    expect(source).toContain('compareVersions');
    expect(source).toContain('Refusing to downgrade ${PRODUCT}');
    expect(source).not.toMatch(/Invoke-Expression|DownloadString|WebClient|npm\.cmd/u);
  });

  it('removes a creator-made one-button shortcut only during uninstall, not during upgrades', async () => {
    const installer = await readFile('installer/install.mjs', 'utf8');
    const uninstaller = await readFile('launcher/uninstall.mjs', 'utf8');
    expect(installer).not.toContain("'Start THSV Streaming Tools.lnk'");
    expect(uninstaller).toContain("'Start THSV Streaming Tools.lnk'");
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
      ['Start THSV StreamBridge.cmd', '[SUCCESS] THSV StreamBridge is running.', '[FAILED] THSV StreamBridge could not be started.', 'exit /b %THSV_LAUNCH_EXIT%'],
      ['../Start THSV Streamer.bot Safely.cmd', '[SUCCESS] Streamer.bot is ready for StreamBridge.', '[FAILED] Streamer.bot was not changed unsafely.', 'exit /b %THSV_SAFE_START_EXIT%'],
      ['Start THSV Streaming Tools.cmd', '[SUCCESS] Your THSV streaming tools are ready.', '[FAILED] One or more streaming tools are not ready.', 'exit /b %THSV_TOOLS_EXIT%'],
      ['Stop THSV StreamBridge.cmd', '[SUCCESS] THSV StreamBridge is stopped.', '[FAILED] THSV StreamBridge could not be stopped cleanly.', 'exit /b %THSV_LAUNCH_EXIT%'],
      ['Open THSV Setup Wizard.cmd', '[SUCCESS] The setup wizard was opened.', '[FAILED] The setup wizard could not be opened.', 'exit /b %THSV_LAUNCH_EXIT%'],
    ] as const;
    for (const [name, success, failure, exit] of expectations) {
      const source = await readFile(`launcher/${name}`, 'utf8');
      expect(source).toContain(success);
      expect(source).toContain(failure);
      expect(source).toContain('pause >nul');
      expect(source).toContain(exit);
      if (name === 'Start THSV Streaming Tools.cmd') {
        expect(source).toContain('runtime\\node.exe" -e "setTimeout(function(){},2000)"');
        expect(source).not.toContain('timeout /t');
        expect(source.indexOf('exit /b 0')).toBeLessThan(source.indexOf('pause >nul'));
      }
    }
    const openWizard = await readFile('launcher/Open THSV Setup Wizard.cmd', 'utf8');
    expect(openWizard).toContain('launcher\\open-wizard.mjs');
    expect(openWizard).toContain('launcher\\start.mjs" --open-wizard');
    expect(openWizard.indexOf('launcher\\open-wizard.mjs')).toBeLessThan(openWizard.indexOf('launcher\\start.mjs" --open-wizard'));
    expect(openWizard).toContain('Opening the setup wizard without interrupting a healthy Bridge.');
  });

  it('requires an explicit switch before deleting creator data', async () => {
    const source = await readFile('launcher/uninstall.mjs', 'utf8');
    expect(source).toContain("process.argv.includes('--delete-user-data')");
    expect(source).toContain("process.argv.includes('--confirm-delete-everything')");
    expect(source).toContain('Creator configuration, add-ons, state, logs, backups, and secrets were preserved');
    expect(source).toContain('removeConvenienceShortcuts');
    expect(source).toContain('Start THSV Streaming Tools.cmd');
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

  it('packages a delayed verified-update helper for one-click offline upgrades', async () => {
    const packaging = await readFile('scripts/package-release.ps1', 'utf8');
    const helper = await readFile('installer/apply-update.mjs', 'utf8');
    expect(packaging).toContain("installer\\apply-update.mjs");
    expect(helper).toContain('await delay(1_500)');
    expect(helper).toContain("join(sourceRoot, 'installer', 'install.mjs')");
    expect(helper).toContain("join(logRoot, 'last-update.log')");
    expect(helper).not.toMatch(/Invoke-Expression|DownloadString|WebClient/u);
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
    expect(source).toContain("`${baseUrl}/wizard/api/unlock-tickets`");
    expect(source).toContain("`${baseUrl}/wizard/#unlock=${ticketResult.ticket}`");
    expect(source).not.toContain("`${baseUrl}/wizard/#unlock=${token}`");
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

  it('packages direct dependency and provider notices', async () => {
    const packageSource = await readFile('scripts/package-release.ps1', 'utf8');
    const notices = await readFile('THIRD-PARTY-NOTICES.md', 'utf8');
    expect(packageSource).toContain("'THIRD-PARTY-NOTICES.md'");
    expect(packageSource).toContain('npm.cmd ci --omit=dev --ignore-scripts');
    expect(packageSource).toContain('NODE-LICENSE.txt');
    expect(notices).toContain('| `ws` | `8.21.1` | MIT |');
    expect(notices).toContain('| `zod` | `4.4.3` | MIT |');
    expect(notices).toContain('Optional Village Fun Commands content providers');
  });
});
