import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

interface ReleaseFile { readonly path: string; readonly size: number; readonly sha256: string }

async function writePortableRelease(root: string, version: string, marker: string): Promise<void> {
  for (const directory of ['installer', 'launcher', 'runtime', 'app/config', 'app/dist/apps']) await mkdir(join(root, directory), { recursive: true });
  await copyFile('installer/install.mjs', join(root, 'installer', 'install.mjs'));
  await copyFile('installer/apply-update.mjs', join(root, 'installer', 'apply-update.mjs'));
  await copyFile('installer/Install THSV StreamBridge.cmd', join(root, 'installer', 'Install THSV StreamBridge.cmd'));
  for (const name of ['start.mjs', 'start-streaming-tools.mjs', 'stop.mjs', 'open-wizard.mjs', 'set-acceptance-reminder.mjs', 'recovery-bundle.mjs', 'recovery-bundle.ps1', 'uninstall.mjs', 'tray.ps1', 'tray-status.ps1', 'Start THSV StreamBridge.cmd', 'Start THSV Streaming Tools.cmd', 'Stop THSV StreamBridge.cmd', 'Open THSV Setup Wizard.cmd', 'Open THSV StreamBridge Tray.cmd', 'Create THSV Recovery Bundle.cmd', 'Restore THSV Recovery Bundle.cmd', 'Uninstall THSV StreamBridge.cmd']) await copyFile(join('launcher', name), join(root, 'launcher', name));
  await copyFile('tools/start-streamerbot-safely.mjs', join(root, 'launcher', 'start-streamerbot.mjs'));
  await copyFile('Start THSV Streamer.bot Safely.cmd', join(root, 'launcher', 'Start THSV Streamer.bot Safely.cmd'));
  await copyFile(process.execPath, join(root, 'runtime', 'node.exe'));
  await writeFile(join(root, 'runtime', 'NODE-LICENSE.txt'), 'test runtime license\n');
  await writeFile(join(root, 'runtime', 'node-version.txt'), process.version);
  await writeFile(join(root, 'app', 'dist', 'apps', 'bridge-service.js'), `${marker}\n`);
  await writeFile(join(root, 'app', 'config', 'bridge.example.json'), JSON.stringify({
    service: { host: '127.0.0.1', port: 18_787 },
    logging: { directory: 'data/logs' }, security: { controlTokenFile: 'data/runtime/control-token' },
    deduplication: { stateFile: 'data/state/deduplication.json' }, timedActions: { stateFile: 'data/state/timed-actions.json' },
    streamerbot: { deliveryStateFile: 'data/state/delivery-outbox.json' },
  }));
  const paths = [
    'installer/install.mjs', 'installer/apply-update.mjs', 'installer/Install THSV StreamBridge.cmd',
    'launcher/start.mjs', 'launcher/start-streaming-tools.mjs', 'launcher/stop.mjs', 'launcher/open-wizard.mjs', 'launcher/set-acceptance-reminder.mjs', 'launcher/recovery-bundle.mjs', 'launcher/recovery-bundle.ps1', 'launcher/uninstall.mjs', 'launcher/tray.ps1', 'launcher/tray-status.ps1', 'launcher/start-streamerbot.mjs',
    'launcher/Start THSV StreamBridge.cmd', 'launcher/Start THSV Streamer.bot Safely.cmd', 'launcher/Start THSV Streaming Tools.cmd', 'launcher/Stop THSV StreamBridge.cmd', 'launcher/Open THSV Setup Wizard.cmd', 'launcher/Open THSV StreamBridge Tray.cmd', 'launcher/Create THSV Recovery Bundle.cmd', 'launcher/Restore THSV Recovery Bundle.cmd', 'launcher/Uninstall THSV StreamBridge.cmd',
    'runtime/node.exe', 'runtime/NODE-LICENSE.txt', 'runtime/node-version.txt',
    'app/dist/apps/bridge-service.js', 'app/config/bridge.example.json',
  ];
  const files: ReleaseFile[] = [];
  for (const path of paths) {
    const value = await readFile(join(root, path));
    files.push({ path, size: value.length, sha256: createHash('sha256').update(value).digest('hex') });
  }
  const unsignedPayload = JSON.stringify({ schemaVersion: 1, product: 'THSV StreamBridge', version, files });
  await writeFile(join(root, 'unsigned-payload-manifest.json'), unsignedPayload);
  const unsignedPayloadBytes = Buffer.from(unsignedPayload);
  files.push({ path: 'unsigned-payload-manifest.json', size: unsignedPayloadBytes.length, sha256: createHash('sha256').update(unsignedPayloadBytes).digest('hex') });
  await writeFile(join(root, 'release-manifest.json'), JSON.stringify({
    product: 'THSV StreamBridge', layoutVersion: 2, version,
    canonicalDownload: 'https://github.com/surakage/THSV-StreamBridge/releases',
    runtime: { nodeVersion: process.versions.node, platform: 'win32', arch: 'x64' },
    unsignedPayload: { manifestPath: 'unsigned-payload-manifest.json', sha256: createHash('sha256').update(unsignedPayloadBytes).digest('hex'), fileCount: files.length - 1 },
    files,
  }));
}

