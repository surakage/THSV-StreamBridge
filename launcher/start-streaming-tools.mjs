import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const launcherRoot = join(installRoot, 'launcher');
const launchLockPath = join(installRoot, 'data', 'runtime', 'streaming-tools.launch.lock');
const optionalCircuitPath = join(installRoot, 'data', 'runtime', 'optional-app-startup-circuit.json');
const OPTIONAL_STARTUP_GRACE_MS = 1_500;
const STREAMERBOT_STALE_LISTENER_RECOVERY_MS = 2_000;
const LAUNCH_LOCK_STALE_MS = 140_000;
const LAUNCH_LOCK_HEARTBEAT_MS = 5_000;
const MAXIMUM_CONFIGURATION_BYTES = 256 * 1024;
const OPTIONAL_CIRCUIT_WINDOW_MS = 10 * 60_000;
const OPTIONAL_CIRCUIT_OPEN_MS = 15 * 60_000;
const OPTIONAL_CIRCUIT_FAILURES = 3;
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
  const config = await readJsonConfiguration(join(installRoot, 'data', 'configuration', 'bridge.local.json'), 'StreamBridge');
  if (!Number.isInteger(config.service?.port) || config.service.port < 1 || config.service.port > 65_535) throw new Error('The configured StreamBridge service port is invalid.');
  const baseUrl = `http://127.0.0.1:${String(config.service.port)}`;
  const launcherConfig = await readLauncherConfiguration();
  await validateCoreLauncherConfiguration(launcherConfig);
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
      const ownedLock = `${JSON.stringify({ version: 1, pid: process.pid, createdAt: Date.now() })}\n`;
      await writeFile(launchLockPath, ownedLock, { flag: 'wx', encoding: 'utf8', mode: 0o600 });
      const heartbeat = setInterval(() => void refreshOwnedLaunchLock(ownedLock), LAUNCH_LOCK_HEARTBEAT_MS);
      heartbeat.unref();
      return async () => {
        clearInterval(heartbeat);
        const current = await readFile(launchLockPath, 'utf8').catch(() => undefined);
        if (current === ownedLock) await rm(launchLockPath, { force: true });
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const snapshot = await readFile(launchLockPath, 'utf8').catch(() => '');
      const owner = await parseLaunchLockOwner(snapshot);
      const ownerIdentity = owner === undefined ? undefined : launchLockOwnerMatches(owner.pid);
      if (owner !== undefined && !owner.stale && isAlive(owner.pid) && ownerIdentity !== false) {
        if (!waited) process.stdout.write(`Another all-tools startup is already running (PID ${String(owner.pid)}); waiting for its result...\n`);
        waited = true;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
        continue;
      }
      const current = await readFile(launchLockPath, 'utf8').catch(() => undefined);
      if (current === snapshot) {
        if (owner?.stale && isAlive(owner.pid)) process.stdout.write(`Recovering an expired all-tools startup lock whose PID ${String(owner.pid)} has been reused or stopped responding.\n`);
        await rm(launchLockPath, { force: true });
      }
    }
  }
  throw new Error('The existing all-tools startup did not finish within 110 seconds.');
}

async function parseLaunchLockOwner(raw) {
  const value = raw.trim();
  if (value.length === 0) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.version === 1 && Number.isInteger(parsed.pid) && parsed.pid > 0 && Number.isFinite(parsed.createdAt)) {
      const modifiedAt = await stat(launchLockPath).then((entry) => entry.mtimeMs).catch(() => parsed.createdAt);
      return { pid: parsed.pid, stale: Date.now() - Math.max(parsed.createdAt, modifiedAt) > LAUNCH_LOCK_STALE_MS };
    }
  } catch { /* Legacy numeric locks are handled below. */ }
  const legacyPid = Number(value);
  if (!Number.isInteger(legacyPid) || legacyPid <= 0) return undefined;
  const modifiedAt = await stat(launchLockPath).then((entry) => entry.mtimeMs).catch(() => 0);
  return { pid: legacyPid, stale: modifiedAt <= 0 || Date.now() - modifiedAt > LAUNCH_LOCK_STALE_MS };
}

async function refreshOwnedLaunchLock(ownedLock) {
  const current = await readFile(launchLockPath, 'utf8').catch(() => undefined);
  if (current !== ownedLock) return;
  const now = new Date();
  await utimes(launchLockPath, now, now).catch(() => undefined);
}

