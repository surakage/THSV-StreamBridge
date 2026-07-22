import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(installRoot, 'data', 'configuration', 'bridge.local.json');
const config = JSON.parse(stripUtf8Bom(await readFile(configPath, 'utf8')));
if (!Number.isInteger(config.service?.port) || config.service.port < 1 || config.service.port > 65_535) throw new Error('The configured service port is invalid.');

const baseUrl = `http://127.0.0.1:${String(config.service.port)}`;
const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3_000) });
if (!response.ok) throw new Error(`THSV StreamBridge health check failed (${String(response.status)}). Start the bridge before opening the wizard.`);
const health = await response.json();
if (health?.status !== 'healthy' || health?.service !== 'THSV StreamBridge') throw new Error('The configured port is not serving a healthy THSV StreamBridge instance.');

const opener = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', `${baseUrl}/wizard/`], {
  detached: true,
  windowsHide: true,
  stdio: 'ignore',
});
opener.unref();
process.stdout.write(`Opened the authenticated setup wizard at ${baseUrl}/wizard/\n`);

function stripUtf8Bom(value) { return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value; }
