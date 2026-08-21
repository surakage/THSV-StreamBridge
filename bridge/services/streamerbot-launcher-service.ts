import { execFile, execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface StreamerBotLauncherCandidate {
  readonly executable: string;
  readonly source: 'saved' | 'running' | 'common-location';
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
  readonly state: 'disabled' | 'not-configured' | 'missing' | 'stopped' | 'running' | 'unsupported';
  readonly message: string;
}

export interface OptionalApplicationCandidate {
  readonly application: OptionalApplication;
  readonly executable: string;
  readonly source: 'saved' | 'running' | 'common-location';
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

  public async detect(): Promise<{ readonly candidates: readonly StreamerBotLauncherCandidate[]; readonly optionalCandidates: readonly OptionalApplicationCandidate[]; readonly status: StreamerBotLauncherStatus }> {
    this.optionalProcessCache = undefined;
    const candidates = new Map<string, StreamerBotLauncherCandidate>();
    const add = async (path: string | undefined, source: StreamerBotLauncherCandidate['source']): Promise<void> => {
      if (path === undefined || basename(path).toLocaleLowerCase('en-US') !== 'streamer.bot.exe' || !await isFile(path)) return;
      const absolute = resolve(path); const key = absolute.toLocaleLowerCase('en-US');
      if (!candidates.has(key)) candidates.set(key, { executable: absolute, source });
    };
    await add((await this.readConfiguration())?.executable, 'saved');
    for (const processValue of streamerBotProcesses()) await add(processValue.path, 'running');
    const profile = process.env['USERPROFILE']; const local = process.env['LOCALAPPDATA'];
    for (const path of [
      local ? join(local, 'Streamer.bot', 'Streamer.bot.exe') : undefined,
      profile ? join(profile, 'Desktop', 'Streamer.bot', 'Streamer.bot.exe') : undefined,
      profile ? join(profile, 'Downloads', 'Streamer.bot', 'Streamer.bot.exe') : undefined,
    ]) await add(path, 'common-location');
    return { candidates: [...candidates.values()], optionalCandidates: await this.detectOptionalApplications(), status: await this.status() };
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
    const result = await execFileAsync(process.execPath, [launcher], { cwd: this.installRoot, windowsHide: true, timeout: 150_000, encoding: 'utf8' });
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
    const runningProcesses = this.optionalProcesses();
    const entries = await Promise.all(OPTIONAL_APPLICATIONS.map(async (application) => {
      const metadata = optionalApplicationMetadata(application);
      if (this.platform !== 'win32') return [application, { application, label: metadata.label, enabled: false, configured: false, executableExists: false, running: false, state: 'unsupported', message: `${metadata.label} startup is available on Windows only.` }] as const;
      const saved = configuration?.optionalApps[application];
      const expectedNames = new Set(metadata.processNames.map((name) => name.toLocaleLowerCase('en-US')));
      const runningProcess = runningProcesses.find((candidate) => expectedNames.has(candidate.name.toLocaleLowerCase('en-US')));
      if (saved === undefined) return [application, { application, label: metadata.label, enabled: false, configured: false, executableExists: false, running: runningProcess !== undefined, ...(runningProcess === undefined ? {} : { processId: runningProcess.pid }), state: 'not-configured', message: `${metadata.label} is optional. Choose it only if the one-button launcher should start it.` }] as const;
      const executableExists = await isFile(saved.executable);
      const running = runningProcess !== undefined;
      const state = !saved.enabled ? 'disabled' : !executableExists ? 'missing' : running ? 'running' : 'stopped';
      const message = !saved.enabled ? `${metadata.label} automatic startup is off.` : !executableExists ? `The saved ${metadata.label} executable was moved or removed.` : running ? `${metadata.label} is running.` : `${metadata.label} will start with the one-button launcher.`;
      return [application, { application, label: metadata.label, enabled: saved.enabled, configured: true, executable: saved.executable, executableExists, running, ...(runningProcess === undefined ? {} : { processId: runningProcess.pid }), state, message }] as const;
    }));
    return Object.fromEntries(entries) as Readonly<Record<OptionalApplication, OptionalApplicationStatus>>;
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
