import { spawn } from 'node:child_process';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = join(repoRoot, 'data', 'runtime');
const pidPath = join(runtimeRoot, 'streambridge.pid');
const activeConfigPath = join(runtimeRoot, 'active-config.txt');
const startupLockPath = join(runtimeRoot, 'dev-start.lock');
const tsxCli = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const requestedConfig = await resolveRequestedConfig();
const activeConfig = await resolveActiveConfig(requestedConfig);

await mkdir(runtimeRoot, { recursive: true });
let stopping = false;
let becameHealthy = false;
let unavailableSince;
const startupLock = await acquireStartupLock();
let child;
let baseUrl;
try {
  await stopExisting(activeConfig);
  await writeFile(pidPath, `${String(process.pid)}\n`, { encoding: 'ascii' });
  await writeFile(activeConfigPath, `${configMarker(requestedConfig)}\n`, { encoding: 'utf8' });

  const settings = await readSettings(requestedConfig);
  baseUrl = serviceBaseUrl(settings);
  child = spawn(process.execPath, [tsxCli, 'watch', 'apps/bridge-service.ts'], {
    cwd: repoRoot,
    env: { ...process.env, THSV_STREAMBRIDGE_CONFIG: requestedConfig },
    stdio: 'inherit',
  });
  await waitForInitialHealth(baseUrl, child);
  becameHealthy = true;
} catch (error) {
  await removeOwnedRuntimeMarkers();
  throw error;
} finally {
  await startupLock.close();
  await rm(startupLockPath, { force: true });
}

const monitor = setInterval(() => void monitorHealth(), 300);
monitor.unref();

child.once('exit', (code, signal) => void finish(code ?? (signal === null ? 1 : 0)));
process.once('SIGINT', () => void stop('SIGINT'));
process.once('SIGTERM', () => void stop('SIGTERM'));

async function monitorHealth() {
  if (stopping) return;
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(750) });
    if (!response.ok) throw new Error(`Health returned ${String(response.status)}.`);
    becameHealthy = true;
    unavailableSince = undefined;
  } catch {
    if (!becameHealthy) return;
    unavailableSince ??= Date.now();
    if (Date.now() - unavailableSince >= 2_000) await stop('service-stopped');
  }
}

async function waitForInitialHealth(url, spawnedChild) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (spawnedChild.exitCode !== null || spawnedChild.signalCode !== null) throw new Error('Development bridge exited before becoming healthy.');
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(750) });
      if (response.ok && (await response.json()).status === 'healthy') return;
    } catch { /* Continue through the bounded startup window. */ }
    await delay(200);
  }
  spawnedChild.kill('SIGTERM');
  throw new Error('Development bridge did not become healthy within 15 seconds.');
}

async function acquireStartupLock() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(startupLockPath, 'wx');
      await handle.writeFile(`${String(process.pid)}\n`, { encoding: 'ascii' });
      return handle;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      const lockPid = await readNumericFile(startupLockPath);
      if (lockPid === undefined || !isAlive(lockPid)) {
        await rm(startupLockPath, { force: true });
        continue;
      }
      await delay(100);
    }
  }
  throw new Error('Another StreamBridge development launch is still starting; try again after it finishes.');
}

async function stop(signal) {
  if (stopping) return;
  stopping = true;
  clearInterval(monitor);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const deadline = Date.now() + 4_000;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await delay(50);
  await finish(signal === 'service-stopped' ? 0 : 130);
}

async function finish(exitCode) {
  if (!stopping) stopping = true;
  clearInterval(monitor);
  await removeOwnedRuntimeMarkers();
  process.exitCode = exitCode;
}

async function stopExisting(configPath) {
  const existingPid = await readPid();
  if (existingPid === undefined) return;
  if (!isAlive(existingPid)) {
    await removeRuntimeMarkers();
    return;
  }

  const existingSettings = await readSettings(configPath);
  const existingBaseUrl = serviceBaseUrl(existingSettings);
  const token = await readControlToken(existingSettings);
  const response = await fetch(`${existingBaseUrl}/shutdown`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5_000),
  }).catch((error) => { throw new Error(`Could not stop the active StreamBridge safely: ${error instanceof Error ? error.message : String(error)}`); });
  if (!response.ok) throw new Error(`Active StreamBridge refused authenticated shutdown (${String(response.status)}).`);

  const deadline = Date.now() + 8_000;
  while (isAlive(existingPid) && Date.now() < deadline) await delay(100);
  if (isAlive(existingPid)) throw new Error(`Active StreamBridge process ${String(existingPid)} did not stop; refusing to start a second instance.`);
  await removeRuntimeMarkers();
}

async function resolveRequestedConfig() {
  const explicit = process.env.THSV_STREAMBRIDGE_CONFIG;
  if (explicit?.trim()) return resolve(repoRoot, explicit.trim());
  try {
    const local = join(runtimeRoot, 'bridge.local.json');
    await readFile(local, 'utf8');
    return local;
  } catch {
    return join(repoRoot, 'config', 'bridge.example.json');
  }
}

async function resolveActiveConfig(fallback) {
  try {
    const configured = (await readFile(activeConfigPath, 'utf8')).trim();
    return configured.length > 0 ? resolve(repoRoot, configured) : fallback;
  } catch {
    return fallback;
  }
}

async function readSettings(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function serviceBaseUrl(settings) {
  const configuredHost = String(settings.service.host);
  const host = ['0.0.0.0', '::', '[::]'].includes(configuredHost) ? '127.0.0.1' : configuredHost === '::1' ? '[::1]' : configuredHost;
  return `http://${host}:${String(settings.service.port)}`;
}

function configMarker(configPath) {
  const candidate = relative(repoRoot, configPath);
  return candidate.startsWith('..') || isAbsolute(candidate) ? configPath : candidate.replaceAll('\\', '/');
}

async function readControlToken(settings) {
  const environmentName = settings.security.controlTokenEnv || 'THSV_STREAMBRIDGE_CONTROL_TOKEN';
  const environmentToken = process.env[environmentName]?.trim();
  if (environmentToken) return environmentToken;
  const configuredPath = settings.security.controlTokenFile || 'data/runtime/control-token';
  const token = (await readFile(resolve(repoRoot, configuredPath), 'utf8')).trim();
  if (!token) throw new Error('Bridge control token is unavailable; refusing an unauthenticated replacement.');
  return token;
}

async function readPid() {
  return readNumericFile(pidPath);
}

async function readNumericFile(path) {
  try {
    const value = Number((await readFile(path, 'utf8')).trim());
    return Number.isInteger(value) && value > 0 ? value : undefined;
  } catch { return undefined; }
}

async function removeOwnedRuntimeMarkers() {
  if ((await readPid()) !== process.pid) return;
  await removeRuntimeMarkers();
}

async function removeRuntimeMarkers() {
  await Promise.all([rm(pidPath, { force: true }), rm(activeConfigPath, { force: true })]);
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
