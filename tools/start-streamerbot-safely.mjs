import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

const DEFAULT_WEBSOCKET_PORT = 8081;
const RELEASE_TIMEOUT_MS = 30_000;
const START_TIMEOUT_MS = 45_000;
const START_RETRY_DELAY_MS = 1_500;
const START_ATTEMPTS = 2;
const EXISTING_HEALTH_STABILITY_MS = 4_000;
const STREAMERBOT_LOCK_STALE_MS = 130_000;
const STREAMERBOT_LOCK_HEARTBEAT_MS = 5_000;
const MAXIMUM_LAUNCHER_CONFIGURATION_BYTES = 256 * 1024;

export function parseNetstatListeners(output, port = DEFAULT_WEBSOCKET_PORT) {
  const expected = `:${String(port)}`;
  const listeners = [];
  for (const line of output.split(/\r?\n/u)) {
    const fields = line.trim().split(/\s+/u);
    if (fields.length < 5 || fields[0]?.toUpperCase() !== 'TCP' || fields[3]?.toUpperCase() !== 'LISTENING') continue;
    if (!fields[1]?.endsWith(expected)) continue;
    const pid = Number(fields[4]);
    if (Number.isInteger(pid) && pid > 0) listeners.push({ address: fields[1], pid });
  }
  return listeners;
}

export function samePath(left, right) {
  return resolve(left).toLocaleLowerCase('en-US') === resolve(right).toLocaleLowerCase('en-US');
}

