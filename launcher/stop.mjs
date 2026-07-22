import { readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = join(installRoot, 'data');
const pidPath = join(dataRoot, 'runtime', 'streambridge.pid');
const configPath = join(dataRoot, 'configuration', 'bridge.local.json');
const tokenPath = join(dataRoot, 'secrets', 'control-token');
const config = JSON.parse(stripUtf8Bom(await readFile(configPath, 'utf8')));
if (!Number.isInteger(config.service?.port) || config.service.port < 1 || config.service.port > 65_535) throw new Error('The configured service port is invalid.');
const baseUrl = `http://127.0.0.1:${String(config.service.port)}`;
const token = (await readFile(tokenPath, 'utf8')).trim();
let pid;
try { pid = Number((await readFile(pidPath, 'utf8')).trim()); } catch { /* Authenticated localhost shutdown remains available without a PID record. */ }
if (!Number.isInteger(pid) || pid < 1 || !isAlive(pid)) { pid = undefined; await rm(pidPath, { force: true }); }
let response;
try {
  response = await fetch(`${baseUrl}/shutdown`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) });
} catch {
  if (pid !== undefined && isAlive(pid)) throw new Error('The recorded StreamBridge process is alive, but its authenticated shutdown endpoint is unavailable. Close it from Task Manager before uninstalling.');
  process.stdout.write('THSV StreamBridge is not running.\n');
  process.exit(0);
}
if (!response.ok) throw new Error(`Authenticated shutdown failed (${String(response.status)}).`);
const shutdownTimeoutMs = 15_000;
const deadline = Date.now() + shutdownTimeoutMs;
while (Date.now() < deadline) {
  if ((pid === undefined || !isAlive(pid)) && !await isServerReachable()) break;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
}
if ((pid !== undefined && isAlive(pid)) || await isServerReachable()) throw new Error(`StreamBridge did not stop within ${String(shutdownTimeoutMs / 1_000)} seconds.`);
await rm(pidPath, { force: true });
process.stdout.write('THSV StreamBridge stopped.\n');
async function isServerReachable() { try { return (await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) })).ok; } catch { return false; } }
function isAlive(value) { try { process.kill(value, 0); return true; } catch { return false; } }
function stripUtf8Bom(value) { return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value; }