function install(source: string, destination: string, ...extra: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [join(source, 'installer', 'install.mjs'), '--install-root', destination, '--no-start', '--no-shortcuts', '--skip-acl', ...extra], { encoding: 'utf8', timeout: 60_000 });
}

function installWithHealthCheck(source: string, destination: string, ...extra: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [join(source, 'installer', 'install.mjs'), '--install-root', destination, '--no-shortcuts', '--skip-acl', ...extra], { encoding: 'utf8', timeout: 60_000 });
}

function processOutput(result: ReturnType<typeof spawnSync>): string {
  return `${String(result.stdout)}\n${String(result.stderr)}`;
}

describe('portable Windows release installer', () => {
  it.runIf(process.env['THSV_STARTUP_CHAOS'] === '1')('rolls back an isolated upgrade when the replacement exits before health', async () => {
    if (process.platform !== 'win32') return;
    const temporary = await mkdtemp(join(tmpdir(), 'thsv-chaos-rollback-'));
    const source = join(temporary, 'release'); const destination = join(temporary, 'install');
    try {
      await writePortableRelease(source, '8.0.0', 'throw new Error("previous fixture is intentionally not started")');
      const initial = install(source, destination);
      expect(initial.status, processOutput(initial)).toBe(0);
      await writePortableRelease(source, '8.1.0', 'process.exit(23)');
      const failed = installWithHealthCheck(source, destination);
      expect(failed.status).not.toBe(0);
      expect(processOutput(failed)).toContain('failed its health check and was rolled back');
      const record = JSON.parse(await readFile(join(destination, 'data', 'runtime', 'install-manifest.json'), 'utf8')) as Record<string, unknown>;
      expect(record).toMatchObject({ activeVersion: '8.0.0', failedVersion: '8.1.0' });
      expect(record['rolledBackAt']).toEqual(expect.any(String));
      expect(await readFile(join(destination, 'app', '8.0.0', 'dist', 'apps', 'bridge-service.js'), 'utf8')).toContain('previous fixture');
      await expect(stat(join(destination, 'app', '8.1.0'))).rejects.toThrow();
    } finally { await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  }, 60_000);

  it('uses only the installation-private command-directory token when launching', async () => {
    const source = await readFile('launcher/start.mjs', 'utf8');
    expect(source).toContain("join(dataRoot, 'secrets', 'command-directory-publish-token.txt')");
    expect(source).toContain("childEnvironment['THSV_COMMAND_DIRECTORY_PUBLISH_TOKEN_FILE'] = commandDirectoryTokenPath");
    expect(source).toContain("delete childEnvironment['THSV_COMMAND_DIRECTORY_PUBLISH_TOKEN_FILE']");
    expect(source).toContain('rotateLaunchLog(stdoutPath)');
    expect(source).toContain('rotateLaunchLog(stderrPath)');
    expect(source).toContain('maximumBytes = 5 * 1024 * 1024');
    expect(source).toContain('listeningPidForPort(port)');
    expect(source).toContain('not the StreamBridge process that was just started');
    expect(source).toContain('healthyExistingProcess(baseUrl, config.service.port)');
    expect(source).toContain("process.argv.includes('--restart')");
    expect(source).toContain("'already-healthy'");
    expect(source).toContain("'last-startup-report.json'");
    expect(source).toContain("'startup-reports.jsonl'");
    expect(source).toContain("'bridge-configuration'");
    expect(source).toContain("'port-conflict'");
    expect(source).toContain("'bridge-health-timeout'");
    expect(source.indexOf("child.once('spawn'")).toBeLessThan(source.indexOf('await writeFile(pidPath'));
  });

  it('installs side by side, preserves creator data, rejects downgrades, and generates unique per-install tokens', async () => {
    if (process.platform !== 'win32') return;
    const temporary = await mkdtemp(join(tmpdir(), 'thsv-portable-release-'));
    const source = join(temporary, 'release'); const firstInstall = join(temporary, 'creator one'); const secondInstall = join(temporary, 'creator two');
    await writePortableRelease(source, '2.0.0', 'first');
    const firstResult = install(source, firstInstall);
    expect(firstResult.status, processOutput(firstResult)).toBe(0);
    const firstToken = (await readFile(join(firstInstall, 'data', 'secrets', 'control-token'), 'utf8')).trim();
    expect(Buffer.from(firstToken, 'base64url')).toHaveLength(32);
    const firstRecoveryKey = await readFile(join(firstInstall, 'THSV StreamBridge Recovery Key.txt'), 'utf8');
    expect(firstRecoveryKey).toContain(`Control token: ${firstToken}`);
    expect(firstRecoveryKey).toContain(`Installed folder: ${firstInstall}`);
    expect(await readFile(join(firstInstall, 'app', '2.0.0', 'dist', 'apps', 'bridge-service.js'), 'utf8')).toBe('first\n');
    await expect(stat(join(firstInstall, 'Install THSV StreamBridge.cmd'))).rejects.toThrow();
    const configuration = JSON.parse(await readFile(join(firstInstall, 'data', 'configuration', 'bridge.local.json'), 'utf8')) as { security: { controlTokenFile: string }; logging: { directory: string } };
    expect(configuration.security.controlTokenFile).toBe(join(firstInstall, 'data', 'secrets', 'control-token'));
    expect(configuration.logging.directory).toBe(join(firstInstall, 'data', 'logs'));
    const installedWizardLauncher = await readFile(join(firstInstall, 'Open THSV Setup Wizard.cmd'), 'utf8');
    expect(installedWizardLauncher.indexOf('launcher\\open-wizard.mjs')).toBeLessThan(installedWizardLauncher.indexOf('launcher\\start.mjs" --open-wizard'));
    const installedSecureOpener = await readFile(join(firstInstall, 'launcher', 'open-wizard.mjs'), 'utf8');
    expect(installedSecureOpener).toContain('/wizard/api/unlock-tickets');
    expect(installedSecureOpener).toContain("query.set('guided', '1')");
    expect(installedSecureOpener).toContain('#unlock=${ticketResult.ticket}');
    expect(processOutput(firstResult)).toContain(`Wizard recovery key saved to: ${join(firstInstall, 'THSV StreamBridge Recovery Key.txt')}`);
    expect(processOutput(firstResult)).toContain(`One-button Stream Deck target: ${join(firstInstall, 'Start THSV Streaming Tools.cmd')}`);
    expect(processOutput(firstResult)).toContain('One Streamer.bot import. Choose your features, download one .sb file, import it once');
    expect(processOutput(firstResult)).toContain(`Notification-area shell: ${join(firstInstall, 'Open THSV StreamBridge Tray.cmd')}`);
    expect(processOutput(firstResult)).not.toContain(firstToken);
    expect(processOutput(firstResult)).not.toContain('older StreamBridge desktop shortcut could not be removed');
    expect(await readFile(join(firstInstall, 'Start THSV Streamer.bot Safely.cmd'), 'utf8')).toContain('launcher\\start-streamerbot.mjs');
    expect(await readFile(join(firstInstall, 'Start THSV Streaming Tools.cmd'), 'utf8')).toContain('launcher\\start-streaming-tools.mjs');
    expect(await readFile(join(firstInstall, 'Open THSV StreamBridge Tray.cmd'), 'utf8')).toContain('launcher\\tray.ps1');
    expect(await readFile(join(firstInstall, 'launcher', 'start-streamerbot.mjs'), 'utf8')).toContain('streamerbot-launcher.json');
    await writeFile(join(firstInstall, 'data', 'state', 'creator-state.json'), '{"preserved":true}\n');
    await writeFile(join(firstInstall, 'data', 'configuration', 'streamerbot-launcher.json'), JSON.stringify({ version: 2, executable: 'C:\\Portable\\Streamer.bot.exe', websocketPort: 8081, optionalApps: { obs: { executable: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe', enabled: true }, speakerbot: { executable: 'D:\\Tools\\Speaker.bot.exe', enabled: false } } }));
    await writeFile(join(firstInstall, 'addons', 'state', 'creator-addon.json'), '{"preserved":true}\n');
    for (const obsolete of ['dist', 'docs', 'wizard', 'streamerbot-imports-3.0.0', 'streamerbot-imports-3.5.0']) {
      await mkdir(join(firstInstall, obsolete), { recursive: true });
      await writeFile(join(firstInstall, obsolete, 'obsolete.txt'), 'remove me\n');
    }
    await mkdir(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.legacy-addon'), { recursive: true });
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.legacy-addon', 'module-package.json'), '{"manifest":{"moduleId":"thsv.legacy-addon","version":"2.0.0"}}\n');
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.legacy-addon', 'installed-package.json'), '{"moduleId":"thsv.legacy-addon","version":"2.0.0","enabled":true,"approvedActionIds":["action-one"]}\n');
    await mkdir(join(firstInstall, 'app', '2.0.0', 'addons', 'state', 'thsv.legacy-addon'), { recursive: true });
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'state', 'thsv.legacy-addon', 'settings.json'), '{"legacy":true}\n');
    await mkdir(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.viewer-foundation'), { recursive: true });
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.viewer-foundation', 'module-package.json'), '{"manifest":{"moduleId":"thsv.viewer-foundation","version":"2.0.0"}}\n');
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.viewer-foundation', 'installed-package.json'), '{"moduleId":"thsv.viewer-foundation","version":"2.0.0","enabled":true}\n');
    await mkdir(join(firstInstall, 'app', '2.0.0', 'addons', 'state', 'thsv.viewer-foundation'), { recursive: true });
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'state', 'thsv.viewer-foundation', 'settings.json'), '{"currencyName":"Legacy Leaves"}\n');
    await mkdir(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.community-analytics'), { recursive: true });
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.community-analytics', 'module-package.json'), '{"manifest":{"moduleId":"thsv.community-analytics","version":"2.0.0"}}\n');
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.community-analytics', 'installed-package.json'), '{"moduleId":"thsv.community-analytics","version":"2.0.0","enabled":true}\n');
    await mkdir(join(firstInstall, 'app', '2.0.0', 'addons', 'state', 'thsv.community-analytics'), { recursive: true });
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'state', 'thsv.community-analytics', 'settings.json'), '{"retainedSessions":17}\n');
    await mkdir(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.kofi-donations'), { recursive: true });
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.kofi-donations', 'module-package.json'), '{"manifest":{"moduleId":"thsv.kofi-donations","version":"2.0.0"}}\n');
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'packages', 'thsv.kofi-donations', 'installed-package.json'), '{"moduleId":"thsv.kofi-donations","version":"2.0.0","enabled":true}\n');
    await mkdir(join(firstInstall, 'app', '2.0.0', 'addons', 'state', 'thsv.kofi-donations'), { recursive: true });
    await writeFile(join(firstInstall, 'app', '2.0.0', 'addons', 'state', 'thsv.kofi-donations', 'settings.json'), '{"enabled":true,"channelName":"Legacy Tips"}\n');

    await writePortableRelease(source, '2.1.0', 'second');
    const upgrade = install(source, firstInstall);
    expect(upgrade.status, processOutput(upgrade)).toBe(0);
    expect((await readFile(join(firstInstall, 'data', 'secrets', 'control-token'), 'utf8')).trim()).toBe(firstToken);
    expect(await readFile(join(firstInstall, 'THSV StreamBridge Recovery Key.txt'), 'utf8')).toContain(`Control token: ${firstToken}`);
    expect(await readFile(join(firstInstall, 'data', 'state', 'creator-state.json'), 'utf8')).toContain('preserved');
    expect(await readFile(join(firstInstall, 'data', 'configuration', 'streamerbot-launcher.json'), 'utf8')).toContain('Portable');
    expect(await readFile(join(firstInstall, 'data', 'configuration', 'streamerbot-launcher.json'), 'utf8')).toContain('optionalApps');
    expect(await readFile(join(firstInstall, 'data', 'configuration', 'streamerbot-launcher.json'), 'utf8')).toContain('obs64.exe');
    expect(await readFile(join(firstInstall, 'addons', 'state', 'creator-addon.json'), 'utf8')).toContain('preserved');
    for (const obsolete of ['dist', 'docs', 'wizard', 'streamerbot-imports-3.0.0', 'streamerbot-imports-3.5.0']) {
      await expect(stat(join(firstInstall, obsolete))).rejects.toThrow();
    }
    expect(await readFile(join(firstInstall, 'addons', 'packages', 'thsv.legacy-addon', 'module-package.json'), 'utf8')).toContain('thsv.legacy-addon');
    expect(JSON.parse(await readFile(join(firstInstall, 'addons', 'packages', 'thsv.legacy-addon', 'installed-package.json'), 'utf8'))).toMatchObject({ enabled: false, approvedActionIds: ['action-one'] });
    expect(await readFile(join(firstInstall, 'addons', 'migration-inbox', 'thsv.legacy-addon', 'state', 'settings.json'), 'utf8')).toContain('legacy');
    expect(JSON.parse(await readFile(join(firstInstall, 'addons', 'migration-inbox', 'feature-migrations.json'), 'utf8'))).toMatchObject({ version: 1, candidates: [expect.objectContaining({ moduleId: 'thsv.legacy-addon', originalEnabled: true })] });
    expect(await readFile(join(firstInstall, 'addons', 'state', 'thsv.viewer-foundation', 'settings.json'), 'utf8')).toContain('Legacy Leaves');
    expect(await readFile(join(firstInstall, 'addons', 'state', 'thsv.community-analytics', 'settings.json'), 'utf8')).toContain('17');
    expect(await readFile(join(firstInstall, 'addons', 'state', 'thsv.kofi-donations', 'settings.json'), 'utf8')).toContain('Legacy Tips');
    await expect(stat(join(firstInstall, 'addons', 'packages', 'thsv.viewer-foundation'))).rejects.toThrow();
    await expect(stat(join(firstInstall, 'addons', 'packages', 'thsv.community-analytics'))).rejects.toThrow();
    await expect(stat(join(firstInstall, 'addons', 'packages', 'thsv.kofi-donations'))).rejects.toThrow();
    await expect(stat(join(firstInstall, 'addons', 'state', 'thsv.legacy-addon', 'settings.json'))).rejects.toThrow();
    const upgradedRecord = JSON.parse(await readFile(join(firstInstall, 'data', 'runtime', 'install-manifest.json'), 'utf8')) as { readonly activeVersion?: unknown; readonly previousVersion?: unknown; readonly buildFingerprint?: unknown; readonly releaseManifestSha256?: unknown; readonly fileCount?: unknown };
    expect(upgradedRecord).toMatchObject({ activeVersion: '2.1.0' });
    expect(typeof upgradedRecord.fileCount).toBe('number');
    expect(upgradedRecord.buildFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(upgradedRecord.releaseManifestSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(upgradedRecord).not.toHaveProperty('previousVersion');
    await expect(stat(join(firstInstall, 'app', '2.0.0'))).rejects.toThrow();

    await writePortableRelease(source, '2.0.0', 'downgrade');
    const downgrade = install(source, firstInstall);
    expect(downgrade.status).not.toBe(0);
    expect(processOutput(downgrade)).toContain('Refusing to downgrade');

    const secondResult = install(source, secondInstall);
    expect(secondResult.status, processOutput(secondResult)).toBe(0);
    const secondToken = (await readFile(join(secondInstall, 'data', 'secrets', 'control-token'), 'utf8')).trim();
    expect(secondToken).not.toBe(firstToken);
    expect(await readFile(join(secondInstall, 'THSV StreamBridge Recovery Key.txt'), 'utf8')).toContain(`Control token: ${secondToken}`);

    // cmd.exe's own `/c` argument parsing has an undocumented failure mode for some multi-word
    // quoted paths (it mis-splits the token on whitespace instead of resolving the file), so the
    // uninstaller is launched through PowerShell's `&` call operator instead, which handles a
    // quoted path with spaces correctly and is what a real double-click (via Explorer's own file
    // association) also ultimately resolves to.
    const uninstall = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "& '.\\Uninstall THSV StreamBridge.cmd'"], { cwd: firstInstall, encoding: 'utf8', timeout: 30_000, input: '\n' });
    expect(uninstall.status, processOutput(uninstall)).toBe(0);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500));
    expect(await readFile(join(firstInstall, 'data', 'state', 'creator-state.json'), 'utf8')).toContain('preserved');
    expect(await readFile(join(firstInstall, 'addons', 'state', 'creator-addon.json'), 'utf8')).toContain('preserved');
    expect(await readFile(join(firstInstall, 'THSV StreamBridge Recovery Key.txt'), 'utf8')).toContain(`Control token: ${firstToken}`);
    await expect(stat(join(firstInstall, 'app'))).rejects.toThrow();
    await expect(stat(join(firstInstall, 'Uninstall THSV StreamBridge.cmd'))).rejects.toThrow();
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

  it('rejects release versions that could escape the versioned application directory', async () => {
    if (process.platform !== 'win32') return;
    const temporary = await mkdtemp(join(tmpdir(), 'thsv-portable-version-'));
    const source = join(temporary, 'release'); const destination = join(temporary, 'install');
    await writePortableRelease(source, '1.2.3/../../../outside', 'unsafe');
    const result = install(source, destination);
    expect(result.status).not.toBe(0);
    expect(processOutput(result)).toContain('release-manifest.json is invalid');
    await expect(stat(join(temporary, 'outside'))).rejects.toThrow();
  }, 60_000);

  it('removes application contents and defers only locked directory shells', async () => {
    if (process.platform !== 'win32') return;
    const temporary = await mkdtemp(join(tmpdir(), 'thsv-portable-lock-'));
    const source = join(temporary, 'release'); const destination = join(temporary, 'install');
    await writePortableRelease(source, '2.0.0', 'locked');
    const result = install(source, destination);
    expect(result.status, processOutput(result)).toBe(0);
    const versionRoot = join(destination, 'app', '2.0.0');
    const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: versionRoot, stdio: 'ignore', windowsHide: true });
    try {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
      const uninstall = spawnSync(process.execPath, [join(destination, 'launcher', 'uninstall.mjs'), '--install-root', destination], { encoding: 'utf8', timeout: 30_000 });
      expect(uninstall.status, processOutput(uninstall)).toBe(0);
      expect(processOutput(uninstall)).toContain('visible uninstaller will retry them after its window closes');
      expect(await readdir(versionRoot)).toEqual([]);
      expect(await stat(join(destination, 'data'))).toBeDefined();
      expect(await stat(join(destination, 'addons'))).toBeDefined();
    } finally {
      holder.kill('SIGTERM');
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
      await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }, 60_000);
});