export async function startStreamerBotSafely({ executable, websocketPort, installRoot, checkOnly = false, save = false, output = process.stdout } = {}) {
  const startupStartedAt = Date.now();
  const startupRunId = validRunId(process.env['THSV_STARTUP_RUN_ID']) ?? randomUUID();
  if (process.platform !== 'win32') throw new Error('The safe Streamer.bot launcher is Windows-only.');
  const resolvedInstallRoot = installRoot === undefined ? undefined : resolve(installRoot);
  const port = websocketPort ?? resolveWebSocketPort(resolvedInstallRoot);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`Invalid Streamer.bot WebSocket port: ${String(port)}.`);
  const selectedExecutable = executable ?? resolveStreamerBotExecutable(resolvedInstallRoot);
  if (!isAbsolute(selectedExecutable)) throw new Error('The saved Streamer.bot executable path is not absolute. Open the StreamBridge Setup Wizard and select the exact Streamer.bot.exe again.');
  const exe = resolve(selectedExecutable);
  if (!existsSync(exe) || basename(exe).toLocaleLowerCase('en-US') !== 'streamer.bot.exe')
    throw new Error(`Streamer.bot.exe was not found at ${exe}. Set THSV_STREAMERBOT_EXE or pass --exe.`);
  if (save && resolvedInstallRoot !== undefined) saveLauncherConfiguration(resolvedInstallRoot, exe, port);

  const releaseLock = await acquireLock(port, output);
  try {
    assertStreamerBotCircuitClosed(resolvedInstallRoot, port);
    writeStreamerBotProgress(resolvedInstallRoot, startupStartedAt, startupRunId, checkOnly ? 'checking' : 'checking-existing', checkOnly ? 'Checking the existing Streamer.bot listener.' : 'Checking Streamer.bot processes and WebSocket ownership.');
    let repaired = false;
    let processes = streamerBotProcesses().filter((item) => item.path && samePath(item.path, exe));
    let listener = portListener(port);

    if (checkOnly) {
      if (listener === undefined) throw new Error(`Port ${String(port)} is not listening.`);
      const owner = processDetails(listener.pid);
      if (owner?.path === undefined || !samePath(owner.path, exe)) throw portConflict(port, listener, owner);
      if (!await listenerRemainsHealthy(port, listener.pid, EXISTING_HEALTH_STABILITY_MS))
        throw new Error(`Streamer.bot stopped listening on port ${String(port)} during its stability check.`);
      output.write(`Streamer.bot is healthy on 127.0.0.1:${String(port)} (PID ${String(listener.pid)}).\n`);
      clearStreamerBotCircuit(resolvedInstallRoot, port);
      writeStreamerBotResult(resolvedInstallRoot, startupStartedAt, startupRunId, { outcome: 'ready', category: 'none', phase: 'complete', message: `Streamer.bot is healthy on 127.0.0.1:${String(port)}.`, pid: listener.pid, port });
      return { pid: listener.pid, repaired: false };
    }

    if (listener !== undefined) {
      const owner = processDetails(listener.pid);
      if (owner?.path !== undefined && samePath(owner.path, exe)) {
        output.write(`Confirming the existing Streamer.bot listener is stable on 127.0.0.1:${String(port)}...\n`);
        if (await listenerRemainsHealthy(port, listener.pid, EXISTING_HEALTH_STABILITY_MS)) {
          output.write(`Streamer.bot is already healthy on 127.0.0.1:${String(port)} (PID ${String(listener.pid)}).\n`);
          clearStreamerBotCircuit(resolvedInstallRoot, port);
          writeStreamerBotResult(resolvedInstallRoot, startupStartedAt, startupRunId, { outcome: 'already-healthy', category: 'none', phase: 'complete', message: `Streamer.bot is already healthy on 127.0.0.1:${String(port)}.`, pid: listener.pid, port });
          return { pid: listener.pid, repaired: false };
        }
        repaired = true;
        output.write('The existing Streamer.bot session was already closing. Waiting for it to release the port before starting a replacement...\n');
        await waitForPortRelease(port, RELEASE_TIMEOUT_MS);
        processes = streamerBotProcesses().filter((item) => item.path && samePath(item.path, exe));
        listener = undefined;
      }
      if (listener !== undefined && isAlive(listener.pid)) throw portConflict(port, listener, owner);
      if (listener === undefined) {
        // The matching listener closed during its stability check; continue into normal recovery.
      } else {
      output.write(`Waiting for stale port ${String(port)} ownership from PID ${String(listener.pid)} to clear...\n`);
      await waitForPortRelease(port, RELEASE_TIMEOUT_MS);
      listener = portListener(port);
      if (listener !== undefined) throw portConflict(port, listener, processDetails(listener.pid));
      }
    }

    if (processes.length > 0) {
      repaired = true;
      output.write('Streamer.bot is running without its WebSocket listener. Closing that incomplete session safely...\n');
      for (const item of processes) requestClose(item.pid);
      await waitUntil(() => processes.every((item) => !isAlive(item.pid)), RELEASE_TIMEOUT_MS, 'Streamer.bot did not close within 30 seconds. Close it manually; no process was force-terminated.');
      await waitForPortRelease(port, RELEASE_TIMEOUT_MS);
    }

    listener = portListener(port);
    if (listener !== undefined) throw portConflict(port, listener, processDetails(listener.pid));

    for (let attempt = 1; attempt <= START_ATTEMPTS; attempt += 1) {
      writeStreamerBotProgress(resolvedInstallRoot, startupStartedAt, startupRunId, 'starting-streamerbot', `Starting Streamer.bot (attempt ${String(attempt)} of ${String(START_ATTEMPTS)}).`, { attempt, port });
      const child = spawn(exe, [], { cwd: dirname(exe), detached: true, stdio: 'ignore', windowsHide: false });
      child.unref();
      if (child.pid === undefined) throw new Error('Windows did not return a Streamer.bot process ID.');
      output.write(`Starting Streamer.bot (PID ${String(child.pid)}) after confirming port ${String(port)} is free...\n`);
      try {
        writeStreamerBotProgress(resolvedInstallRoot, startupStartedAt, startupRunId, 'waiting-for-websocket', `Waiting for Streamer.bot WebSocket port ${String(port)} (attempt ${String(attempt)} of ${String(START_ATTEMPTS)}).`, { attempt, pid: child.pid, port });
        await waitUntil(() => {
          if (!isAlive(child.pid)) throw new StreamerBotStartupExitError();
          const current = portListener(port);
          if (current === undefined) return false;
          if (current.pid !== child.pid) throw portConflict(port, current, processDetails(current.pid));
          return true;
        }, START_TIMEOUT_MS, `Streamer.bot did not open 127.0.0.1:${String(port)} within 45 seconds.`);
        output.write(`Streamer.bot is ready on 127.0.0.1:${String(port)} (PID ${String(child.pid)}).\n`);
        clearStreamerBotCircuit(resolvedInstallRoot, port);
        writeStreamerBotResult(resolvedInstallRoot, startupStartedAt, startupRunId, { outcome: repaired ? 'repaired' : 'ready', category: 'none', phase: 'complete', attempt, message: `Streamer.bot is ready on 127.0.0.1:${String(port)}.`, pid: child.pid, port });
        return { pid: child.pid, repaired };
      } catch (error) {
        if (!(error instanceof StreamerBotStartupExitError) || attempt === START_ATTEMPTS) throw error;
        repaired = true;
        output.write('Streamer.bot exited during its first startup attempt. Waiting briefly, then retrying once...\n');
        await waitForPortRelease(port, RELEASE_TIMEOUT_MS);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, START_RETRY_DELAY_MS));
      }
    }
    throw new Error('Streamer.bot did not reach ready state.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const category = /crash-loop protection/iu.test(message) ? 'crash-loop-open' : isStreamerBotCrashFailure(error) ? 'streamerbot-crash' : /port/iu.test(message) ? 'port-conflict' : 'launcher-error';
    if (category === 'streamerbot-crash') recordStreamerBotCircuitFailure(resolvedInstallRoot, port, message);
    writeStreamerBotResult(resolvedInstallRoot, startupStartedAt, startupRunId, { outcome: 'failed', category, phase: 'failed', message, port });
    throw error;
  } finally {
    releaseLock();
  }
}

