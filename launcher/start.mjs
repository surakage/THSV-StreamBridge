import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, renameSync, rmSync, statSync } from 'node:fs';
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = join(installRoot, 'data');
const runtimeRoot = join(dataRoot, 'runtime');
const recordPath = join(runtimeRoot, 'install-manifest.json');
const pidPath = join(runtimeRoot, 'streambridge.pid');
const launchLockPath = join(runtimeRoot, 'streambridge.launch.lock');
const circuitPath = join(runtimeRoot, 'streambridge-startup-circuit.json');
const configPath = join(dataRoot, 'configuration', 'bridge.local.json');
const tokenPath = join(dataRoot, 'secrets', 'control-token');
const commandDirectoryTokenPath = join(dataRoot, 'secrets', 'command-directory-publish-token.txt');
const openWizard = process.argv.includes('--open-wizard');
const guidedWizard = process.argv.includes('--guided');
const waitOnly = process.argv.includes('--wait');
const restartRequested = process.argv.includes('--restart');
const startupStartedAt = Date.now();
const startupRunId = validRunId(process.env['THSV_STARTUP_RUN_ID']) ?? randomUUID();
let currentPhase = 'initializing';
let currentAttempt = 0;

class BridgeRetryableStartupError extends Error {
  constructor(message) { super(message); this.name = 'BridgeRetryableStartupError'; }
}

class PortOwnershipError extends Error {
  constructor(message) { super(message); this.name = 'PortOwnershipError'; }
}

await run().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const category = classifyStartupFailure(message);
  if (category === 'bridge-health-timeout') await recordCircuitFailure(category, message).catch(() => undefined);
  await writeStartupReport({ outcome: 'failed', category, message, phase: currentPhase, attempt: currentAttempt, durationMs: Date.now() - startupStartedAt }).catch(() => undefined);
  process.stderr.write(`[FAILED] ${message}\nStartup report: ${join(dataRoot, 'logs', 'last-startup-report.json')}\n`);
  process.exitCode = 1;
});

