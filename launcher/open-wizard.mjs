import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(installRoot, 'data', 'configuration', 'bridge.local.json');
const tokenPath = join(installRoot, 'data', 'secrets', 'control-token');
const config = JSON.parse(stripUtf8Bom(await readFile(configPath, 'utf8')));
if (!Number.isInteger(config.service?.port) || config.service.port < 1 || config.service.port > 65_535) throw new Error('The configured service port is invalid.');

const baseUrl = `http://127.0.0.1:${String(config.service.port)}`;
const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3_000) });
if (!response.ok) throw new Error(`THSV StreamBridge health check failed (${String(response.status)}). Start the bridge before opening the wizard.`);
const health = await response.json();
if (health?.status !== 'healthy' || health?.service !== 'THSV StreamBridge') throw new Error('The configured port is not serving a healthy THSV StreamBridge instance.');

const token = (await readFile(tokenPath, 'utf8')).trim();
const ticketResponse = await fetch(`${baseUrl}/wizard/api/unlock-tickets`, {
  method: 'POST', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3_000),
});
if (!ticketResponse.ok) throw new Error(`The local wizard could not create a secure unlock link (${String(ticketResponse.status)}).`);
const ticketResult = await ticketResponse.json();
if (typeof ticketResult?.ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(ticketResult.ticket)) throw new Error('The local wizard returned an invalid unlock link.');

const opener = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', `${baseUrl}/wizard/#unlock=${ticketResult.ticket}`], {
  detached: true,
  windowsHide: true,
  stdio: 'ignore',
});
opener.unref();
process.stdout.write(`Opened and securely unlocked the setup wizard at ${baseUrl}/wizard/\n`);

function stripUtf8Bom(value) { return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value; }
