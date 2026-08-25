import { execFile, execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface StreamerBotLauncherCandidate {
  readonly executable: string;
  readonly source: 'saved' | 'running' | 'common-location' | 'near-saved-location';
}

export interface StreamerBotLauncherStatus {
  readonly supported: boolean;
  readonly configured: boolean;
  readonly executable?: string;
  readonly executableExists: boolean;
  readonly websocketPort: number;
  readonly state: 'not-configured' | 'missing' | 'stopped' | 'ready' | 'port-conflict' | 'unsupported';
  readonly processId?: number;
  readonly portOwnerName?: string;
  readonly message: string;
  readonly installRoot: string;
  readonly streamDeckTarget: string;
  readonly optionalApps: Readonly<Record<OptionalApplication, OptionalApplicationStatus>>;
  readonly lastStartupReport?: StartupReportSummary;
}

export interface StartupReportSummary {
  readonly timestamp: string;
  readonly startedAt?: string;
  readonly startupRunId?: string;
  readonly launcher: string;
  readonly requestedAction: string;
  readonly outcome: string;
  readonly category: string;
  readonly message: string;
  readonly phase?: string;
  readonly attempt?: number;
  readonly durationMs?: number;
  readonly readinessBlockers?: readonly StartupReadinessBlocker[];
  readonly pid?: number;
  readonly port?: number;
  readonly version?: string;
}

export interface StartupReadinessBlocker {
  readonly kind: string;
  readonly name: string;
  readonly state: string;
  readonly message: string;
  readonly recovery: string;
}

export type OptionalApplication = 'obs' | 'meld' | 'streamlabs' | 'speakerbot';
const OPTIONAL_APPLICATIONS = ['obs', 'meld', 'streamlabs', 'speakerbot'] as const satisfies readonly OptionalApplication[];

export interface OptionalApplicationStatus {
  readonly application: OptionalApplication;
  readonly label: string;
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly executable?: string;
  readonly executableExists: boolean;
  readonly running: boolean;
  readonly processId?: number;
  readonly state: 'disabled' | 'not-configured' | 'missing' | 'stopped' | 'running' | 'different-installation-running' | 'unsupported';
  readonly differentInstallationProcessId?: number;
  readonly differentInstallationExecutable?: string;
  readonly recentStartupFailures?: number;
  readonly circuitOpenUntil?: string;
  readonly message: string;
}

export interface OptionalApplicationCandidate {
  readonly application: OptionalApplication;
  readonly executable: string;
  readonly source: 'saved' | 'running' | 'common-location' | 'near-saved-location';
}

interface LauncherConfiguration {
  readonly version: 2;
  readonly executable: string;
  readonly websocketPort: number;
  readonly optionalApps: Partial<Record<OptionalApplication, { readonly executable: string; readonly enabled: boolean }>>;
  readonly updatedAt: string;
}

interface ProcessIdentity { readonly pid: number; readonly name: string; readonly path?: string }

export class StreamerBotLauncherService {
  private readonly configurationPath: string;
  private readonly installRoot: string;
  private optionalProcessCache: { readonly expiresAt: number; readonly processes: readonly ProcessIdentity[] } | undefined;

  public constructor(private readonly dataRoot: string, private readonly websocketUrl: string, private readonly platform: NodeJS.Platform = process.platform) {
    this.installRoot = resolve(dataRoot, '..');
    this.configurationPath = join(dataRoot, 'configuration', 'streamerbot-launcher.json');
  }

  public async status(): Promise<StreamerBotLauncherStatus> {
    const port = this.websocketPort();
    const lastStartupReport = await this.readLastStartupReport();
    const location = { ...this.locationFields(), ...(lastStartupReport === undefined ? {} : { lastStartupReport }) };
    const optionalApps = await this.optionalApplicationStatuses();
    if (this.platform !== 'win32') return { ...location, optionalApps, supported: false, configured: false, executableExists: false, websocketPort: port, state: 'unsupported', message: 'Safe Streamer.bot launch is available on Windows only.' };
    const configuration = await this.readConfiguration();
    if (configuration === undefined) return { ...location, optionalApps, supported: true, configured: false, executableExists: false, websocketPort: port, state: 'not-configured', message: 'Select Streamer.bot.exe once, or use automatic detection.' };
    const executableExists = await isFile(configuration.executable);
    if (!executableExists) return { ...location, optionalApps, supported: true, configured: true, executable: configuration.executable, executableExists: false, websocketPort: port, state: 'missing', message: 'The saved Streamer.bot.exe was moved or removed. Select it again.' };
    const listener = listenerForPort(port);
    if (listener === undefined) return { ...location, optionalApps, supported: true, configured: true, executable: configuration.executable, executableExists: true, websocketPort: port, state: 'stopped', message: 'Streamer.bot is configured but its WebSocket server is not currently listening.' };
    const owner = processIdentity(listener);
    if (owner?.path !== undefined && samePath(owner.path, configuration.executable)) return { ...location, optionalApps, supported: true, configured: true, executable: configuration.executable, executableExists: true, websocketPort: port, state: 'ready', processId: listener, portOwnerName: owner.name, message: 'Streamer.bot is ready and owns the configured WebSocket port.' };
    return { ...location, optionalApps, supported: true, configured: true, executable: configuration.executable, executableExists: true, websocketPort: port, state: 'port-conflict', processId: listener, portOwnerName: owner?.name ?? 'Unknown process', message: `Port ${String(port)} belongs to ${owner?.name ?? 'another process'} (PID ${String(listener)}). It will not be stopped automatically.` };
  }

  public async endpointApplicationStatus(application: 'obs' | 'meld' | 'streamlabs', endpoint: string): Promise<Readonly<{ configured: boolean; running: boolean; executableName?: string; processId?: number; differentInstallationProcessId?: number; state: string }>> {
    const status = (await this.status()).optionalApps[application];
    let port: number; try { const parsed = new URL(endpoint); port = Number(parsed.port || (parsed.protocol === 'wss:' ? 443 : 80)); } catch { return { configured: status.configured, running: false, state: 'invalid-endpoint' }; }
    const pid = listenerForPort(port); const owner = pid === undefined ? undefined : processIdentity(pid); const expected = status.executable;
    if (pid !== undefined && owner?.path !== undefined && expected !== undefined) {
      const exact = samePath(owner.path, expected);
      return { configured: true, running: exact, executableName: basename(expected), ...(exact ? { processId: pid } : { differentInstallationProcessId: pid }), state: exact ? 'running' : 'different-installation-running' };
    }
    return { configured: status.configured, running: false, ...(expected === undefined ? {} : { executableName: basename(expected) }), ...(status.differentInstallationProcessId === undefined ? {} : { differentInstallationProcessId: status.differentInstallationProcessId }), state: status.state };
  }

  /** Returns the local Streamer.bot action database selected by the creator. */
  public async actionsPath(): Promise<string | undefined> {
    const configuration = await this.readConfiguration();
    return configuration === undefined ? undefined : join(dirname(configuration.executable), 'data', 'actions.json');
  }

  public async isRunning(): Promise<boolean> {
    const status = await this.status();
    return status.state === 'ready' || status.state === 'port-conflict';
  }

  public async detect(): Promise<{ readonly candidates: readonly StreamerBotLauncherCandidate[]; readonly optionalCandidates: readonly OptionalApplicationCandidate[]; readonly status: StreamerBotLauncherStatus }> {
    this.optionalProcessCache = undefined;
    const candidates = new Map<string, StreamerBotLauncherCandidate>();
    const add = async (path: string | undefined, source: StreamerBotLauncherCandidate['source']): Promise<void> => {
      if (path === undefined || basename(path).toLocaleLowerCase('en-US') !== 'streamer.bot.exe' || !await isFile(path)) return;
      const absolute = resolve(path); const key = absolute.toLocaleLowerCase('en-US');
      if (!candidates.has(key)) candidates.set(key, { executable: absolute, source });
    };
    const savedExecutable = (await this.readConfiguration())?.executable;
    await add(savedExecutable, 'saved');
    for (const nearby of await nearbyExecutableCandidates(savedExecutable, ['streamer.bot.exe'])) await add(nearby, 'near-saved-location');
    for (const processValue of streamerBotProcesses()) await add(processValue.path, 'running');
    const profile = process.env['USERPROFILE']; const local = process.env['LOCALAPPDATA'];
    for (const path of [
      local ? join(local, 'Streamer.bot', 'Streamer.bot.exe') : undefined,
      profile ? join(profile, 'Desktop', 'Streamer.bot', 'Streamer.bot.exe') : undefined,
      profile ? join(profile, 'Downloads', 'Streamer.bot', 'Streamer.bot.exe') : undefined,
    ]) await add(path, 'common-location');
    return { candidates: [...candidates.values()], optionalCandidates: await this.detectOptionalApplications(), status: await this.status() };
  }

  public async preflight(): Promise<Readonly<Record<string, unknown>>> {
    const status = await this.status();
    const repair = status.state === 'missing' || status.state === 'not-configured' ? await this.detect() : undefined;
    const launcherFiles = await Promise.all([
      { label: 'all-tools launcher', path: join(this.installRoot, 'launcher', 'start-streaming-tools.mjs') },
      { label: 'Streamer.bot launcher', path: join(this.installRoot, 'launcher', 'start-streamerbot.mjs') },
      { label: 'desktop command', path: this.locationFields().streamDeckTarget },
    ].map(async ({ label, path }) => ({ label, ready: await isFile(path), filename: basename(path) })));
    const configuredPaths = [status.executable, ...Object.values(status.optionalApps).map((application) => application.executable)].filter((path): path is string => typeof path === 'string');
    const versions = applicationVersions(configuredPaths);
    const checks = [
      { id: 'streamerbot-path', label: 'Exact Streamer.bot path', ready: status.configured && status.executableExists, detail: status.message, recovery: status.configured ? 'Reselect Streamer.bot.exe in the Wizard.' : 'Choose Streamer.bot.exe in the Wizard.' },
      { id: 'streamerbot-websocket', label: 'Streamer.bot WebSocket', ready: status.state === 'ready', detail: status.state === 'ready' ? `Ready on port ${String(status.websocketPort)}.` : `Not automation-ready on port ${String(status.websocketPort)} (${status.state}).`, recovery: 'Start Streamer.bot and confirm WebSocket Auto Start is enabled.' },
      ...launcherFiles.map((file) => ({ id: `launcher-${file.filename}`, label: file.label, ready: file.ready, detail: file.ready ? `${file.filename} is installed.` : `${file.filename} is missing.`, recovery: 'Repair or reinstall the current StreamBridge release.' })),
      ...Object.values(status.optionalApps).filter((application) => application.enabled).map((application) => ({ id: `optional-${application.application}`, label: `${application.label} startup`, ready: application.executableExists && application.circuitOpenUntil === undefined, detail: application.message, recovery: application.executableExists ? 'Run the app manually and retry after its circuit pause.' : `Reselect ${application.label} in the Wizard.` })),
    ];
    return {
      generatedAt: new Date().toISOString(), mutationFree: true, ready: checks.every((check) => check.ready), checks, launcher: status,
      versions,
      repairCandidates: repair === undefined ? [] : repair.candidates.map((candidate) => ({ ...candidate, requiresCreatorConfirmation: true })),
      optionalRepairCandidates: repair === undefined ? [] : repair.optionalCandidates.map((candidate) => ({ ...candidate, requiresCreatorConfirmation: true })),
    };
  }

  public async supportSnapshot(): Promise<Readonly<Record<string, unknown>>> {
    const preflight = await this.preflight();
    const status = preflight['launcher'] as StreamerBotLauncherStatus;
    return {
      generatedAt: preflight['generatedAt'], mutationFree: true, ready: preflight['ready'], checks: preflight['checks'], websocketPort: status.websocketPort, state: status.state,
      applications: {
        streamerbot: { configured: status.configured, executableExists: status.executableExists, filename: status.executable === undefined ? undefined : basename(status.executable), version: (preflight['versions'] as Record<string, unknown>)[status.executable ?? ''] },
        ...Object.fromEntries(Object.entries(status.optionalApps).map(([id, application]) => [id, { enabled: application.enabled, configured: application.configured, executableExists: application.executableExists, running: application.running, state: application.state, filename: application.executable === undefined ? undefined : basename(application.executable), recentStartupFailures: application.recentStartupFailures ?? 0, circuitOpenUntil: application.circuitOpenUntil, version: (preflight['versions'] as Record<string, unknown>)[application.executable ?? ''] }])),
      },
    };
  }

  public async trayNotificationHistory(): Promise<Readonly<Record<string, unknown>>> {
    const path = join(this.dataRoot, 'state', 'tray-notifications.json');
    try {
      const details = await stat(path); if (!details.isFile() || details.size > 256 * 1024) throw new Error('Tray notification history is invalid.');
      const value = JSON.parse(await readFile(path, 'utf8')) as unknown;
      return { entries: Array.isArray(value) ? value.flatMap(parseTrayNotification).slice(-100).reverse() : [] };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [] }; throw error; }
  }

  public async recordTrayNotification(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    if (request['approvedByCreator'] !== true) throw new Error('Explicit creator approval is required to store a tray notification.');
    const categories = ['readiness', 'startup', 'acceptance', 'process-binding', 'latency', 'reliability', 'preflight']; const kinds = ['info', 'warning', 'error'];
    const category = typeof request['category'] === 'string' && categories.includes(request['category']) ? request['category'] : 'readiness';
    const kind = typeof request['kind'] === 'string' && kinds.includes(request['kind'].toLowerCase()) ? request['kind'].toLowerCase() : 'info';
    const title = safeNotificationText(request['title'], 100); const summary = safeNotificationText(request['summary'], 400);
    const history = await this.trayNotificationHistory(); const rawEntries = history['entries']; const current: Readonly<Record<string, unknown>>[] = Array.isArray(rawEntries) ? rawEntries.filter((entry): entry is Readonly<Record<string, unknown>> => entry !== null && typeof entry === 'object' && !Array.isArray(entry)).reverse() : [];
    const entries = [...current, { id: randomUUID(), recordedAt: new Date().toISOString(), category, title, summary, kind }].slice(-100);
    const path = join(this.dataRoot, 'state', 'tray-notifications.json'); await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(entries, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, path);
    return { entries: [...entries].reverse() };
  }

  public async save(executable: string): Promise<StreamerBotLauncherStatus> {
    const absolute = resolve(executable.trim());
    if (basename(absolute).toLocaleLowerCase('en-US') !== 'streamer.bot.exe' || !await isFile(absolute)) throw new Error('Choose the real Streamer.bot.exe file. The selected path does not exist or has the wrong filename.');
    const previous = await this.readConfiguration();
    const configuration: LauncherConfiguration = { version: 2, executable: absolute, websocketPort: this.websocketPort(), optionalApps: previous?.optionalApps ?? {}, updatedAt: new Date().toISOString() };
    await mkdir(dirname(this.configurationPath), { recursive: true });
    const temporary = `${this.configurationPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(configuration, null, 2)}\n`, 'utf8');
    await rename(temporary, this.configurationPath);
    return await this.status();
  }

  public async saveOptionalApplication(application: OptionalApplication, executable: string, enabled: boolean): Promise<StreamerBotLauncherStatus> {
    const metadata = optionalApplicationMetadata(application);
    const absolute = resolve(executable.trim());
    if (!metadata.executableNames.includes(basename(absolute).toLocaleLowerCase('en-US')) || !await isFile(absolute)) throw new Error(`Choose the real ${metadata.label} executable. The selected path does not exist or has the wrong filename.`);
    const configuration = await this.requireConfiguration();
    await this.writeConfiguration({ ...configuration, optionalApps: { ...configuration.optionalApps, [application]: { executable: absolute, enabled } }, updatedAt: new Date().toISOString() });
    return await this.status();
  }

  public async setOptionalApplicationEnabled(application: OptionalApplication, enabled: boolean): Promise<StreamerBotLauncherStatus> {
    const configuration = await this.requireConfiguration();
    const existing = configuration.optionalApps[application];
    if (enabled && existing === undefined) throw new Error(`Choose ${optionalApplicationMetadata(application).label} before enabling automatic startup.`);
    await this.writeConfiguration({ ...configuration, optionalApps: existing === undefined ? configuration.optionalApps : { ...configuration.optionalApps, [application]: { ...existing, enabled } }, updatedAt: new Date().toISOString() });
    return await this.status();
  }

  public async resetOptionalApplicationCircuit(application: OptionalApplication): Promise<StreamerBotLauncherStatus> {
    const circuitPath = join(this.dataRoot, 'runtime', 'optional-app-startup-circuit.json');
    let value: Record<string, unknown> = { version: 1, applications: {} };
    try {
      const details = await stat(circuitPath);
      if (!details.isFile() || details.size > 64 * 1024) throw new Error('The optional-app crash circuit file is invalid or too large.');
      const parsed = JSON.parse(await readFile(circuitPath, 'utf8')) as unknown;
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || (parsed as Record<string, unknown>)['version'] !== 1) throw new Error('The optional-app crash circuit file is invalid.');
      value = parsed as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const applicationsValue = value['applications'];
    const existingApplications = applicationsValue !== null && typeof applicationsValue === 'object' && !Array.isArray(applicationsValue) ? applicationsValue as Record<string, unknown> : {};
    const applications = Object.fromEntries(Object.entries(existingApplications).filter(([name]) => name !== application));
    await mkdir(dirname(circuitPath), { recursive: true });
    const temporary = `${circuitPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, applications }, null, 2)}\n`, 'utf8');
    await rename(temporary, circuitPath);
    return await this.status();
  }

  public async chooseOptionalApplication(application: OptionalApplication): Promise<StreamerBotLauncherStatus> {
    const metadata = optionalApplicationMetadata(application);
    const executable = await chooseExecutable(metadata.label, metadata.executableNames);
    return await this.saveOptionalApplication(application, executable, true);
  }

  public async choose(): Promise<StreamerBotLauncherStatus> {
    if (this.platform !== 'win32') throw new Error('The native Streamer.bot file chooser is available on Windows only.');
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
      "$dialog.Title = 'Choose Streamer.bot.exe'",
      "$dialog.Filter = 'Streamer.bot executable (Streamer.bot.exe)|Streamer.bot.exe'",
      '$dialog.CheckFileExists = $true',
      '$dialog.Multiselect = $false',
      'if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '$dialog.FileName',
    ].join('; ');
    let result: string;
    try { result = execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { encoding: 'utf8', timeout: 120_000, windowsHide: false }).trim(); }
    catch (error) {
      if ((error as { status?: number }).status === 2) throw new Error('No file was selected. The saved Streamer.bot location was not changed.', { cause: error });
      throw new Error('Windows could not open the Streamer.bot file chooser.', { cause: error });
    }
    if (result.length === 0) throw new Error('No Streamer.bot executable was selected.');
    return await this.save(result);
  }

  public async start(): Promise<{ readonly status: StreamerBotLauncherStatus; readonly output: string }> {
    const configuration = await this.readConfiguration();
    if (configuration === undefined) throw new Error('Select Streamer.bot.exe before using safe start.');
    const launcher = await this.launcherPath();
    const result = await execFileAsync(process.execPath, [launcher, '--install-root', this.installRoot, '--exe', configuration.executable, '--port', String(this.websocketPort()), '--save'], { cwd: this.installRoot, windowsHide: true, timeout: 120_000, encoding: 'utf8' });
    return { status: await this.status(), output: `${result.stdout}${result.stderr}`.trim() };
  }

  public async startAllStreamingTools(): Promise<{ readonly status: StreamerBotLauncherStatus; readonly output: string; readonly warnings: readonly string[] }> {
    await this.requireConfiguration();
    const launcher = join(this.installRoot, 'launcher', 'start-streaming-tools.mjs');
    if (!await isFile(launcher)) throw new Error('The one-button streaming tools launcher is missing. Reinstall the current StreamBridge release.');
    const result = await execFileAsync(process.execPath, [launcher], { cwd: this.installRoot, windowsHide: true, timeout: 360_000, encoding: 'utf8' });
    this.optionalProcessCache = undefined;
    const output = `${result.stdout}${result.stderr}`.trim();
    return { status: await this.status(), output, warnings: parseOptionalStartupWarnings(output) };
  }

  public async restartStreamBridge(): Promise<{ readonly accepted: true; readonly helperProcessId: number; readonly message: string }> {
    if (this.platform !== 'win32') throw new Error('Safe StreamBridge restart is available on Windows only.');
    const launcher = join(this.installRoot, 'launcher', 'start.mjs');
    if (!await isFile(launcher)) throw new Error('The StreamBridge restart launcher is missing. Reinstall the current StreamBridge release.');
    const child = spawn(process.execPath, [launcher, '--restart', '--open-wizard'], { cwd: this.installRoot, detached: true, windowsHide: true, stdio: 'ignore' });
    const helperProcessId = await new Promise<number>((resolveSpawn, rejectSpawn) => {
      child.once('error', rejectSpawn);
      child.once('spawn', () => {
        child.removeListener('error', rejectSpawn);
        if (child.pid === undefined) rejectSpawn(new Error('Windows did not return a process ID for the StreamBridge restart helper.'));
        else resolveSpawn(child.pid);
      });
    });
    child.unref();
    return { accepted: true, helperProcessId, message: 'StreamBridge is restarting. This tab may briefly disconnect, and a fresh unlocked Wizard window will open automatically.' };
  }

  public async createDesktopShortcut(): Promise<{ readonly path: string; readonly status: StreamerBotLauncherStatus }> {
    const configuration = await this.readConfiguration();
    if (configuration === undefined) throw new Error('Select Streamer.bot.exe before creating the desktop shortcut.');
    if (!isAbsolute(configuration.executable) || basename(configuration.executable).toLocaleLowerCase('en-US') !== 'streamer.bot.exe' || !await isFile(configuration.executable)) throw new Error('The saved Streamer.bot executable is missing or invalid. Select the exact Streamer.bot.exe again before creating the shortcut.');
    for (const application of OPTIONAL_APPLICATIONS) {
      const saved = configuration.optionalApps[application];
      const metadata = optionalApplicationMetadata(application);
      if (saved?.enabled === true && (!isAbsolute(saved.executable) || !metadata.executableNames.includes(basename(saved.executable).toLocaleLowerCase('en-US')) || !await isFile(saved.executable))) throw new Error(`${metadata.label} is enabled, but its saved executable is missing or invalid. Choose the exact executable again or turn off automatic startup before creating the shortcut.`);
    }
    const target = this.locationFields().streamDeckTarget;
    if (!await isFile(target)) throw new Error('The one-button streaming tools command is missing. Reinstall the current StreamBridge release.');
    const script = [
      "$desktop = [Environment]::GetFolderPath('Desktop')",
      "$path = Join-Path $desktop 'Start THSV Streaming Tools.lnk'",
      '$shell = New-Object -ComObject WScript.Shell',
      '$shortcut = $shell.CreateShortcut($path)',
      '$shortcut.TargetPath = $env:THSV_SHORTCUT_TARGET',
      '$shortcut.WorkingDirectory = $env:THSV_SHORTCUT_ROOT',
      '$shortcut.IconLocation = $env:THSV_SHORTCUT_ICON',
      "$shortcut.Description = 'Start enabled streaming apps, Streamer.bot, and THSV StreamBridge'",
      '$shortcut.Save()',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '$path',
    ].join('; ');
    const commandIcon = process.env.ComSpec ?? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe');
    const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 15_000, env: { ...process.env, THSV_SHORTCUT_TARGET: target, THSV_SHORTCUT_ROOT: this.installRoot, THSV_SHORTCUT_ICON: `${commandIcon},0` } }).trim();
    if (result.length === 0) throw new Error('Windows did not return the desktop shortcut path.');
    return { path: result, status: await this.status() };
  }

  public openInstallFolder(): { readonly opened: true; readonly installRoot: string; readonly streamDeckTarget: string } {
    if (this.platform !== 'win32') throw new Error('Opening the installed folder is available on Windows only.');
    const child = spawn('explorer.exe', [this.installRoot], { detached: true, windowsHide: false, stdio: 'ignore' });
    child.unref();
    return { opened: true, ...this.locationFields() };
  }

  private websocketPort(): number {
    const url = new URL(this.websocketUrl);
    const port = Number(url.port || (url.protocol === 'wss:' ? 443 : 80));
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('The configured Streamer.bot WebSocket URL has an invalid port.');
    return port;
  }

  private async readConfiguration(): Promise<LauncherConfiguration | undefined> {
    try {
      const value = JSON.parse(await readFile(this.configurationPath, 'utf8')) as Partial<LauncherConfiguration> & { version?: number };
      if (![1, 2].includes(value.version ?? 0) || typeof value.executable !== 'string') return undefined;
      return { version: 2, executable: value.executable, websocketPort: this.websocketPort(), optionalApps: validOptionalApplications(value.optionalApps), updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString() };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return undefined; throw error; }
  }

  private async readLastStartupReport(): Promise<StartupReportSummary | undefined> {
    try {
      const value = JSON.parse(await readFile(join(this.dataRoot, 'logs', 'last-startup-report.json'), 'utf8')) as Record<string, unknown>;
      if (!isNonEmptyString(value['timestamp']) || Number.isNaN(Date.parse(value['timestamp']))
        || !isNonEmptyString(value['launcher']) || !isNonEmptyString(value['requestedAction'])
        || !isNonEmptyString(value['outcome']) || !isNonEmptyString(value['category']) || !isNonEmptyString(value['message'])) return undefined;
      return {
        timestamp: value['timestamp'],
        launcher: value['launcher'].slice(0, 64),
        requestedAction: value['requestedAction'].slice(0, 64),
        outcome: value['outcome'].slice(0, 64),
        category: value['category'].slice(0, 64),
        message: value['message'].slice(0, 500),
        ...(isNonEmptyString(value['startedAt']) && !Number.isNaN(Date.parse(value['startedAt'])) ? { startedAt: value['startedAt'] } : {}),
        ...(isNonEmptyString(value['startupRunId']) && /^[0-9a-f-]{36}$/iu.test(value['startupRunId']) ? { startupRunId: value['startupRunId'] } : {}),
        ...(isNonEmptyString(value['phase']) ? { phase: value['phase'].slice(0, 64) } : {}),
        ...(isNonNegativeInteger(value['attempt']) ? { attempt: value['attempt'] } : {}),
        ...(isNonNegativeInteger(value['durationMs']) ? { durationMs: value['durationMs'] } : {}),
        ...(validReadinessBlockers(value['readinessBlockers']).length > 0 ? { readinessBlockers: validReadinessBlockers(value['readinessBlockers']) } : {}),
        ...(isPositiveInteger(value['pid']) ? { pid: value['pid'] } : {}),
        ...(isPositiveInteger(value['port']) && value['port'] <= 65_535 ? { port: value['port'] } : {}),
        ...(isNonEmptyString(value['version']) ? { version: value['version'].slice(0, 64) } : {}),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return undefined;
      throw error;
    }
  }

  private async requireConfiguration(): Promise<LauncherConfiguration> {
    const configuration = await this.readConfiguration();
    if (configuration === undefined) throw new Error('Select Streamer.bot.exe before configuring optional streaming apps.');
    return configuration;
  }

  private async writeConfiguration(configuration: LauncherConfiguration): Promise<void> {
    await mkdir(dirname(this.configurationPath), { recursive: true });
    const temporary = `${this.configurationPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(configuration, null, 2)}\n`, 'utf8');
    await rename(temporary, this.configurationPath);
  }

  private async optionalApplicationStatuses(): Promise<Readonly<Record<OptionalApplication, OptionalApplicationStatus>>> {
    const configuration = await this.readConfiguration();
    const circuits = await this.optionalCircuitStatus();
    const runningProcesses = this.optionalProcesses();
    const entries = await Promise.all(OPTIONAL_APPLICATIONS.map(async (application) => {
      const metadata = optionalApplicationMetadata(application);
      if (this.platform !== 'win32') return [application, { application, label: metadata.label, enabled: false, configured: false, executableExists: false, running: false, state: 'unsupported', message: `${metadata.label} startup is available on Windows only.` }] as const;
      const saved = configuration?.optionalApps[application];
      const expectedNames = new Set(metadata.processNames.map((name) => name.toLocaleLowerCase('en-US')));
      const namedProcesses = runningProcesses.filter((candidate) => expectedNames.has(candidate.name.toLocaleLowerCase('en-US')));
      if (saved === undefined) {
        const runningProcess = namedProcesses[0];
        return [application, { application, label: metadata.label, enabled: false, configured: false, executableExists: false, running: runningProcess !== undefined, ...(runningProcess === undefined ? {} : { processId: runningProcess.pid }), state: 'not-configured', message: `${metadata.label} is optional. Choose its exact executable only if the one-button launcher should start it.` }] as const;
      }
      const executableExists = await isFile(saved.executable);
      const runningProcess = namedProcesses.find((candidate) => candidate.path !== undefined && samePath(candidate.path, saved.executable));
      const differentInstallation = namedProcesses.find((candidate) => candidate.path !== undefined && !samePath(candidate.path, saved.executable));
      const running = runningProcess !== undefined;
      const circuit = circuits[application];
      const circuitOpen = circuit?.openUntil !== undefined && Date.parse(circuit.openUntil) > Date.now() && circuit.recentFailures >= 3;
      const state = !saved.enabled ? 'disabled' : !executableExists ? 'missing' : running ? 'running' : differentInstallation !== undefined ? 'different-installation-running' : 'stopped';
      const message = !saved.enabled ? `${metadata.label} automatic startup is off.` : !executableExists ? `The saved ${metadata.label} executable was moved or removed.` : circuitOpen ? `${metadata.label} automatic startup is paused until ${new Date(circuit.openUntil ?? '').toLocaleTimeString()} after ${String(circuit.recentFailures)} recent failures.` : running ? `${metadata.label} is running from the saved executable.` : differentInstallation !== undefined ? `A different ${metadata.label} installation is running. The one-button launcher will still start the exact saved executable.` : `${metadata.label} will start from the exact saved executable.`;
      return [application, { application, label: metadata.label, enabled: saved.enabled, configured: true, executable: saved.executable, executableExists, running, ...(runningProcess === undefined ? {} : { processId: runningProcess.pid }), ...(differentInstallation === undefined ? {} : { differentInstallationProcessId: differentInstallation.pid, ...(differentInstallation.path === undefined ? {} : { differentInstallationExecutable: differentInstallation.path }) }), ...(circuit === undefined ? {} : { recentStartupFailures: circuit.recentFailures, ...(circuitOpen ? { circuitOpenUntil: circuit.openUntil } : {}) }), state, message }] as const;
    }));
    return Object.fromEntries(entries) as Readonly<Record<OptionalApplication, OptionalApplicationStatus>>;
  }

  private async optionalCircuitStatus(): Promise<Partial<Record<OptionalApplication, { readonly recentFailures: number; readonly openUntil?: string }>>> {
    try {
      const path = join(this.dataRoot, 'runtime', 'optional-app-startup-circuit.json');
      if ((await stat(path)).size > 64 * 1024) return {};
      const value = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
      const applications = value['version'] === 1 && value['applications'] !== null && typeof value['applications'] === 'object' && !Array.isArray(value['applications']) ? value['applications'] as Record<string, unknown> : {};
      const cutoff = Date.now() - 10 * 60_000;
      return Object.fromEntries(OPTIONAL_APPLICATIONS.flatMap((application) => {
        const entry = applications[application];
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return [];
        const record = entry as Record<string, unknown>;
        const failures = Array.isArray(record['failures']) ? record['failures'].filter((failure) => failure !== null && typeof failure === 'object' && !Array.isArray(failure) && typeof (failure as Record<string, unknown>)['at'] === 'string' && Date.parse((failure as Record<string, unknown>)['at'] as string) >= cutoff) : [];
        const openUntil = typeof record['openUntil'] === 'string' && Number.isFinite(Date.parse(record['openUntil'])) ? record['openUntil'] : undefined;
        return [[application, { recentFailures: failures.length, ...(openUntil === undefined ? {} : { openUntil }) }]];
      }));
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return {}; throw error; }
  }

  private async detectOptionalApplications(): Promise<readonly OptionalApplicationCandidate[]> {
    const configuration = await this.readConfiguration();
    const runningProcesses = this.optionalProcesses();
    const candidates = new Map<string, OptionalApplicationCandidate>();
    for (const application of OPTIONAL_APPLICATIONS) {
      const metadata = optionalApplicationMetadata(application);
      const add = async (path: string | undefined, source: OptionalApplicationCandidate['source']): Promise<void> => {
        if (path === undefined || !metadata.executableNames.includes(basename(path).toLocaleLowerCase('en-US')) || !await isFile(path)) return;
        const absolute = resolve(path); const key = `${application}:${absolute.toLocaleLowerCase('en-US')}`;
        if (!candidates.has(key)) candidates.set(key, { application, executable: absolute, source });
      };
      await add(configuration?.optionalApps[application]?.executable, 'saved');
      for (const nearby of await nearbyExecutableCandidates(configuration?.optionalApps[application]?.executable, metadata.executableNames)) await add(nearby, 'near-saved-location');
      const expectedNames = new Set(metadata.processNames.map((name) => name.toLocaleLowerCase('en-US')));
      for (const processValue of runningProcesses.filter((candidate) => expectedNames.has(candidate.name.toLocaleLowerCase('en-US')))) await add(processValue.path, 'running');
      for (const path of metadata.commonLocations()) await add(path, 'common-location');
    }
    return [...candidates.values()];
  }

  private optionalProcesses(): readonly ProcessIdentity[] {
    const now = Date.now();
    if (this.optionalProcessCache !== undefined && this.optionalProcessCache.expiresAt > now) return this.optionalProcessCache.processes;
    const processes = processesNamed(['obs64', 'Meld', 'Meld Studio', 'Streamlabs Desktop', 'slobs-client', 'Speaker.bot', 'SpeakerBot']);
    this.optionalProcessCache = { expiresAt: now + 10_000, processes };
    return processes;
  }

  private async launcherPath(): Promise<string> {
    for (const path of [join(this.installRoot, 'launcher', 'start-streamerbot.mjs'), resolve('tools', 'start-streamerbot-safely.mjs')]) if (await isFile(path)) return path;
    throw new Error('The safe Streamer.bot launcher is missing. Reinstall the current StreamBridge release.');
  }

  private locationFields(): { readonly installRoot: string; readonly streamDeckTarget: string } {
    return { installRoot: this.installRoot, streamDeckTarget: join(this.installRoot, 'Start THSV Streaming Tools.cmd') };
  }
}