async function run() {
  const record = JSON.parse(stripUtf8Bom(await readFile(recordPath, 'utf8')));
  if (record.product !== 'THSV StreamBridge' || typeof record.activeVersion !== 'string') throw new Error('The installation record is missing or invalid. Run the official installer again.');
  const appRoot = join(installRoot, 'app', record.activeVersion);
  const entrypoint = join(appRoot, 'dist', 'apps', 'bridge-service.js');
  const config = JSON.parse(stripUtf8Bom(await readFile(configPath, 'utf8')));
  if (!Number.isInteger(config.service?.port) || config.service.port < 1 || config.service.port > 65_535) throw new Error('The configured service port is invalid.');
  const baseUrl = `http://127.0.0.1:${String(config.service.port)}`;

  mkdirSync(runtimeRoot, { recursive: true });
  const waitedForLauncher = await acquireLaunchLock();
  process.once('exit', releaseLaunchLock);
  try {
    const effectiveRestartRequested = restartRequested && !waitedForLauncher;
    await writeStartupProgress('checking-existing', 'Checking whether StreamBridge is already healthy.');
    const existingPid = effectiveRestartRequested ? undefined : await healthyExistingProcess(baseUrl, config.service.port);
    if (existingPid !== undefined) {
      await clearCircuitFailures();
      if (openWizard) await openSetupWizard(baseUrl);
      const message = waitedForLauncher
        ? `THSV StreamBridge ${record.activeVersion} is healthy at ${baseUrl}; the overlapping startup request joined the launch already in progress.`
        : `THSV StreamBridge ${record.activeVersion} is already healthy at ${baseUrl}; no restart was needed.`;
      const readinessBlockers = await readReadinessBlockers(baseUrl);
      await writeStartupReport({ outcome: waitedForLauncher ? 'coalesced' : 'already-healthy', category: readinessBlockers.length > 0 ? 'bridge-readiness' : 'none', message: withReadinessSummary(message, readinessBlockers), phase: 'complete', attempt: 0, durationMs: Date.now() - startupStartedAt, readinessBlockers, pid: existingPid, port: config.service.port, version: record.activeVersion }).catch(reportWarning);
      if (!waitOnly) process.stdout.write(`${message}\n`);
      return;
    }

    await assertCircuitClosed();
    await writeStartupProgress('stopping-existing', 'Safely stopping an unresponsive recorded Bridge process before replacement.');
    await stopExisting(baseUrl);
    mkdirSync(join(dataRoot, 'logs'), { recursive: true });
    mkdirSync(runtimeRoot, { recursive: true });
    const stdoutPath = join(dataRoot, 'logs', 'service.stdout.log');
    const stderrPath = join(dataRoot, 'logs', 'service.stderr.log');
    rotateLaunchLog(stdoutPath);
    rotateLaunchLog(stderrPath);
    const childEnvironment = {
      ...process.env,
      THSV_STARTUP_RUN_ID: startupRunId,
      THSV_STREAMBRIDGE_CONFIG: configPath,
      THSV_STREAMBRIDGE_DATA_ROOT: dataRoot,
      THSV_STREAMBRIDGE_ADDONS_ROOT: join(installRoot, 'addons', 'packages'),
      THSV_STREAMBRIDGE_ADDON_STATE_ROOT: join(installRoot, 'addons', 'state'),
    };
    if (existsSync(commandDirectoryTokenPath)) childEnvironment['THSV_COMMAND_DIRECTORY_PUBLISH_TOKEN_FILE'] = commandDirectoryTokenPath;
    else delete childEnvironment['THSV_COMMAND_DIRECTORY_PUBLISH_TOKEN_FILE'];
    let childPid;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      currentAttempt = attempt;
      try {
        childPid = await launchBridgeAttempt({ entrypoint, appRoot, childEnvironment, stdoutPath, stderrPath, baseUrl, port: config.service.port, attempt });
        break;
      } catch (error) {
        await rm(pidPath, { force: true });
        if (!(error instanceof BridgeRetryableStartupError) || attempt === 2) throw error;
        process.stdout.write('StreamBridge did not complete its first startup attempt. Waiting briefly, then retrying once...\n');
        await waitForPortRelease(config.service.port, 5_000);
        await delay(1_500);
      }
    }
    if (childPid === undefined) throw new Error('Windows did not return a process ID for StreamBridge.');

    await clearCircuitFailures();
    const readinessBlockers = await readReadinessBlockers(baseUrl);
    if (openWizard) await writeStartupProgress('opening-wizard', 'Opening a fresh secure Setup Wizard window.', { pid: childPid, port: config.service.port });
    if (openWizard) await openSetupWizard(baseUrl);
    const baseMessage = `THSV StreamBridge ${record.activeVersion} started at ${baseUrl}${effectiveRestartRequested ? ' after an explicit restart' : ''}.`;
    const message = withReadinessSummary(baseMessage, readinessBlockers);
    await writeStartupReport({ outcome: readinessBlockers.length > 0 ? 'started-with-readiness-blockers' : effectiveRestartRequested ? 'restarted' : 'started', category: readinessBlockers.length > 0 ? 'bridge-readiness' : 'none', message, phase: 'complete', attempt: currentAttempt, durationMs: Date.now() - startupStartedAt, readinessBlockers, pid: childPid, port: config.service.port, version: record.activeVersion }).catch(reportWarning);
    if (!waitOnly) process.stdout.write(`${message}\n`);
  } finally {
    process.removeListener('exit', releaseLaunchLock);
    releaseLaunchLock();
  }
}

