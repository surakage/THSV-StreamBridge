import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const targets = [
  ['aacbbd6b-16f2-4742-844a-43007bafea71', 'THSV Addon - Village Hydration Station - Log Water'],
  ['bdf4118b-f36b-424c-a7d4-8d48f28f04ff', 'THSV Addon - Village Hydration Station - Undo'],
  ['bdc922e8-3343-4442-8fb1-fe2f5cd75bcf', 'THSV Addon - Village Hydration Station - Snooze'],
  ['ed790e43-db77-4dfa-a419-865a50ccbe97', 'THSV Addon - Village Hydration Station - Reset'],
  ['473fff65-6495-4638-b928-e4684758a7ea', 'THSV Addon - Village Hydration Station - Preview Reminder'],
];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const actionsPath = argument('--actions');
const sourcePath = argument('--source');
const backupRoot = argument('--backup-root');
const write = process.argv.includes('--write');
if (!actionsPath || !sourcePath || (write && !backupRoot)) {
  throw new Error('Usage: node migrate-streamerbot-hydration-controls.mjs --actions <actions.json> --source <HydrationControl.cs> [--backup-root <dir> --write]');
}

const [raw, source] = await Promise.all([fs.readFile(actionsPath, 'utf8'), fs.readFile(sourcePath, 'utf8')]);
const hasBom = raw.charCodeAt(0) === 0xfeff;
const originalText = hasBom ? raw.slice(1) : raw;
const original = JSON.parse(originalText);
assert.ok(!Array.isArray(original) && Array.isArray(original.actions), 'Streamer.bot action store has no action array');

const encodedSource = Buffer.from(source, 'utf8').toString('base64');
const oldByteCode = new Map();
const report = [];
for (const [actionId, name] of targets) {
  const matches = original.actions.filter((action) => action.id === actionId);
  assert.equal(matches.length, 1, `Expected exactly one action ${actionId}`);
  const action = matches[0];
  assert.equal(action.name, name, `Unexpected name for ${actionId}`);
  assert.equal(action.group, 'THSV Addon - Village Hydration Station', `Unexpected group for ${name}`);
  assert.equal((action.triggers ?? []).length, 0, `Refusing to update ${name} while it has triggers`);
  const codeActions = (action.subActions ?? []).filter((subAction) => subAction.type === 99999 && typeof subAction.byteCode === 'string');
  assert.equal(codeActions.length, 1, `Expected one code sub-action for ${name}`);
  const subAction = codeActions[0];
  oldByteCode.set(actionId, subAction.byteCode);
  subAction.byteCode = encodedSource;
  report.push({ actionId, name, changed: oldByteCode.get(actionId) !== encodedSource, oldSourceSha256: sha256(Buffer.from(oldByteCode.get(actionId), 'base64')), newSourceSha256: sha256(source) });
}

// Restore the five reviewed fields in a clone and prove no other live setting changed.
const comparison = JSON.parse(JSON.stringify(original));
for (const [actionId] of targets) {
  const action = comparison.actions.find((item) => item.id === actionId);
  const subAction = action.subActions.find((item) => item.type === 99999 && typeof item.byteCode === 'string');
  subAction.byteCode = oldByteCode.get(actionId);
}
assert.deepEqual(comparison, JSON.parse(originalText), 'Migration would change unrelated Streamer.bot data');

let backupDirectory;
if (write) {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  backupDirectory = path.join(backupRoot, `hydration-controls-${stamp}`);
  await fs.mkdir(backupDirectory, { recursive: true });
  await fs.copyFile(actionsPath, path.join(backupDirectory, 'actions.json'));
  try {
    await fs.copyFile(`${actionsPath}.bak`, path.join(backupDirectory, 'actions.json.bak'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const temporaryPath = `${actionsPath}.thsv-${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${hasBom ? '\ufeff' : ''}${JSON.stringify(original)}`, { encoding: 'utf8', flag: 'wx' });
  const verificationRaw = await fs.readFile(temporaryPath, 'utf8');
  const verification = JSON.parse(verificationRaw.charCodeAt(0) === 0xfeff ? verificationRaw.slice(1) : verificationRaw);
  assert.deepEqual(verification, original, 'Temporary action store failed verification');
  await fs.rename(temporaryPath, actionsPath);
}

process.stdout.write(`${JSON.stringify({ mode: write ? 'write' : 'dry-run', actionsPath, sourcePath, sourceSha256: sha256(source), backupDirectory, targets: report }, null, 2)}\n`);