function launchLockOwnerMatches(pid) {
  if (process.platform !== 'win32') return undefined;
  try {
    const command = `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${String(pid)}' -ErrorAction Stop).CommandLine`;
    const commandLine = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 5_000 }).trim().toLocaleLowerCase('en-US');
    return commandLine.includes('start-streaming-tools.mjs');
  } catch { return undefined; }
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
  const path = join(installRoot, 'data', 'configuration', 'streamerbot-launcher.json');
  if (!await pathExists(path)) return undefined;
  return readJsonConfiguration(path, 'streaming-tool launcher');
}

async function readJsonConfiguration(path, label) {
  let details;
  try { details = await stat(path); }
  catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`The ${label} configuration is missing. Open the Setup Wizard and save it again.`, { cause: error });
    throw error;
  }
  if (!details.isFile()) throw new Error(`The ${label} configuration is not a regular file. Open the Setup Wizard and save it again.`);
  if (details.size > MAXIMUM_CONFIGURATION_BYTES) throw new Error(`The ${label} configuration is unexpectedly large. Open the Setup Wizard and save it again.`);
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch (error) {
    if (error instanceof SyntaxError || error?.message === 'not an object') throw new Error(`The ${label} configuration is damaged. Open the Setup Wizard and save it again.`, { cause: error });
    throw error;
  }
}

async function validateCoreLauncherConfiguration(configuration) {
  if (configuration === undefined) return;
  if ((configuration.version !== 1 && configuration.version !== 2) || typeof configuration.executable !== 'string') {
    throw new Error('The streaming-tool launcher configuration is invalid. Open the Setup Wizard and save the Streamer.bot path again.');
  }
  const executable = configuration.executable.trim();
  if (!isAbsolute(executable) || basename(executable).toLocaleLowerCase('en-US') !== 'streamer.bot.exe' || !await isFile(executable)) {
    throw new Error('The saved Streamer.bot executable is missing or invalid. Open the Setup Wizard and select the exact Streamer.bot.exe again; automatic fallback is disabled.');
  }
}

async function startOptionalApplication(application, launcherConfig) {
  const warnings = [];
  const definitions = {
    obs: { label: 'OBS Studio', processNames: ['obs64'], executableNames: ['obs64.exe'] },
    meld: { label: 'Meld Studio', processNames: ['Meld', 'Meld Studio'], executableNames: ['meld.exe', 'meld studio.exe'] },
    streamlabs: { label: 'Streamlabs Desktop', processNames: ['Streamlabs Desktop', 'slobs-client'], executableNames: ['streamlabs desktop.exe', 'slobs-client.exe'] },
    speakerbot: { label: 'Speaker.bot', processNames: ['Speaker.bot', 'SpeakerBot'], executableNames: ['speaker.bot.exe'] },
  };
  const definition = definitions[application];
  const saved = launcherConfig?.optionalApps?.[application];
  if (saved?.enabled !== true) return warnings;
  const executable = typeof saved.executable === 'string' ? saved.executable.trim() : '';
  const executableName = basename(executable).toLocaleLowerCase('en-US');
  if (!isAbsolute(executable) || !definition.executableNames.includes(executableName) || !await isFile(executable)) {
    return [`${definition.label} was enabled but its saved executable is missing or invalid. Reselect it in the Setup Wizard; core tools will continue safely.`];
  }
  const circuit = await optionalApplicationCircuit(application);
  if (circuit.open) return [`${definition.label} automatic startup is temporarily paused after ${String(circuit.failureCount)} recent failures. Try it manually, then use the Wizard preflight after ${new Date(circuit.openUntil).toLocaleTimeString()}.`];
  const existingProcesses = processesNamed(definition.processNames);
  const selectedProcess = existingProcesses.find((candidate) => typeof candidate.path === 'string' && samePath(candidate.path, executable));
  if (selectedProcess !== undefined) {
    process.stdout.write(`${definition.label} is already running from the saved executable (PID ${String(selectedProcess.pid)}).\n`);
    return warnings;
  }
  const otherInstallations = existingProcesses.filter((candidate) => typeof candidate.path === 'string' && !samePath(candidate.path, executable));
  if (otherInstallations.length > 0) process.stdout.write(`A different ${definition.label} installation is running. Starting the exact saved executable: ${executable}\n`);
  let pid;
  try {
    pid = await launchDetached(executable);
    process.stdout.write(`Started optional app: ${definition.label}.\n`);
  } catch (error) {
    await recordOptionalApplicationFailure(application, error instanceof Error ? error.message : String(error));
    return [`${definition.label} could not start (${error instanceof Error ? error.message : String(error)}).`];
  }
  process.stdout.write(`Allowing ${definition.label} to initialize before continuing.\n`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, OPTIONAL_STARTUP_GRACE_MS));
  const selectedNowRunning = processesNamed(definition.processNames).some((candidate) => typeof candidate.path === 'string' && samePath(candidate.path, executable));
  if (!isAlive(pid) && !selectedNowRunning) {
    await recordOptionalApplicationFailure(application, 'The process exited during its startup grace period.');
    const detail = otherInstallations.length > 0 ? ` A different installation remains open; reselect the intended executable in the Wizard if ${definition.label} is single-instance.` : '';
    warnings.push(`${definition.label} exited during startup; continuing with Streamer.bot and StreamBridge.${detail}`);
  } else await clearOptionalApplicationFailures(application);
  return warnings;
}

