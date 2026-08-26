import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const actionsPath = argument('--actions');
const packagePath = argument('--package');
const backupRoot = argument('--backup-root');
const write = process.argv.includes('--write');
if (!actionsPath || !packagePath || (write && !backupRoot)) {
  throw new Error('Usage: node sync-streamerbot-package-actions.mjs --actions <actions.json> --package <package.sb> [--backup-root <dir> --write]');
}

const [rawActions, encodedPackage] = await Promise.all([
  fs.readFile(actionsPath, 'utf8'),
  fs.readFile(packagePath, 'utf8'),
]);
const hasBom = rawActions.charCodeAt(0) === 0xfeff;
const originalText = hasBom ? rawActions.slice(1) : rawActions;
const liveStore = JSON.parse(originalText);
assert.ok(!Array.isArray(liveStore) && Array.isArray(liveStore.actions), 'Streamer.bot action store has no action array');

const packageBytes = Buffer.from(encodedPackage.trim(), 'base64');
assert.equal(packageBytes.subarray(0, 4).toString('ascii'), 'SBAE', 'Streamer.bot package has no SBAE header');
const exported = JSON.parse(gunzipSync(packageBytes.subarray(4)).toString('utf8'));
assert.ok(Array.isArray(exported?.data?.actions) && exported.data.actions.length > 0, 'Streamer.bot package contains no actions');

const protectedFields = [
  'triggers', 'queue', 'enabled', 'excludeFromHistory', 'excludeFromPending', 'brokerDispatched', 'mustRemainTriggerless',
  'alwaysRun', 'randomAction', 'concurrent', 'collapsedGroups',
];
const report = [];
for (const packagedAction of exported.data.actions) {
  assert.equal(typeof packagedAction?.id, 'string', 'Packaged action has no stable ID');
  const matches = liveStore.actions.filter((action) => action.id === packagedAction.id);
  assert.ok(matches.length <= 1, `Expected no more than one installed action ${packagedAction.id}`);
  const liveAction = matches[0];
  if (!liveAction) {
    const added = structuredClone(packagedAction);
    liveStore.actions.push(added);
    report.push({
      actionId: added.id,
      name: added.name,
      added: true,
      triggersPreserved: Array.isArray(added.triggers) ? added.triggers.length : 0,
      subActionsInstalled: Array.isArray(added.subActions) ? added.subActions.length : 0,
    });
    continue;
  }
  const preserved = Object.fromEntries(protectedFields.map((field) => [field, structuredClone(liveAction[field])]));
  const replacement = structuredClone(packagedAction);
  for (const field of protectedFields) {
    if (preserved[field] !== undefined) replacement[field] = preserved[field];
  }
  const index = liveStore.actions.indexOf(liveAction);
  liveStore.actions[index] = replacement;
  report.push({
    actionId: replacement.id,
    name: replacement.name,
    added: false,
    triggersPreserved: Array.isArray(replacement.triggers) ? replacement.triggers.length : 0,
    subActionsInstalled: Array.isArray(replacement.subActions) ? replacement.subActions.length : 0,
  });
}

// Prove every action outside the imported package remains byte-for-byte equivalent as JSON data.
const packageIds = new Set(exported.data.actions.map((action) => action.id));
const originalStore = JSON.parse(originalText);
assert.deepEqual(
  liveStore.actions.filter((action) => !packageIds.has(action.id)),
  originalStore.actions.filter((action) => !packageIds.has(action.id)),
  'Package sync would change unrelated Streamer.bot actions',
);
for (const actionId of packageIds) {
  const before = originalStore.actions.find((action) => action.id === actionId);
  const after = liveStore.actions.find((action) => action.id === actionId);
  assert.ok(after, `Package action ${actionId} is missing after sync`);
  if (!before) continue;
  for (const field of protectedFields) assert.deepEqual(after[field], before[field], `Package sync would change ${field} for ${actionId}`);
}

let backupDirectory;
if (write) {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  backupDirectory = path.join(backupRoot, `streamerbot-package-sync-${stamp}`);
  await fs.mkdir(backupDirectory, { recursive: true });
  await fs.copyFile(actionsPath, path.join(backupDirectory, 'actions.json'));
  try {
    await fs.copyFile(`${actionsPath}.bak`, path.join(backupDirectory, 'actions.json.bak'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const temporaryPath = `${actionsPath}.thsv-${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${hasBom ? '\ufeff' : ''}${JSON.stringify(liveStore)}`, { encoding: 'utf8', flag: 'wx' });
  const verificationRaw = await fs.readFile(temporaryPath, 'utf8');
  const verification = JSON.parse(verificationRaw.charCodeAt(0) === 0xfeff ? verificationRaw.slice(1) : verificationRaw);
  assert.deepEqual(verification, liveStore, 'Temporary action store failed verification');
  await fs.rename(temporaryPath, actionsPath);
}

process.stdout.write(`${JSON.stringify({ mode: write ? 'write' : 'dry-run', actionsPath, packagePath, backupDirectory, actions: report }, null, 2)}\n`);