class StreamerBotStartupExitError extends Error {
  constructor() {
    super('Streamer.bot exited before its WebSocket server became ready. A retry was attempted; review the newest Streamer.bot log and Windows Application log for the underlying crash.');
    this.name = 'StreamerBotStartupExitError';
  }
}

function resolveStreamerBotExecutable(installRoot) {
  const configured = process.env['THSV_STREAMERBOT_EXE']?.trim();
  if (configured) return configured;
  const savedConfiguration = installRoot === undefined ? undefined : readLauncherConfiguration(installRoot);
  if (savedConfiguration !== undefined) {
    const saved = savedConfiguration.executable.trim();
    if (!isAbsolute(saved) || basename(saved).toLocaleLowerCase('en-US') !== 'streamer.bot.exe' || !existsSync(saved)) throw new Error(`The saved Streamer.bot executable is missing or invalid: ${saved || '(empty path)'}. Automatic fallback is disabled so another installation cannot be opened accidentally. Open the StreamBridge Setup Wizard and select the exact Streamer.bot.exe again.`);
    return saved;
  }
  const running = streamerBotProcesses().map((item) => item.path).find((path) => path && existsSync(path));
  if (running) return running;
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const candidates = [
    resolve(repositoryRoot, '..', 'THSV Streamer Bot', 'Streamer.bot.exe'),
    resolve(process.cwd(), 'Streamer.bot.exe'),
    ...(process.env['LOCALAPPDATA'] ? [resolve(process.env['LOCALAPPDATA'], 'Streamer.bot', 'Streamer.bot.exe')] : []),
    ...(process.env['USERPROFILE'] ? [resolve(process.env['USERPROFILE'], 'Desktop', 'Streamer.bot', 'Streamer.bot.exe'), resolve(process.env['USERPROFILE'], 'Downloads', 'Streamer.bot', 'Streamer.bot.exe')] : []),
  ];
  const found = candidates.find(existsSync);
  if (found) return found;
  throw new Error('Streamer.bot.exe is not configured. Open the StreamBridge setup wizard, choose Streamer.bot connection, and select the portable executable once.');
}