async function optionalApplicationCircuit(application) {
  const state = await readOptionalCircuitState();
  const entry = state.applications[application];
  const cutoff = Date.now() - OPTIONAL_CIRCUIT_WINDOW_MS;
  const failures = Array.isArray(entry?.failures) ? entry.failures.filter((failure) => Number.isFinite(Date.parse(failure.at)) && Date.parse(failure.at) >= cutoff) : [];
  const openUntil = typeof entry?.openUntil === 'string' && Number.isFinite(Date.parse(entry.openUntil)) ? Date.parse(entry.openUntil) : 0;
  return { open: failures.length >= OPTIONAL_CIRCUIT_FAILURES && openUntil > Date.now(), failureCount: failures.length, openUntil };
}

async function recordOptionalApplicationFailure(application, message) {
  const state = await readOptionalCircuitState();
  const cutoff = Date.now() - OPTIONAL_CIRCUIT_WINDOW_MS;
  const prior = Array.isArray(state.applications[application]?.failures) ? state.applications[application].failures : [];
  const failures = [...prior.filter((failure) => Number.isFinite(Date.parse(failure.at)) && Date.parse(failure.at) >= cutoff), { at: new Date().toISOString(), message: String(message).slice(0, 300) }].slice(-OPTIONAL_CIRCUIT_FAILURES);
  const openUntil = failures.length >= OPTIONAL_CIRCUIT_FAILURES ? new Date(Date.now() + OPTIONAL_CIRCUIT_OPEN_MS).toISOString() : undefined;
  await writeOptionalCircuitState({ ...state, applications: { ...state.applications, [application]: { failures, ...(openUntil === undefined ? {} : { openUntil }) } } });
}

async function clearOptionalApplicationFailures(application) {
  const state = await readOptionalCircuitState();
  if (state.applications[application] === undefined) return;
  const applications = Object.fromEntries(Object.entries(state.applications).filter(([name]) => name !== application));
  await writeOptionalCircuitState({ ...state, applications });
}

async function readOptionalCircuitState() {
  try {
    if ((await stat(optionalCircuitPath)).size > 64 * 1024) return { version: 1, applications: {} };
    const value = JSON.parse(await readFile(optionalCircuitPath, 'utf8'));
    return value?.version === 1 && value.applications !== null && typeof value.applications === 'object' && !Array.isArray(value.applications) ? value : { version: 1, applications: {} };
  } catch (error) { if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) process.stderr.write(`Warning: optional-app circuit state could not be read (${error instanceof Error ? error.message : String(error)}).\n`); return { version: 1, applications: {} }; }
}

async function writeOptionalCircuitState(state) {
  await mkdir(dirname(optionalCircuitPath), { recursive: true });
  const temporary = `${optionalCircuitPath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version: 1, applications: state.applications }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, optionalCircuitPath);
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

function processesNamed(names) {
  if (process.platform !== 'win32') return [];
  try {
    const escaped = names.map((name) => `'${name.replaceAll("'", "''")}'`).join(',');
    const command = `@(${escaped}|ForEach-Object{Get-Process -Name $_ -ErrorAction SilentlyContinue}|Sort-Object Id -Unique|ForEach-Object{[pscustomobject]@{pid=$_.Id;name=$_.ProcessName;path=$_.Path}})|ConvertTo-Json -Compress`;
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 5_000 }).trim();
    if (!output) return [];
    const value = JSON.parse(output);
    return Array.isArray(value) ? value : [value];
  } catch { return []; }
}

function samePath(left, right) {
  return resolve(left).toLocaleLowerCase('en-US') === resolve(right).toLocaleLowerCase('en-US');
}

async function isFile(path) {
  try { return (await stat(path)).isFile(); }
  catch { return false; }
}

async function pathExists(path) {
  try { await stat(path); return true; }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
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
