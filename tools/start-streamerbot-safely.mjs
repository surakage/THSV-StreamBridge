import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

const DEFAULT_WEBSOCKET_PORT = 8081;
const RELEASE_TIMEOUT_MS = 30_000;
const START_TIMEOUT_MS = 45_000;

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
  if (process.platform !== 'win32') throw new Error('The safe Streamer.bot launcher is Windows-only.');
  const resolvedInstallRoot = installRoot === undefined ? undefined : resolve(installRoot);
  const port = websocketPort ?? resolveWebSocketPort(resolvedInstallRoot);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`Invalid Streamer.bot WebSocket port: ${String(port)}.`);
  const exe = resolve(executable ?? resolveStreamerBotExecutable(resolvedInstallRoot));
  if (!existsSync(exe) || basename(exe).toLocaleLowerCase('en-US') !== 'streamer.bot.exe')
    throw new Error(`Streamer.bot.exe was not found at ${exe}. Set THSV_STREAMERBOT_EXE or pass --exe.`);
  if (save && resolvedInstallRoot !== undefined) saveLauncherConfiguration(resolvedInstallRoot, exe, port);

  const releaseLock = acquireLock(port);
  try {
    let processes = streamerBotProcesses().filter((item) => item.path && samePath(item.path, exe));
    let listener = portListener(port);

    if (checkOnly) {
      if (listener === undefined) throw new Error(`Port ${String(port)} is not listening.`);
      const owner = processDetails(listener.pid);
      if (owner?.path === undefined || !samePath(owner.path, exe)) throw portConflict(port, listener, owner);
      output.write(`Streamer.bot is healthy on 127.0.0.1:${String(port)} (PID ${String(listener.pid)}).\n`);
      return { pid: listener.pid, repaired: false };
    }

    if (listener !== undefined) {
      const owner = processDetails(listener.pid);
      if (owner?.path !== undefined && samePath(owner.path, exe)) {
        output.write(`Streamer.bot is already healthy on 127.0.0.1:${String(port)} (PID ${String(listener.pid)}).\n`);
        return { pid: listener.pid, repaired: false };
      }
      if (isAlive(listener.pid)) throw portConflict(port, listener, owner);
      output.write(`Waiting for stale port ${String(port)} ownership from PID ${String(listener.pid)} to clear...\n`);
      await waitForPortRelease(port, RELEASE_TIMEOUT_MS);
      listener = portListener(port);
      if (listener !== undefined) throw portConflict(port, listener, processDetails(listener.pid));
    }

    let repaired = false;
    if (processes.length > 0) {
      repaired = true;
      output.write('Streamer.bot is running without its WebSocket listener. Closing that incomplete session safely...\n');
      for (const item of processes) requestClose(item.pid);
      await waitUntil(() => processes.every((item) => !isAlive(item.pid)), RELEASE_TIMEOUT_MS, 'Streamer.bot did not close within 30 seconds. Close it manually; no process was force-terminated.');
      await waitForPortRelease(port, RELEASE_TIMEOUT_MS);
    }

    listener = portListener(port);
    if (listener !== undefined) throw portConflict(port, listener, processDetails(listener.pid));

    const child = spawn(exe, [], { cwd: dirname(exe), detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    if (child.pid === undefined) throw new Error('Windows did not return a Streamer.bot process ID.');
    output.write(`Starting Streamer.bot (PID ${String(child.pid)}) after confirming port ${String(port)} is free...\n`);
    await waitUntil(() => {
      if (!isAlive(child.pid)) throw new Error('Streamer.bot exited before its WebSocket server became ready.');
      const current = portListener(port);
      if (current === undefined) return false;
      if (current.pid !== child.pid) throw portConflict(port, current, processDetails(current.pid));
      return true;
    }, START_TIMEOUT_MS, `Streamer.bot did not open 127.0.0.1:${String(port)} within 45 seconds.`);
    output.write(`Streamer.bot is ready on 127.0.0.1:${String(port)} (PID ${String(child.pid)}).\n`);
    return { pid: child.pid, repaired };
  } finally {
    releaseLock();
  }
}

function resolveStreamerBotExecutable(installRoot) {
  const configured = process.env['THSV_STREAMERBOT_EXE']?.trim();
  if (configured) return configured;
  const saved = installRoot === undefined ? undefined : readLauncherConfiguration(installRoot)?.executable;
  if (saved && existsSync(saved)) return saved;
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
  try {
    const value = JSON.parse(readFileSync(launcherConfigurationPath(installRoot), 'utf8'));
    return (value?.version === 1 || value?.version === 2) && typeof value.executable === 'string' ? value : undefined;
  } catch { return undefined; }
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

function acquireLock(port) {
  const lockPath = resolve(tmpdir(), `thsv-streamerbot-start-${String(port)}.lock`);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = openSync(lockPath, 'wx', 0o600);
      writeFileSync(handle, `${String(process.pid)}\n`, { encoding: 'ascii' });
      closeSync(handle);
      return () => { try { rmSync(lockPath, { force: true }); } catch { /* Best effort. */ } };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const owner = Number(readFileSync(lockPath, 'ascii').trim());
      if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) throw new Error(`Another safe Streamer.bot launcher is already running (PID ${String(owner)}).`, { cause: error });
      rmSync(lockPath, { force: true });
    }
  }
  throw new Error('Could not acquire the safe Streamer.bot startup lock.');
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
