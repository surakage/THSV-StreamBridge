import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const actionId = 'dce897af-a26e-4aeb-98ae-537fbd5b5eb9';
const actionName = 'THSV Addon - Village Hydration Station - Log Spoken Amount';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const actionsPath = argument('--actions');
const backupRoot = argument('--backup-root');
const write = process.argv.includes('--write');
if (!actionsPath || (write && !backupRoot)) {
  throw new Error('Usage: node remove-streamerbot-hydration-voice.mjs --actions <actions.json> [--backup-root <dir> --write]');
}

const raw = await fs.readFile(actionsPath, 'utf8');
const hasBom = raw.charCodeAt(0) === 0xfeff;
const original = JSON.parse(hasBom ? raw.slice(1) : raw);
assert.ok(!Array.isArray(original) && Array.isArray(original.actions), 'Streamer.bot action store has no action array');

const matches = original.actions.filter((action) => action.id === actionId || action.name === actionName);
assert.equal(matches.length, 1, `Expected exactly one obsolete hydration voice action, found ${String(matches.length)}`);
const obsolete = matches[0];
assert.equal(obsolete.id, actionId, 'Obsolete hydration voice action ID did not match');
assert.equal(obsolete.name, actionName, 'Obsolete hydration voice action name did not match');
assert.equal(obsolete.group, 'THSV Addon - Village Hydration Station', 'Obsolete hydration voice action group did not match');
assert.equal((obsolete.triggers ?? []).length, 0, 'Refusing to remove hydration voice action while it still has triggers');

const updated = { ...original, actions: original.actions.filter((action) => action.id !== actionId) };
assert.equal(updated.actions.length, original.actions.length - 1, 'Migration did not remove exactly one action');
assert.equal(updated.actions.some((action) => action.id === actionId || action.name === actionName), false, 'Obsolete action remains after migration');

let backupDirectory;
if (write) {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  backupDirectory = path.join(backupRoot, `hydration-remove-voice-${stamp}`);
  await fs.mkdir(backupDirectory, { recursive: true });
  await fs.copyFile(actionsPath, path.join(backupDirectory, 'actions.json'));
  try {
    await fs.copyFile(`${actionsPath}.bak`, path.join(backupDirectory, 'actions.json.bak'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const temporaryPath = `${actionsPath}.thsv-${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${hasBom ? '\ufeff' : ''}${JSON.stringify(updated)}`, { encoding: 'utf8', flag: 'wx' });
  const verificationRaw = await fs.readFile(temporaryPath, 'utf8');
  const verification = JSON.parse(verificationRaw.charCodeAt(0) === 0xfeff ? verificationRaw.slice(1) : verificationRaw);
  assert.deepEqual(verification, updated, 'Temporary action store failed verification');
  await fs.rename(temporaryPath, actionsPath);
}

process.stdout.write(`${JSON.stringify({
  mode: write ? 'write' : 'dry-run',
  actionsPath,
  actionCountBefore: original.actions.length,
  actionCountAfter: updated.actions.length,
  removed: { id: obsolete.id, name: obsolete.name, triggerCount: (obsolete.triggers ?? []).length },
  backupDirectory,
}, null, 2)}\n`);
