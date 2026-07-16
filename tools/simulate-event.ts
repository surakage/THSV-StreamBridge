import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixture = process.argv[2] ?? 'tests/fixtures/twitch-chat.json';
const baseUrl = process.env['THSV_STREAMBRIDGE_URL'] ?? 'http://127.0.0.1:8787';
const body = await readFile(resolve(fixture), 'utf8');
const response = await fetch(`${baseUrl}/simulate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body,
  signal: AbortSignal.timeout(5_000),
});
const result = await response.text();
process.stdout.write(result);
if (!response.ok) process.exitCode = 1;
