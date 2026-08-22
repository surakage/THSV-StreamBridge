import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const launcherRoot = join(installRoot, 'launcher');
const launchLockPath = join(installRoot, 'data', 'runtime', 'streaming-tools.launch.lock');
const OPTIONAL_STARTUP_GRACE_MS = 1_500;
const STREAMERBOT_STALE_LISTENER_RECOVERY_MS = 2_000;
const startupStartedAt = Date.now();
const startupRunId = randomUUID();
let currentPhase = 'initializing';

await main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await writeStartupReport({ outcome: 'failed', category: classifyStartupFailure(message), message, phase: currentPhase, durationMs: Date.now() - startupStartedAt }).catch(() => undefined);
  process.stderr.write(`[FAILED] ${message}\nStartup report: ${join(installRoot, 'data', 'logs', 'last-startup-report.json')}\n`);
  process.exitCode = 1;
});

async function main() {
  await mkdir(dirname(launchLockPath), { recursive: true });
  const releaseLock = await acquireLaunchLock();
  try { await startStreamingTools(); }
  finally { await releaseLock(); }
}

async function startStreamingTools() {
  await writeStartupProgress('preflight', 'Validating the saved streaming-tool configuration.');
  const config = JSON.parse(await readFile(join(installRoot, 'data', 'configuration', 'bridge.local.json'), 'utf8'));
  if (!Number.isInteger(config.service?.port) || config.service.port < 1 || config.service.port > 65_535) throw new Error('The configured StreamBridge service port is invalid.');
  const baseUrl = `http://127.0.0.1:${String(config.service.port)}`;
  const launcherConfig = await readLauncherConfiguration();
  const optionalWarnings = [];
  optionalWarnings.push(...await startTrayShell());

  await writeStartupProgress('starting-streamerbot', 'Checking Streamer.bot and its configured WebSocket port.');
  await startStreamerBotWithBridgeRecovery();
  await writeStartupProgress('starting-speakerbot', 'Starting Speaker.bot when it is enabled.');
  optionalWarnings.push(...await startOptionalApplication('speakerbot', launcherConfig));

  await writeStartupProgress('checking-bridge', 'Checking StreamBridge readiness.');
  if (await bridgeReady(baseUrl)) {
    process.stdout.write('Streamer.bot and THSV StreamBridge are already ready. No restart was needed.\n');
  } else {
    await writeStartupProgress('starting-bridge', 'Starting or repairing StreamBridge.');
    runLauncher(join(launcherRoot, 'start.mjs'), ['--wait'], 45_000);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && !await bridgeReady(baseUrl)) await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    if (!await bridgeReady(baseUrl)) {
      const blockers = await bridgeReadinessBlockers(baseUrl);
      throw new Error(`THSV StreamBridge started but did not reach ready status. ${readinessBlockerSummary(blockers)}`);
    }
    process.stdout.write('Streamer.bot and THSV StreamBridge are ready.\n');
  }
  await writeStartupProgress('starting-broadcast-apps', 'Starting enabled broadcast applications.');
  for (const application of ['obs', 'meld', 'streamlabs']) optionalWarnings.push(...await startOptionalApplication(application, launcherConfig));
  if (optionalWarnings.length > 0) process.stdout.write(`Optional app warning: ${optionalWarnings.join(' ')}\n`);
  else process.stdout.write('Enabled optional streaming apps are ready.\n');
  await writeStartupReport({
    outcome: optionalWarnings.length > 0 ? 'ready-with-optional-warnings' : 'ready',
    category: optionalWarnings.length > 0 ? 'optional-application' : 'none',
    message: optionalWarnings.length > 0 ? optionalWarnings.join(' ') : 'Streamer.bot, StreamBridge, and enabled optional streaming apps are ready.',
    phase: 'complete',
    durationMs: Date.now() - startupStartedAt,
    port: config.service.port,
  }).catch(reportWarning);
}

async function startStreamerBotWithBridgeRecovery() {
  const streamerBotLauncher = join(launcherRoot, 'start-streamerbot.mjs');
  try {
    runLauncher(streamerBotLauncher, ['--install-root', installRoot], 110_000);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/stale port \d+ ownership|port \d+ did not release/iu.test(message)) throw error;
  }

  process.stdout.write('A closed Streamer.bot session left a stale listener behind. Stopping the existing Bridge connection once, then retrying safely...\n');
  try { runLauncher(join(launcherRoot, 'stop.mjs'), [], 25_000); }
  catch { /* The bounded retry below remains authoritative if shutdown was already in progress. */ }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, STREAMERBOT_STALE_LISTENER_RECOVERY_MS));
  runLauncher(streamerBotLauncher, ['--install-root', installRoot], 110_000);
}