function launcherConfigurationPath(installRoot) { return join(installRoot, 'data', 'configuration', 'streamerbot-launcher.json'); }
function readLauncherConfiguration(installRoot) {
  const path = launcherConfigurationPath(installRoot);
  if (!existsSync(path)) return undefined;
  try {
    if (statSync(path).size > MAXIMUM_LAUNCHER_CONFIGURATION_BYTES) throw new Error('file exceeds 256 KB');
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if ((value?.version !== 1 && value?.version !== 2) || typeof value.executable !== 'string') throw new Error('required launcher fields are invalid');
    return value;
  } catch (error) {
    throw new Error(`The saved streaming-tool configuration is damaged (${error instanceof Error ? error.message : String(error)}). Open the StreamBridge Setup Wizard and select the exact executable paths again.`, { cause: error });
  }
}
function saveLauncherConfiguration(installRoot, executable, websocketPort) {
  const path = launcherConfigurationPath(installRoot);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${String(process.pid)}.tmp`;
  const previous = readLauncherConfiguration(installRoot);
  const optionalApps = previous?.version === 2 && typeof previous.optionalApps === 'object' && previous.optionalApps !== null ? previous.optionalApps : {};
  writeFileSync(temporary, `${JSON.stringify({ version: 2, executable, websocketPort, optionalApps, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}
function resolveWebSocketPort(installRoot) {
  if (installRoot !== undefined) {
    try {
      const bridge = JSON.parse(readFileSync(join(installRoot, 'data', 'configuration', 'bridge.local.json'), 'utf8'));
      const url = new URL(bridge.streamerbot?.url);
      const port = Number(url.port || (url.protocol === 'wss:' ? 443 : 80));
      if (Number.isInteger(port) && port > 0 && port <= 65_535) return port;
    } catch { /* Fall back to Streamer.bot's documented default. */ }
  }
  const saved = installRoot === undefined ? undefined : readLauncherConfiguration(installRoot)?.websocketPort;
  if (Number.isInteger(saved) && saved > 0 && saved <= 65_535) return saved;
  return DEFAULT_WEBSOCKET_PORT;
}

function netstat() {
  try { return execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true, timeout: 5_000 }); }
  catch { return ''; }
}

function portListener(port) {
  return parseNetstatListeners(netstat(), port)[0];
}

function processDetails(pid) {
  try {
    const command = `$p=Get-Process -Id ${String(pid)} -ErrorAction Stop; [pscustomobject]@{pid=$p.Id;name=$p.ProcessName;path=$p.Path}|ConvertTo-Json -Compress`;
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 5_000 }).trim();
    const value = JSON.parse(raw);
    return { pid: Number(value.pid), name: String(value.name ?? 'unknown'), path: typeof value.path === 'string' ? value.path : undefined };
  } catch { return undefined; }
}

function streamerBotProcesses() {
  try {
    const command = `@(Get-Process -Name 'Streamer.bot' -ErrorAction SilentlyContinue|ForEach-Object{[pscustomobject]@{pid=$_.Id;path=$_.Path}})|ConvertTo-Json -Compress`;
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 5_000 }).trim();
    if (!raw) return [];
    const value = JSON.parse(raw);
    return (Array.isArray(value) ? value : [value]).map((item) => ({ pid: Number(item.pid), path: typeof item.path === 'string' ? item.path : undefined })).filter((item) => Number.isInteger(item.pid) && item.pid > 0);
  } catch { return []; }
}

function requestClose(pid) {
  const command = `$p=Get-Process -Id ${String(pid)} -ErrorAction Stop; if(-not $p.CloseMainWindow()){exit 2}`;
  try { execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 5_000 }); }
  catch { throw new Error(`Streamer.bot PID ${String(pid)} could not be closed through its normal window. Close it manually; no process was force-terminated.`); }
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitForPortRelease(port, timeoutMs) {
  await waitUntil(() => portListener(port) === undefined, timeoutMs, `Port ${String(port)} did not release within ${String(timeoutMs / 1_000)} seconds.`);
}

async function listenerRemainsHealthy(port, pid, durationMs) {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    const listener = portListener(port);
    if (listener?.pid !== pid || !isAlive(pid)) return false;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  const listener = portListener(port);
  return listener?.pid === pid && isAlive(pid);
}

async function waitUntil(predicate, timeoutMs, timeoutMessage) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(timeoutMessage);
}

function portConflict(port, listener, owner) {
  const identity = owner === undefined ? `PID ${String(listener.pid)}` : `${owner.name} (PID ${String(owner.pid)})`;
  return new Error(`Port ${String(port)} is already owned by ${identity}. It was not stopped. Close that application or change the Streamer.bot WebSocket port deliberately in both Streamer.bot and StreamBridge.`);
}