export function parseOptionalStartupWarnings(output: string): readonly string[] {
  return output.split(/\r?\n/u).map((line) => /^Optional app warning:\s*(.+)$/u.exec(line)?.[1]?.trim()).filter((line): line is string => typeof line === 'string' && line.length > 0);
}

function samePath(left: string, right: string): boolean { return resolve(left).toLocaleLowerCase('en-US') === resolve(right).toLocaleLowerCase('en-US'); }
function isNonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function isPositiveInteger(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value > 0; }
function isNonNegativeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
function validReadinessBlockers(value: unknown): readonly StartupReadinessBlocker[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    if (![candidate['kind'], candidate['name'], candidate['state'], candidate['message'], candidate['recovery']].every(isNonEmptyString)) return [];
    return [{ kind: String(candidate['kind']).slice(0, 32), name: String(candidate['name']).slice(0, 128), state: String(candidate['state']).slice(0, 64), message: String(candidate['message']).slice(0, 500), recovery: String(candidate['recovery']).slice(0, 500) }];
  });
}
async function isFile(path: string): Promise<boolean> { try { return (await stat(path)).isFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }
function listenerForPort(port: number): number | undefined {
  try {
    const output = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
    for (const line of output.split(/\r?\n/u)) { const fields = line.trim().split(/\s+/u); if (fields[0]?.toUpperCase() === 'TCP' && fields[1]?.endsWith(`:${String(port)}`) && fields[3]?.toUpperCase() === 'LISTENING') { const pid = Number(fields[4]); if (Number.isInteger(pid) && pid > 0) return pid; } }
    return undefined;
  } catch { return undefined; }
}
function processIdentity(pid: number): ProcessIdentity | undefined {
  try {
    const command = `$p=Get-Process -Id ${String(pid)} -ErrorAction Stop; [pscustomobject]@{pid=$p.Id;name=$p.ProcessName;path=$p.Path}|ConvertTo-Json -Compress`;
    const value = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 5_000 })) as { pid: number; name?: string; path?: string };
    return { pid: value.pid, name: value.name ?? 'Unknown process', ...(typeof value.path === 'string' ? { path: value.path } : {}) };
  } catch { return undefined; }
}
function streamerBotProcesses(): readonly ProcessIdentity[] {
  try {
    const command = "@(Get-Process -Name 'Streamer.bot' -ErrorAction SilentlyContinue|ForEach-Object{[pscustomobject]@{pid=$_.Id;name=$_.ProcessName;path=$_.Path}})|ConvertTo-Json -Compress";
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 5_000 }).trim();
    if (!raw) return [];
    const value = JSON.parse(raw) as ProcessIdentity | ProcessIdentity[];
    return Array.isArray(value) ? value : [value];
  } catch { return []; }
}