async function launchBridgeAttempt({ entrypoint, appRoot, childEnvironment, stdoutPath, stderrPath, baseUrl, port, attempt }) {
  await writeStartupProgress('starting-bridge', `Starting StreamBridge process (attempt ${String(attempt)} of 2).`, { attempt, port });
  const stdout = openSync(stdoutPath, 'a');
  const stderr = openSync(stderrPath, 'a');
  const child = spawn(process.execPath, [entrypoint], {
    cwd: appRoot,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', stdout, stderr],
    env: childEnvironment,
  });
  let childPid;
  try {
    childPid = await new Promise((resolveSpawn, rejectSpawn) => {
      child.once('error', rejectSpawn);
      child.once('spawn', () => {
        child.removeListener('error', rejectSpawn);
        if (child.pid === undefined) rejectSpawn(new Error('Windows did not return a process ID for StreamBridge.'));
        else resolveSpawn(child.pid);
      });
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
  child.unref();
  await writeFile(pidPath, `${String(childPid)}\n`, { encoding: 'ascii' });
  await writeStartupProgress('waiting-for-health', `Waiting for StreamBridge health (attempt ${String(attempt)} of 2).`, { attempt, pid: childPid, port });
  try { await waitForHealth(baseUrl, childPid, port, 15_000); }
  catch (error) {
    if (isAlive(childPid) && isOurRuntimeProcess(childPid)) {
      try { process.kill(childPid, 'SIGTERM'); } catch { /* The owned child already stopped. */ }
    }
    throw error;
  }
  return childPid;
}

async function openSetupWizard(baseUrl) {
  const token = (await readFile(tokenPath, 'utf8')).trim();
  const ticketResponse = await fetch(`${baseUrl}/wizard/api/unlock-tickets`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3_000) });
  if (!ticketResponse.ok) throw new Error(`The local wizard could not create a secure unlock link (${String(ticketResponse.status)}).`);
  const ticketResult = await ticketResponse.json();
  if (typeof ticketResult?.ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(ticketResult.ticket)) throw new Error('The local wizard returned an invalid unlock link.');
  const wizardUrl = `${baseUrl}/wizard/${guidedWizard?'?guided=1':''}#unlock=${ticketResult.ticket}`;
  const opener = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', wizardUrl], { detached: true, windowsHide: true, stdio: 'ignore' });
  opener.unref();
}

async function stopExisting(url) {
  let existingPid;
  try { existingPid = Number((await readFile(pidPath, 'utf8')).trim()); } catch { return; }
  if (!Number.isInteger(existingPid) || existingPid < 1 || !isAlive(existingPid)) { await rm(pidPath, { force: true }); return; }
  if (!isOurRuntimeProcess(existingPid)) {
    // A live process exists at the recorded PID, but Windows did not assign it to our own
    // bundled node.exe -- the PID was almost certainly recycled for an unrelated process after
    // an earlier unclean shutdown (crash, forced power-off, a Windows Update reboot). Never
    // signal a process we have not verified is our own: only drop the stale record. If the
    // configured port really is still held by a previous bridge, the new instance's own startup
    // will fail cleanly with a port-conflict error instead of us guessing what to terminate.
    await rm(pidPath, { force: true });
    return;
  }
  try {
    const token = (await readFile(tokenPath, 'utf8')).trim();
    await fetch(`${url}/shutdown`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) });
  } catch { /* The verified installed process is force-closed below if graceful shutdown fails. */ }
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline && isAlive(existingPid)) await delay(100);
  if (isAlive(existingPid) && isOurRuntimeProcess(existingPid)) process.kill(existingPid, 'SIGTERM');
  await rm(pidPath, { force: true });
}

async function healthyExistingProcess(url, port) {
  let existingPid;
  try { existingPid = Number((await readFile(pidPath, 'utf8')).trim()); } catch { return undefined; }
  if (!Number.isInteger(existingPid) || existingPid < 1 || !isAlive(existingPid) || !isOurRuntimeProcess(existingPid)) return undefined;
  if (listeningPidForPort(port) !== existingPid) return undefined;
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return undefined;
    const health = await response.json();
    return health?.status === 'healthy' && health?.service === 'THSV StreamBridge' ? existingPid : undefined;
  } catch { return undefined; }
}