function isStreamerBotCrashFailure(error) {
  if (error instanceof StreamerBotStartupExitError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /exited before|exited during|did not open 127\.0\.0\.1|stopped listening.*stability/iu.test(message);
}

function streamerBotCircuitPath(installRoot, port) {
  return installRoot === undefined ? undefined : join(installRoot, 'data', 'runtime', `streamerbot-${String(port)}-startup-circuit.json`);
}

function assertStreamerBotCircuitClosed(installRoot, port) {
  const state = readStreamerBotCircuit(installRoot, port);
  const cutoff = Date.now() - 10 * 60_000;
  const recent = state.failures.filter((failure) => Date.parse(failure.at) >= cutoff);
  const last = recent.at(-1);
  if (last === undefined) return;
  const matching = recent.filter((failure) => failure.fingerprint === last.fingerprint);
  if (matching.length < 3) return;
  const retryAt = Date.parse(last.at) + 5 * 60_000;
  if (retryAt <= Date.now()) return;
  throw new Error(`Streamer.bot crash-loop protection is active after ${String(matching.length)} repeated startup failures. Automatic startup is paused until ${new Date(retryAt).toLocaleTimeString()}. Review the newest Streamer.bot log and Windows Application log before trying again.`);
}

function recordStreamerBotCircuitFailure(installRoot, port, message) {
  const path = streamerBotCircuitPath(installRoot, port);
  if (path === undefined) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const state = readStreamerBotCircuit(installRoot, port);
    const cutoff = Date.now() - 10 * 60_000;
    const fingerprint = createHash('sha256').update(message.replaceAll(/\d+/gu, '#')).digest('hex').slice(0, 24);
    const failures = [...state.failures.filter((failure) => Date.parse(failure.at) >= cutoff), { at: new Date().toISOString(), fingerprint }].slice(-10);
    writeJsonAtomicSync(path, { version: 1, failures });
  } catch { /* Crash-loop history is best-effort and must not hide the original startup error. */ }
}

function clearStreamerBotCircuit(installRoot, port) {
  const path = streamerBotCircuitPath(installRoot, port);
  if (path === undefined) return;
  try { rmSync(path, { force: true }); } catch { /* A healthy launch remains successful if cleanup is unavailable. */ }
}

function readStreamerBotCircuit(installRoot, port) {
  const path = streamerBotCircuitPath(installRoot, port);
  if (path === undefined) return { version: 1, failures: [] };
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    const failures = Array.isArray(value?.failures) ? value.failures.filter((failure) => typeof failure?.at === 'string' && !Number.isNaN(Date.parse(failure.at)) && typeof failure?.fingerprint === 'string').map((failure) => ({ at: failure.at, fingerprint: failure.fingerprint.slice(0, 64) })) : [];
    return { version: 1, failures };
  } catch { return { version: 1, failures: [] }; }
}

function writeStreamerBotProgress(installRoot, startedAt, startupRunId, phase, message, details = {}) {
  writeStreamerBotReport(installRoot, startedAt, startupRunId, { outcome: 'in-progress', category: 'none', phase, message, ...details }, false);
}

function writeStreamerBotResult(installRoot, startedAt, startupRunId, details) {
  writeStreamerBotReport(installRoot, startedAt, startupRunId, details, true);
}

function writeStreamerBotReport(installRoot, startedAt, startupRunId, details, retainHistory) {
  if (installRoot === undefined) return;
  try {
    const logsRoot = join(installRoot, 'data', 'logs');
    mkdirSync(logsRoot, { recursive: true });
    const report = { timestamp: new Date().toISOString(), startedAt: new Date(startedAt).toISOString(), startupRunId, launcher: 'streamerbot', requestedAction: 'start', durationMs: Date.now() - startedAt, ...details };
    writeJsonAtomicSync(join(logsRoot, 'last-startup-report.json'), report);
    if (retainHistory) {
      const historyPath = join(logsRoot, 'startup-reports.jsonl');
      rotateReportHistorySync(historyPath);
      appendFileSync(historyPath, `${JSON.stringify(report)}\n`, 'utf8');
    }
  } catch { /* Startup reporting is diagnostic and must not change launch behavior. */ }
}

function validRunId(value) { return typeof value === 'string' && /^[0-9a-f-]{36}$/iu.test(value) ? value : undefined; }

