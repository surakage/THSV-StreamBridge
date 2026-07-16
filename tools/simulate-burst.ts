import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../bridge/services/config-loader.js';
import { resolveControlToken } from '../bridge/services/control-token.js';
import { normalizedEventSchema } from '../schemas/event.js';

const fixturePath = process.argv[2] ?? 'tests/fixtures/twitch-chat.json';
const requestedCount = Number(process.argv[3] ?? '25');
if (!Number.isInteger(requestedCount) || requestedCount < 2 || requestedCount > 100) {
  throw new Error('Burst count must be an integer from 2 through 100.');
}

const baseUrl = process.env['THSV_STREAMBRIDGE_URL'] ?? 'http://127.0.0.1:8787';
const activeConfig = await readFile('data/runtime/active-config.txt', 'utf8').then((value) => value.trim()).catch(() => '');
const configPath = process.env['THSV_STREAMBRIDGE_CONFIG'] ?? (activeConfig || 'config/bridge.example.json');
const config = await loadConfig(configPath);
const token = await resolveControlToken(config.security.controlTokenEnv, config.security.controlTokenFile);
const template = normalizedEventSchema.parse(JSON.parse(await readFile(resolve(fixturePath), 'utf8')) as unknown);
const burstId = Date.now().toString(36);

const jobs = Array.from({ length: requestedCount }, (_, index) => index);
const responses: Array<{ ok: boolean; status: number; body: string }> = [];
const workerCount = Math.min(requestedCount, config.security.maxConcurrentRequests);

await Promise.all(Array.from({ length: workerCount }, async () => {
  while (jobs.length > 0) {
    const index = jobs.shift();
    if (index === undefined) return;
    const suffix = `${burstId}-${String(index).padStart(3, '0')}`;
    const event = {
      ...template,
      eventId: `${template.eventId}-${suffix}`,
      source: { ...template.source, eventId: `${template.source.eventId ?? template.eventId}-${suffix}` },
      receivedAt: new Date().toISOString(),
    };
    const response = await fetch(`${baseUrl}/simulate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(10_000),
    });
    responses.push({ ok: response.ok, status: response.status, body: await response.text() });
  }
}));

const failures = responses.filter((response) => !response.ok);
process.stdout.write(JSON.stringify({ requested: requestedCount, accepted: responses.length - failures.length, failed: failures.length, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;