async function acquireLaunchLock() {
  const deadline = Date.now() + 110_000;
  let waited = false;
  while (Date.now() < deadline) {
    try {
      await writeFile(launchLockPath, `${String(process.pid)}\n`, { flag: 'wx', encoding: 'ascii', mode: 0o600 });
      return async () => { await rm(launchLockPath, { force: true }); };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const owner = Number((await readFile(launchLockPath, 'ascii').catch(() => '')).trim());
      if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) {
        if (!waited) process.stdout.write(`Another all-tools startup is already running (PID ${String(owner)}); waiting for its result...\n`);
        waited = true;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
        continue;
      }
      const currentOwner = Number((await readFile(launchLockPath, 'ascii').catch(() => '')).trim());
      if (currentOwner === owner) await rm(launchLockPath, { force: true });
    }
  }
  throw new Error('The existing all-tools startup did not finish within 110 seconds.');
}

function runLauncher(script, argumentsValue, timeout) {
  try {
    const result = execFileSync(process.execPath, [script, ...argumentsValue], { cwd: installRoot, encoding: 'utf8', windowsHide: true, timeout, env: { ...process.env, THSV_STARTUP_RUN_ID: startupRunId } });
    if (result.trim().length > 0) process.stdout.write(result);
  } catch (error) {
    const details = `${error?.stdout ?? ''}${error?.stderr ?? ''}`.trim();
    throw new Error(details || `The launcher ${script} failed.`, { cause: error });
  }
}

async function bridgeReady(url) {
  try {
    const response = await fetch(`${url}/ready`, { signal: AbortSignal.timeout(2_000) });
    const body = await response.json();
    return response.ok && body?.ready === true;
  } catch { return false; }
}

async function bridgeReadinessBlockers(url) {
  try {
    const response = await fetch(`${url}/ready`, { signal: AbortSignal.timeout(2_000) });
    const body = await response.json();
    return Array.isArray(body?.blockers) ? body.blockers.slice(0, 20) : [];
  } catch { return []; }
}

function readinessBlockerSummary(blockers) {
  if (blockers.length === 0) return 'Open the Setup Wizard connection check and review Diagnostics.';
  return blockers.slice(0, 5).map((blocker) => {
    const name = typeof blocker?.name === 'string' ? blocker.name : 'component';
    const state = typeof blocker?.state === 'string' ? blocker.state : 'not-ready';
    const recovery = typeof blocker?.recovery === 'string' ? blocker.recovery : 'Open the Setup Wizard connection check.';
    return `${name} is ${state}. ${recovery}`;
  }).join(' ');
}

async function readLauncherConfiguration() {
  try { return JSON.parse(await readFile(join(installRoot, 'data', 'configuration', 'streamerbot-launcher.json'), 'utf8')); }
  catch { return undefined; }
}

async function startOptionalApplication(application, launcherConfig) {
  const warnings = [];
  const definitions = {
    obs: { label: 'OBS Studio', processNames: ['obs64'] },
    meld: { label: 'Meld Studio', processNames: ['Meld', 'Meld Studio'] },
    streamlabs: { label: 'Streamlabs Desktop', processNames: ['Streamlabs Desktop', 'slobs-client'] },
    speakerbot: { label: 'Speaker.bot', processNames: ['Speaker.bot', 'SpeakerBot'] },
  };
  const definition = definitions[application];
  const saved = launcherConfig?.optionalApps?.[application];
  if (saved?.enabled !== true) return warnings;
  if (typeof saved.executable !== 'string' || !await isFile(saved.executable)) return [`${definition.label} was enabled but its saved executable is missing.`];
  if (processIsRunning(definition.processNames)) {
    process.stdout.write(`${definition.label} is already running.\n`);
    return warnings;
  }
  let pid;
  try {
    pid = await launchDetached(saved.executable);
    process.stdout.write(`Started optional app: ${definition.label}.\n`);
  } catch (error) {
    return [`${definition.label} could not start (${error instanceof Error ? error.message : String(error)}).`];
  }
  process.stdout.write(`Allowing ${definition.label} to initialize before continuing.\n`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, OPTIONAL_STARTUP_GRACE_MS));
  if (!isAlive(pid)) warnings.push(`${definition.label} exited during startup; continuing with Streamer.bot and StreamBridge.`);
  return warnings;
}