function writeJsonAtomicSync(path, value) {
  const temporary = `${path}.${String(process.pid)}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

function rotateReportHistorySync(path, maximumBytes = 512 * 1024, retainedFiles = 3) {
  if (!existsSync(path) || statSync(path).size < maximumBytes) return;
  rmSync(`${path}.${String(retainedFiles)}`, { force: true });
  for (let index = retainedFiles - 1; index >= 1; index -= 1) {
    const source = `${path}.${String(index)}`;
    if (existsSync(source)) renameSync(source, `${path}.${String(index + 1)}`);
  }
  renameSync(path, `${path}.1`);
}

async function acquireLock(port, output) {
  const lockPath = resolve(tmpdir(), `thsv-streamerbot-start-${String(port)}.lock`);
  const deadline = Date.now() + 100_000;
  const lockRecord = `${JSON.stringify({ version: 1, pid: process.pid, createdAt: new Date().toISOString() })}\n`;
  let waited = false;
  while (Date.now() < deadline) {
    try {
      const handle = openSync(lockPath, 'wx', 0o600);
      writeFileSync(handle, lockRecord, { encoding: 'utf8' });
      closeSync(handle);
      const heartbeat = setInterval(() => refreshOwnedLock(lockPath, lockRecord), STREAMERBOT_LOCK_HEARTBEAT_MS);
      heartbeat.unref();
      return () => {
        clearInterval(heartbeat);
        try { if (readFileSync(lockPath, 'utf8') === lockRecord) rmSync(lockPath, { force: true }); }
        catch { /* The lock was already released or replaced. */ }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let snapshot;
      try { snapshot = readFileSync(lockPath, 'utf8'); } catch { snapshot = undefined; }
      const owner = parseLockOwner(snapshot, lockPath);
      const ownerIdentity = owner === undefined ? undefined : streamerBotLockOwnerMatches(owner.pid);
      if (owner !== undefined && isAlive(owner.pid) && ownerIdentity !== false && Date.now() - owner.createdAtMs <= STREAMERBOT_LOCK_STALE_MS) {
        if (!waited) output.write(`Another Streamer.bot startup is already running (PID ${String(owner.pid)}); waiting for its result...\n`);
        waited = true;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
        continue;
      }
      let currentSnapshot;
      try { currentSnapshot = readFileSync(lockPath, 'utf8'); } catch { currentSnapshot = undefined; }
      if (currentSnapshot === snapshot) {
        rmSync(lockPath, { force: true });
        if (owner !== undefined && isAlive(owner.pid)) output.write(`Recovered an expired Streamer.bot startup lock owned by PID ${String(owner.pid)}.\n`);
      }
    }
  }
  throw new Error('The existing Streamer.bot startup did not finish within 100 seconds.');
}

function parseLockOwner(raw, path) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
  try {
    const value = JSON.parse(raw);
    const createdAtMs = Date.parse(value?.createdAt);
    return Number.isInteger(value?.pid) && value.pid > 0 && Number.isFinite(createdAtMs) ? { pid: value.pid, createdAtMs: Math.max(createdAtMs, statSync(path).mtimeMs) } : undefined;
  } catch {
    const pid = Number(raw.trim());
    if (!Number.isInteger(pid) || pid <= 0) return undefined;
    try { return { pid, createdAtMs: statSync(path).mtimeMs }; } catch { return undefined; }
  }
}

function refreshOwnedLock(path, lockRecord) {
  try {
    if (readFileSync(path, 'utf8') !== lockRecord) return;
    const now = new Date();
    utimesSync(path, now, now);
  } catch { /* The lock was released or replaced. */ }
}

function streamerBotLockOwnerMatches(pid) {
  try {
    const command = `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${String(pid)}' -ErrorAction Stop).CommandLine`;
    const commandLine = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 5_000 }).trim().toLocaleLowerCase('en-US');
    return commandLine.includes('start-streamerbot');
  } catch { return undefined; }
}

function argumentsFromCommandLine(values) {
  let executable;
  let websocketPort;
  let installRoot;
  let checkOnly = false;
  let save = false;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--check') checkOnly = true;
    else if (values[index] === '--exe') executable = values[++index];
    else if (values[index] === '--port') websocketPort = Number(values[++index]);
    else if (values[index] === '--install-root') installRoot = values[++index];
    else if (values[index] === '--save') save = true;
    else throw new Error(`Unknown safe-launch option: ${String(values[index])}`);
  }
  return { executable, websocketPort, installRoot, checkOnly, save };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startStreamerBotSafely(argumentsFromCommandLine(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`[FAILED] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
