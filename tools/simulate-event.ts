import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../bridge/services/config-loader.js';
import { resolveControlToken } from '../bridge/services/control-token.js';

const fixture = process.argv[2] ?? 'tests/fixtures/twitch-chat.json';
const baseUrl = process.env['THSV_STREAMBRIDGE_URL'] ?? 'http://127.0.0.1:8787';
const activeConfig = await readFile('data/runtime/active-config.txt', 'utf8').then((value) => value.trim()).catch(() => '');
const configPath = process.env['THSV_STREAMBRIDGE_CONFIG'] ?? (activeConfig || 'config/bridge.example.json');
const config = await loadConfig(configPath);
const token = await resolveControlToken(config.security.controlTokenEnv, config.security.controlTokenFile);
const body = await readFile(resolve(fixture), 'utf8');
const response = await fetch(`${baseUrl}/simulate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body,
  signal: AbortSignal.timeout(5_000),
});
const result = await response.text();
process.stdout.write(result);
if (!response.ok) process.exitCode = 1;
