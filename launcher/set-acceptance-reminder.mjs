import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(stripUtf8Bom(await readFile(join(installRoot, 'data', 'configuration', 'bridge.local.json'), 'utf8')));
const token = (await readFile(join(installRoot, 'data', 'secrets', 'control-token'), 'utf8')).trim();
const action = process.argv.includes('--resume') ? 'resume' : 'snooze';
const hoursArgument = process.argv.find((argument) => argument.startsWith('--hours='));
const hours = hoursArgument === undefined ? undefined : Number(hoursArgument.slice('--hours='.length));
if (action === 'snooze' && ![1, 24, 168].includes(hours)) throw new Error('Choose a 1-hour, 24-hour, or 7-day reminder snooze.');
const response = await fetch(`http://127.0.0.1:${String(config.service.port)}/wizard/api/live-acceptance/reminders`, {
  method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ action, ...(hours === undefined ? {} : { hours }), approvedByCreator: true }), signal: AbortSignal.timeout(3_000),
});
const result = await response.json();
if (!response.ok) throw new Error(result?.error || `Reminder change failed (${String(response.status)}).`);
process.stdout.write(`${result.notificationsSnoozed ? `Reminders snoozed until ${String(result.snoozedUntil)}` : 'Reminders resumed.'}\n`);

function stripUtf8Bom(value) { return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value; }