function startTrayShell() {
  if (process.platform !== 'win32') return Promise.resolve([]);
  return new Promise((resolveLaunch) => {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', join(launcherRoot, 'tray.ps1'), '-InstallRoot', installRoot,
    ], { cwd: installRoot, detached: true, windowsHide: true, stdio: 'ignore' });
    child.once('error', (error) => resolveLaunch([`THSV StreamBridge Tray could not start (${error.message}).`]));
    child.once('spawn', () => {
      child.unref();
      process.stdout.write('THSV StreamBridge Tray is available.\n');
      resolveLaunch([]);
    });
  });
}

function launchDetached(executable) {
  return new Promise((resolveLaunch, rejectLaunch) => {
    const child = spawn(executable, [], { cwd: dirname(executable), detached: true, windowsHide: false, stdio: 'ignore' });
    child.once('error', rejectLaunch);
    child.once('spawn', () => {
      child.removeListener('error', rejectLaunch);
      const pid = child.pid;
      child.unref();
      if (pid === undefined) rejectLaunch(new Error('Windows did not return a process ID.'));
      else resolveLaunch(pid);
    });
  });
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

function processIsRunning(names) {
  if (process.platform !== 'win32') return false;
  try {
    const escaped = names.map((name) => `'${name.replaceAll("'", "''")}'`).join(',');
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `@(${escaped}|ForEach-Object{Get-Process -Name $_ -ErrorAction SilentlyContinue}).Count`], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
    return Number(output.trim()) > 0;
  } catch { return false; }
}

async function isFile(path) {
  try { return (await stat(path)).isFile(); }
  catch { return false; }
}

async function writeStartupReport(details) {
  const logsRoot = join(installRoot, 'data', 'logs');
  await mkdir(logsRoot, { recursive: true });
  const report = { timestamp: new Date().toISOString(), startedAt: new Date(startupStartedAt).toISOString(), startupRunId, launcher: 'streaming-tools', requestedAction: 'start-all', ...details };
  const latestPath = join(logsRoot, 'last-startup-report.json');
  const historyPath = join(logsRoot, 'startup-reports.jsonl');
  await rotateReportHistory(historyPath);
  const temporaryLatestPath = `${latestPath}.${String(process.pid)}.tmp`;
  await writeFile(temporaryLatestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryLatestPath, latestPath);
  await appendFile(historyPath, `${JSON.stringify(report)}\n`, 'utf8');
}

async function writeStartupProgress(phase, message) {
  currentPhase = phase;
  const logsRoot = join(installRoot, 'data', 'logs');
  await mkdir(logsRoot, { recursive: true });
  const latestPath = join(logsRoot, 'last-startup-report.json');
  const temporaryLatestPath = `${latestPath}.${String(process.pid)}.tmp`;
  const report = { timestamp: new Date().toISOString(), startedAt: new Date(startupStartedAt).toISOString(), startupRunId, launcher: 'streaming-tools', requestedAction: 'start-all', outcome: 'in-progress', category: 'none', phase, durationMs: Date.now() - startupStartedAt, message };
  await writeFile(temporaryLatestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryLatestPath, latestPath);
}

async function rotateReportHistory(path, maximumBytes = 512 * 1024, retainedFiles = 3) {
  try {
    if ((await stat(path)).size < maximumBytes) return;
    await rm(`${path}.${String(retainedFiles)}`, { force: true });
    for (let index = retainedFiles - 1; index >= 1; index -= 1) {
      try { await rename(`${path}.${String(index)}`, `${path}.${String(index + 1)}`); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
    await rename(path, `${path}.1`);
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

function classifyStartupFailure(message) {
  if (/Streamer\.bot.*(?:exited|crash|unavailable)|ECONNREFUSED.*8081/iu.test(message)) return 'streamerbot-crash';
  if (/port.*(?:owned|conflict|already in use|did not release)|stale port|address already in use|EADDRINUSE/iu.test(message)) return 'port-conflict';
  if (/configur(?:ation|ed)|invalid.*(?:input|key)|JSON|Unexpected token/iu.test(message)) return 'bridge-configuration';
  if (/healthy|health check|startup|exited during startup/iu.test(message)) return 'bridge-health-timeout';
  return 'launcher-error';
}

function reportWarning(error) {
  process.stderr.write(`Warning: the startup report could not be saved (${error instanceof Error ? error.message : String(error)}).\n`);
}