function optionalApplicationMetadata(application: OptionalApplication): {
  readonly label: string;
  readonly executableNames: readonly string[];
  readonly processNames: readonly string[];
  readonly commonLocations: () => readonly (string | undefined)[];
} {
  const profile = process.env['USERPROFILE'];
  const local = process.env['LOCALAPPDATA'];
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
  if (application === 'obs') return {
    label: 'OBS Studio',
    executableNames: ['obs64.exe'],
    processNames: ['obs64'],
    commonLocations: () => [join(programFiles, 'obs-studio', 'bin', '64bit', 'obs64.exe')],
  };
  if (application === 'meld') return {
    label: 'Meld Studio',
    executableNames: ['meld.exe', 'meld studio.exe'],
    processNames: ['Meld', 'Meld Studio'],
    commonLocations: () => [
      join(programFiles, 'Meld Studio', 'Meld Studio.exe'),
      local ? join(local, 'Programs', 'Meld Studio', 'Meld Studio.exe') : undefined,
      local ? join(local, 'Meld Studio', 'Meld Studio.exe') : undefined,
    ],
  };
  if (application === 'streamlabs') return {
    label: 'Streamlabs Desktop',
    executableNames: ['streamlabs desktop.exe', 'slobs-client.exe'],
    processNames: ['Streamlabs Desktop', 'slobs-client'],
    commonLocations: () => [
      join(programFiles, 'Streamlabs Desktop', 'Streamlabs Desktop.exe'),
      local ? join(local, 'Programs', 'streamlabs-desktop', 'Streamlabs Desktop.exe') : undefined,
    ],
  };
  return {
    label: 'Speaker.bot',
    executableNames: ['speaker.bot.exe'],
    processNames: ['Speaker.bot', 'SpeakerBot'],
    commonLocations: () => [
      local ? join(local, 'Speaker.bot', 'Speaker.bot.exe') : undefined,
      profile ? join(profile, 'Desktop', 'Speaker.bot', 'Speaker.bot.exe') : undefined,
      profile ? join(profile, 'Downloads', 'Speaker.bot', 'Speaker.bot.exe') : undefined,
    ],
  };
}