function isOurRuntimeProcess(pid) {
  try {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${String(pid)} -ErrorAction SilentlyContinue).Path`], { encoding: 'utf8', timeout: 5_000, windowsHide: true });
    const reportedPath = (result.stdout ?? '').trim();
    return reportedPath.length > 0 && resolve(reportedPath).toLowerCase() === resolve(process.execPath).toLowerCase();
  } catch { return false; }
}

async function waitForHealth(url, pid, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) throw new BridgeRetryableStartupError(`StreamBridge exited during startup. Check ${join(dataRoot, 'logs', 'service.stderr.log')}.`);
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok && (await response.json()).status === 'healthy') {
        const listenerPid = listeningPidForPort(port);
        if (process.platform !== 'win32' || listenerPid === pid) return;
        if (listenerPid !== undefined) throw new PortOwnershipError(`Port ${String(port)} is owned by PID ${String(listenerPid)}, not the StreamBridge process that was just started. Stop the conflicting app or choose another Bridge port.`);
      }
    } catch (error) {
      if (error instanceof PortOwnershipError) throw error;
      /* Continue until the bounded startup deadline. */
    }
    await delay(200);
  }
  try { process.kill(pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  throw new BridgeRetryableStartupError(`StreamBridge did not become healthy within ${String(timeoutMs)} ms.`);
}

async function waitForPortRelease(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (listeningPidForPort(port) === undefined) return;
    await delay(200);
  }
  const listenerPid = listeningPidForPort(port);
  if (listenerPid !== undefined) throw new PortOwnershipError(`Port ${String(port)} is still owned by PID ${String(listenerPid)} after the first StreamBridge startup attempt.`);
}

function listeningPidForPort(port) {
  if (process.platform !== 'win32') return undefined;
  try {
    const output = spawnSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8', timeout: 5_000, windowsHide: true }).stdout ?? '';
    for (const line of output.split(/\r?\n/u)) {
      const fields = line.trim().split(/\s+/u);
      if (fields[0]?.toUpperCase() !== 'TCP' || fields[3]?.toUpperCase() !== 'LISTENING') continue;
      const address = fields[1] ?? '';
      if (!address.endsWith(`:${String(port)}`)) continue;
      const pid = Number(fields[4]);
      if (Number.isInteger(pid) && pid > 0) return pid;
    }
  } catch { /* The bounded health loop retries while Windows refreshes its listener table. */ }
  return undefined;
}

function isAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function delay(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }
function stripUtf8Bom(value) { return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value; }

function rotateLaunchLog(path, maximumBytes = 5 * 1024 * 1024, retainedFiles = 3) {
  try {
    if (!existsSync(path) || statSync(path).size < maximumBytes) return;
    rmSync(`${path}.${String(retainedFiles)}`, { force: true });
    for (let index = retainedFiles - 1; index >= 1; index -= 1) {
      const source = `${path}.${String(index)}`;
      if (existsSync(source)) renameSync(source, `${path}.${String(index + 1)}`);
    }
    renameSync(path, `${path}.1`);
  } catch (error) {
    process.stderr.write(`THSV StreamBridge could not rotate ${path}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

async function writeStartupReport(details) {
  const logsRoot = join(dataRoot, 'logs');
  mkdirSync(logsRoot, { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    startedAt: new Date(startupStartedAt).toISOString(),
    startupRunId,
    launcher: 'streambridge',
    requestedAction: restartRequested ? 'restart' : 'start',
    ...details,
  };
  const historyPath = join(logsRoot, 'startup-reports.jsonl');
  rotateLaunchLog(historyPath, 512 * 1024, 3);
  await writeLatestStartupReport(report);
  await appendFile(historyPath, `${JSON.stringify(report)}\n`, 'utf8');
}

async function writeStartupProgress(phase, message, details = {}) {
  currentPhase = phase;
  const report = {
    timestamp: new Date().toISOString(),
    startedAt: new Date(startupStartedAt).toISOString(),
    startupRunId,
    launcher: 'streambridge',
    requestedAction: restartRequested ? 'restart' : 'start',
    outcome: 'in-progress',
    category: 'none',
    phase,
    attempt: currentAttempt,
    durationMs: Date.now() - startupStartedAt,
    message,
    ...details,
  };
  await writeLatestStartupReport(report).catch(reportWarning);
}

async function writeLatestStartupReport(report) {
  const logsRoot = join(dataRoot, 'logs');
  mkdirSync(logsRoot, { recursive: true });
  const latestPath = join(logsRoot, 'last-startup-report.json');
  const temporaryLatestPath = `${latestPath}.${String(process.pid)}.tmp`;
  await writeFile(temporaryLatestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  renameSync(temporaryLatestPath, latestPath);
}

async function readReadinessBlockers(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/ready`, { signal: AbortSignal.timeout(2_000) });
    const value = await response.json();
    if (value?.ready === true) return [];
    if (!Array.isArray(value?.blockers)) return [{ kind: 'service', name: 'streambridge', state: 'not-ready', message: 'StreamBridge health passed, but readiness did not.', recovery: 'Open the Setup Wizard connection check for details.' }];
    return value.blockers.slice(0, 20).flatMap((blocker) => {
      if (typeof blocker !== 'object' || blocker === null || Array.isArray(blocker)) return [];
      const item = blocker;
      if (typeof item.kind !== 'string' || typeof item.name !== 'string' || typeof item.state !== 'string' || typeof item.message !== 'string') return [];
      return [{ kind: item.kind.slice(0, 32), name: item.name.slice(0, 128), state: item.state.slice(0, 64), message: item.message.slice(0, 500), recovery: typeof item.recovery === 'string' ? item.recovery.slice(0, 500) : 'Open the Setup Wizard connection check.' }];
    });
  } catch {
    return [{ kind: 'service', name: 'streambridge', state: 'readiness-unavailable', message: 'StreamBridge health passed, but the readiness details could not be read.', recovery: 'Open the Setup Wizard connection check and review Diagnostics.' }];
  }
}

function withReadinessSummary(message, blockers) {
  if (blockers.length === 0) return message;
  const names = blockers.slice(0, 4).map((blocker) => `${blocker.kind}:${blocker.name} (${blocker.state})`).join(', ');
  return `${message} Readiness still needs attention: ${names}.`;
}

async function assertCircuitClosed() {
  const state = await readCircuitState();
  const cutoff = Date.now() - 10 * 60_000;
  const recent = state.failures.filter((failure) => Date.parse(failure.at) >= cutoff);
  const last = recent.at(-1);
  if (last === undefined) return;
  const matching = recent.filter((failure) => failure.fingerprint === last.fingerprint);
  if (matching.length < 3) return;
  const lastFailureAt = Date.parse(last.at);
  const retryAt = lastFailureAt + 5 * 60_000;
  if (retryAt <= Date.now()) return;
  throw new Error(`StreamBridge crash-loop protection is active after ${String(matching.length)} repeated startup failures. Automatic startup is paused until ${new Date(retryAt).toLocaleTimeString()}. Review service.stderr.log before trying again.`);
}

async function recordCircuitFailure(category, message) {
  mkdirSync(runtimeRoot, { recursive: true });
  const state = await readCircuitState();
  const cutoff = Date.now() - 10 * 60_000;
  const fingerprint = createHash('sha256').update(`${category}:${message.replaceAll(/\d+/gu, '#')}`).digest('hex').slice(0, 24);
  const failures = [...state.failures.filter((failure) => Date.parse(failure.at) >= cutoff), { at: new Date().toISOString(), fingerprint }].slice(-10);
  await writeCircuitState({ version: 1, failures });
}

async function clearCircuitFailures() { await rm(circuitPath, { force: true }); }

async function readCircuitState() {
  try {
    const value = JSON.parse(await readFile(circuitPath, 'utf8'));
    const failures = Array.isArray(value?.failures) ? value.failures.filter((failure) => typeof failure?.at === 'string' && !Number.isNaN(Date.parse(failure.at)) && typeof failure?.fingerprint === 'string').map((failure) => ({ at: failure.at, fingerprint: failure.fingerprint.slice(0, 64) })) : [];
    return { version: 1, failures };
  } catch { return { version: 1, failures: [] }; }
}

async function writeCircuitState(state) {
  const temporary = `${circuitPath}.${String(process.pid)}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  renameSync(temporary, circuitPath);
}

function classifyStartupFailure(message) {
  if (/crash-loop protection/iu.test(message)) return 'crash-loop-open';
  if (/Streamer\.bot.*(?:exited|crash|unavailable)|ECONNREFUSED.*8081/iu.test(message)) return 'streamerbot-crash';
  if (/port.*(?:owned|conflict|already in use)|EADDRINUSE/iu.test(message)) return 'port-conflict';
  if (/configur(?:ation|ed)|invalid.*(?:input|key)|JSON/iu.test(message)) return 'bridge-configuration';
  if (/healthy|health check|startup|exited during startup/iu.test(message)) return 'bridge-health-timeout';
  return 'launcher-error';
}

function reportWarning(error) {
  process.stderr.write(`Warning: the startup report could not be saved (${error instanceof Error ? error.message : String(error)}).\n`);
}

function validRunId(value) { return typeof value === 'string' && /^[0-9a-f-]{36}$/iu.test(value) ? value : undefined; }

async function acquireLaunchLock() {
  const deadline = Date.now() + 45_000;
  let waited = false;
  while (Date.now() < deadline) {
    try { await writeFile(launchLockPath, `${String(process.pid)}\n`, { flag: 'wx', encoding: 'ascii', mode: 0o600 }); return waited; }
    catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const owner = Number((await readFile(launchLockPath, 'ascii').catch(() => '')).trim());
      if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) {
        if (!waited) process.stdout.write(`Another StreamBridge startup is already running (PID ${String(owner)}); waiting for its result...\n`);
        waited = true;
        await delay(250);
        continue;
      }
      const currentOwner = Number((await readFile(launchLockPath, 'ascii').catch(() => '')).trim());
      if (currentOwner === owner) await rm(launchLockPath, { force: true });
    }
  }
  throw new Error('The existing THSV StreamBridge startup did not finish within 45 seconds.');
}

function releaseLaunchLock() { try { rmSync(launchLockPath, { force: true }); } catch { /* Best effort during process exit. */ } }
