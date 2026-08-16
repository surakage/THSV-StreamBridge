import { execFileSync, spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const launcherRoot = join(installRoot, 'launcher');
const OPTIONAL_STARTUP_GRACE_MS = 1_500;
const config = JSON.parse(await readFile(join(installRoot, 'data', 'configuration', 'bridge.local.json'), 'utf8'));
if (!Number.isInteger(config.service?.port) || config.service.port < 1 || config.service.port > 65_535) throw new Error('The configured StreamBridge service port is invalid.');
const baseUrl = `http://127.0.0.1:${String(config.service.port)}`;
const launcherConfig = await readLauncherConfiguration();
const optionalWarnings = [];
optionalWarnings.push(...await startTrayShell());

runLauncher(join(launcherRoot, 'start-streamerbot.mjs'), ['--install-root', installRoot], 65_000);
optionalWarnings.push(...await startOptionalApplication('speakerbot', launcherConfig));

if (await bridgeReady(baseUrl)) {
  process.stdout.write('Streamer.bot and THSV StreamBridge are already ready. No restart was needed.\n');
} else {
  runLauncher(join(launcherRoot, 'start.mjs'), ['--wait'], 35_000);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && !await bridgeReady(baseUrl)) await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  if (!await bridgeReady(baseUrl)) throw new Error('THSV StreamBridge started but did not reach ready status. Open the setup wizard and review Diagnostics.');
  process.stdout.write('Streamer.bot and THSV StreamBridge are ready.\n');
}
for (const application of ['obs', 'meld', 'streamlabs']) optionalWarnings.push(...await startOptionalApplication(application, launcherConfig));
if (optionalWarnings.length > 0) process.stdout.write(`Optional app warning: ${optionalWarnings.join(' ')}\n`);
else process.stdout.write('Enabled optional streaming apps are ready.\n');

function runLauncher(script, argumentsValue, timeout) {
  try {
    const result = execFileSync(process.execPath, [script, ...argumentsValue], { cwd: installRoot, encoding: 'utf8', windowsHide: true, timeout });
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
