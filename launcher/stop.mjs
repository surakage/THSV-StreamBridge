import { readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = join(installRoot, 'data');
const pidPath = join(dataRoot, 'runtime', 'streambridge.pid');
const configPath = join(dataRoot, 'configuration', 'bridge.local.json');
const tokenPath = join(dataRoot, 'secrets', 'control-token');
let pid;
try { pid = Number((await readFile(pidPath, 'utf8')).trim()); } catch { process.stdout.write('THSV StreamBridge is not running.\n'); process.exit(0); }
if (!Number.isInteger(pid) || pid < 1 || !isAlive(pid)) { await rm(pidPath, { force: true }); process.stdout.write('Removed a stale StreamBridge process record.\n'); process.exit(0); }
const config = JSON.parse(await readFile(configPath, 'utf8'));
const host = ['0.0.0.0', '::', '[::]'].includes(config.service.host) ? '127.0.0.1' : config.service.host;
const baseUrl = `http://${host === '::1' ? '[::1]' : host}:${String(config.service.port)}`;
const token = (await readFile(tokenPath, 'utf8')).trim();
const response = await fetch(`${baseUrl}/shutdown`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) });
if (!response.ok) throw new Error(`Authenticated shutdown failed (${String(response.status)}).`);
const deadline = Date.now() + 7_000;
while (Date.now() < deadline && isAlive(pid)) await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
if (isAlive(pid)) throw new Error('StreamBridge did not stop within seven seconds.');
await rm(pidPath, { force: true });
process.stdout.write('THSV StreamBridge stopped.\n');
function isAlive(value) { try { process.kill(value, 0); return true; } catch { return false; } }