function validOptionalApplications(value: unknown): LauncherConfiguration['optionalApps'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: Partial<Record<OptionalApplication, { executable: string; enabled: boolean }>> = {};
  for (const application of OPTIONAL_APPLICATIONS) {
    const entry = (value as Record<string, unknown>)[application];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const executable = (entry as Record<string, unknown>)['executable'];
    const enabled = (entry as Record<string, unknown>)['enabled'];
    if (typeof executable === 'string' && typeof enabled === 'boolean') result[application] = { executable, enabled };
  }
  return result;
}

function processesNamed(names: readonly string[]): readonly ProcessIdentity[] {
  if (process.platform !== 'win32') return [];
  try {
    const quoted = names.map((name) => `'${name.replaceAll("'", "''")}'`).join(',');
    const command = `@(${quoted}|ForEach-Object{Get-Process -Name $_ -ErrorAction SilentlyContinue}|Sort-Object Id -Unique|ForEach-Object{[pscustomobject]@{pid=$_.Id;name=$_.ProcessName;path=$_.Path}})|ConvertTo-Json -Compress`;
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 5_000 }).trim();
    if (!raw) return [];
    const value = JSON.parse(raw) as ProcessIdentity | ProcessIdentity[];
    return Array.isArray(value) ? value : [value];
  } catch { return []; }
}

