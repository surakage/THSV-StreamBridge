import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { loadConfig } from '../bridge/services/config-loader.js';
import { resolveControlToken } from '../bridge/services/control-token.js';

const fixture = process.argv[2] ?? 'tests/fixtures/twitch-chat.json';
const baseUrl = process.env['THSV_STREAMBRIDGE_URL'] ?? 'http://127.0.0.1:8787';
const target = new URL(baseUrl);
if (target.protocol !== 'http:' || !['127.0.0.1', '::1', 'localhost'].includes(target.hostname) || target.username.length > 0 || target.password.length > 0) throw new Error('THSV_STREAMBRIDGE_URL must be a loopback HTTP URL.');
const activeConfig = await readFile('data/runtime/active-config.txt', 'utf8').then((value) => value.trim()).catch(() => '');
const configPath = process.env['THSV_STREAMBRIDGE_CONFIG'] ?? (activeConfig || 'config/bridge.example.json');
const config = await loadConfig(configPath);
const token = await resolveControlToken(config.security.controlTokenEnv, config.security.controlTokenFile);
const fixtureRoot = resolve('tests/fixtures');
const fixturePath = resolve(fixture);
if (fixturePath !== fixtureRoot && !fixturePath.startsWith(`${fixtureRoot}${sep}`)) throw new Error('Simulation fixtures must be inside tests/fixtures.');
const file = await readFile(fixturePath);
if (file.length > 1_048_576) throw new Error('Simulation fixtures must not exceed 1 MiB.');
const body = file.toString('utf8');
const response = await fetch(new URL('/simulate', target), {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body,
  signal: AbortSignal.timeout(5_000),
});
const result = await response.text();
process.stdout.write(result);
if (!response.ok) process.exitCode = 1;
