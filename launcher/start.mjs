import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = join(installRoot, 'data');
const runtimeRoot = join(dataRoot, 'runtime');
const recordPath = join(runtimeRoot, 'install-manifest.json');
const pidPath = join(runtimeRoot, 'streambridge.pid');
const launchLockPath = join(runtimeRoot, 'streambridge.launch.lock');
const configPath = join(dataRoot, 'configuration', 'bridge.local.json');
const tokenPath = join(dataRoot, 'secrets', 'control-token');
const openWizard = process.argv.includes('--open-wizard');
const waitOnly = process.argv.includes('--wait');

const record = JSON.parse(stripUtf8Bom(await readFile(recordPath, 'utf8')));
if (record.product !== 'THSV StreamBridge' || typeof record.activeVersion !== 'string') throw new Error('The installation record is missing or invalid. Run the official installer again.');
const appRoot = join(installRoot, 'app', record.activeVersion);
const entrypoint = join(appRoot, 'dist', 'apps', 'bridge-service.js');
const config = JSON.parse(stripUtf8Bom(await readFile(configPath, 'utf8')));
if (!Number.isInteger(config.service?.port) || config.service.port < 1 || config.service.port > 65_535) throw new Error('The configured service port is invalid.');
const baseUrl = `http://127.0.0.1:${String(config.service.port)}`;

mkdirSync(runtimeRoot, { recursive: true });
await acquireLaunchLock();
process.once('exit', releaseLaunchLock);
await stopExisting(baseUrl);
mkdirSync(join(dataRoot, 'logs'), { recursive: true });
mkdirSync(runtimeRoot, { recursive: true });
const stdout = openSync(join(dataRoot, 'logs', 'service.stdout.log'), 'a');
const stderr = openSync(join(dataRoot, 'logs', 'service.stderr.log'), 'a');
const child = spawn(process.execPath, [entrypoint], {
  cwd: appRoot,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', stdout, stderr],
  env: {
    ...process.env,
    THSV_STREAMBRIDGE_CONFIG: configPath,
    THSV_STREAMBRIDGE_DATA_ROOT: dataRoot,
    THSV_STREAMBRIDGE_ADDONS_ROOT: join(installRoot, 'addons', 'packages'),
    THSV_STREAMBRIDGE_ADDON_STATE_ROOT: join(installRoot, 'addons', 'state'),
  },
});
closeSync(stdout); closeSync(stderr);
child.unref();
if (child.pid === undefined) throw new Error('Windows did not return a process ID for StreamBridge.');
await writeFile(pidPath, `${String(child.pid)}\n`, { encoding: 'ascii' });

try { await waitForHealth(baseUrl, child.pid, 15_000); }
catch (error) { await rm(pidPath, { force: true }); throw error; }

if (openWizard) {
  const opener = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', `${baseUrl}/wizard/`], { detached: true, windowsHide: true, stdio: 'ignore' });
  opener.unref();
}
if (!waitOnly) process.stdout.write(`THSV StreamBridge ${record.activeVersion} started at ${baseUrl}\n`);
releaseLaunchLock();

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

function isOurRuntimeProcess(pid) {
  try {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${String(pid)} -ErrorAction SilentlyContinue).Path`], { encoding: 'utf8', timeout: 5_000, windowsHide: true });
    const reportedPath = (result.stdout ?? '').trim();
    return reportedPath.length > 0 && resolve(reportedPath).toLowerCase() === resolve(process.execPath).toLowerCase();
  } catch { return false; }
}

async function waitForHealth(url, pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) throw new Error(`StreamBridge exited during startup. Check ${join(dataRoot, 'logs', 'service.stderr.log')}.`);
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok && (await response.json()).status === 'healthy') return;
    } catch { /* Continue until the bounded startup deadline. */ }
    await delay(200);
  }
  try { process.kill(pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  throw new Error(`StreamBridge did not become healthy within ${String(timeoutMs)} ms.`);
}

function isAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function delay(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }
function stripUtf8Bom(value) { return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value; }

async function acquireLaunchLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { await writeFile(launchLockPath, `${String(process.pid)}\n`, { flag: 'wx', encoding: 'ascii', mode: 0o600 }); return; }
    catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const owner = Number((await readFile(launchLockPath, 'ascii').catch(() => '')).trim());
      if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) throw new Error(`Another THSV StreamBridge launcher is already running with PID ${String(owner)}.`, { cause: error });
      await rm(launchLockPath, { force: true });
    }
  }
  throw new Error('Could not acquire the THSV StreamBridge startup lock.');
}

function releaseLaunchLock() { try { rmSync(launchLockPath, { force: true }); } catch { /* Best effort during process exit. */ } }