function applicationVersions(paths: readonly string[]): Readonly<Record<string, string>> {
  const unique = [...new Set(paths)];
  if (process.platform !== 'win32' || unique.length === 0) return {};
  try {
    const script = "$paths=ConvertFrom-Json $env:THSV_VERSION_PATHS; @($paths|ForEach-Object{$item=Get-Item -LiteralPath $_ -ErrorAction Stop; [pscustomobject]@{path=$item.FullName;version=$item.VersionInfo.FileVersion}})|ConvertTo-Json -Compress";
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 8_000, env: { ...process.env, THSV_VERSION_PATHS: JSON.stringify(unique) } }).trim();
    if (raw.length === 0) return {};
    const parsed = JSON.parse(raw) as { path?: unknown; version?: unknown } | { path?: unknown; version?: unknown }[];
    return Object.fromEntries((Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => typeof entry.path === 'string' && typeof entry.version === 'string' && entry.version.trim().length > 0 ? [[entry.path, entry.version.trim()]] : []));
  } catch { return {}; }
}

async function nearbyExecutableCandidates(savedPath: string | undefined, executableNames: readonly string[]): Promise<readonly string[]> {
  if (savedPath === undefined) return [];
  const parent = dirname(savedPath); const siblingRoot = dirname(parent);
  try {
    const entries = (await readdir(siblingRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).slice(0, 64);
    return entries.flatMap((entry) => executableNames.map((name) => join(siblingRoot, entry.name, name)));
  } catch { return []; }
}

async function chooseExecutable(label: string, executableNames: readonly string[]): Promise<string> {
  if (process.platform !== 'win32') throw new Error(`The native ${label} file chooser is available on Windows only.`);
  const filter = `${label} executable (${executableNames.join(';')})|${executableNames.join(';')}`;
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
    `$dialog.Title = 'Choose ${label.replaceAll("'", "''")}'`,
    `$dialog.Filter = '${filter.replaceAll("'", "''")}'`,
    '$dialog.CheckFileExists = $true',
    '$dialog.Multiselect = $false',
    'if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$dialog.FileName',
  ].join('; ');
  try {
    const result = execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { encoding: 'utf8', timeout: 120_000, windowsHide: false }).trim();
    if (result.length === 0) throw new Error(`No ${label} executable was selected.`);
    return result;
  } catch (error) {
    if ((error as { status?: number }).status === 2) throw new Error(`No file was selected. The saved ${label} location was not changed.`, { cause: error });
    throw new Error(`Windows could not open the ${label} file chooser.`, { cause: error });
  }
}

function safeNotificationText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Tray notification title and summary are required.');
  return value.trim().replaceAll(/[A-Za-z]:\\[^\s]+/gu, '[LOCAL PATH]').replaceAll(/\b(?:password|token|secret)\s*[:=]\s*\S+/giu, '[REDACTED]').slice(0, maximum);
}

function parseTrayNotification(value: unknown): Readonly<Record<string, unknown>>[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  const item = value as Record<string, unknown>;
  if (typeof item['id'] !== 'string' || typeof item['recordedAt'] !== 'string' || !Number.isFinite(Date.parse(item['recordedAt'])) || typeof item['category'] !== 'string' || typeof item['title'] !== 'string' || typeof item['summary'] !== 'string' || typeof item['kind'] !== 'string') return [];
  return [{ id: item['id'].slice(0, 80), recordedAt: item['recordedAt'], category: item['category'].slice(0, 40), title: safeNotificationText(item['title'], 100), summary: safeNotificationText(item['summary'], 400), kind: item['kind'].slice(0, 20) }];
}
