import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [releaseRoot, testRoot] = process.argv.slice(2);
if (!releaseRoot || !testRoot) throw new Error('Usage: node streamerbot-trigger-recovery.tests.mjs <release-root> <test-root>');
const appRoot = join(releaseRoot, 'app');
const { StreamerBotTriggerAssuranceService } = await import(pathToFileURL(join(appRoot, 'dist', 'bridge', 'services', 'streamerbot-trigger-assurance-service.js')));
const { STREAMERBOT_TRIGGER_REGISTRY_107: registry } = await import(pathToFileURL(join(appRoot, 'dist', 'bridge', 'contracts', 'streamerbot-trigger-contract-registry.js')));
const expectedTriggerCount = registry.contracts.reduce((total, contract) => total + contract.triggerTypes.length, 0);
const triggerCountFor = (actionName) => registry.contracts.find((contract) => contract.actionName === actionName)?.triggerTypes.length ?? 0;
const actionsPath = join(testRoot, 'streamerbot', 'data', 'actions.json');
await mkdir(join(testRoot, 'streamerbot', 'data'), { recursive: true });
const actionBodies = registry.contracts.map((contract, index) => ({
  id: `managed-action-${String(index)}`,
  name: contract.actionName,
  group: 'THSV',
  enabled: true,
  triggers: [],
  subActions: [{ id: `body-${String(index)}`, type: 25, enabled: true, code: `release-body-${String(index)}` }],
}));
await writeFile(actionsPath, JSON.stringify({ actions: actionBodies }));
let streamerBotRunning = false;
const service = new StreamerBotTriggerAssuranceService({
  packageRoot: join(appRoot, 'packages', 'streamerbot'),
  stateRoot: join(testRoot, 'state'),
  actionsPath: async () => actionsPath,
  streamerBotVersion: async () => registry.version,
  streamerBotRunning: async () => streamerBotRunning,
});
const missing = await service.status();
if (missing.ready !== false || missing.issues.missingTriggers.length !== expectedTriggerCount) throw new Error(`The release did not detect all ${String(expectedTriggerCount)} post-import missing triggers.`);
const repaired = await service.reconcile({ approvedByCreator: true });
if (repaired.changed !== expectedTriggerCount || repaired.status.ready !== true || repaired.backup.integrity !== 'verified') throw new Error(`The release did not transactionally restore all ${String(expectedTriggerCount)} registered triggers.`);
const persisted = JSON.parse((await readFile(actionsPath, 'utf8')).replace(/^\uFEFF/u, ''));
if (JSON.stringify(persisted.actions.map((action) => action.subActions)) !== JSON.stringify(actionBodies.map((action) => action.subActions))) throw new Error('Trigger recovery changed a managed action body.');
streamerBotRunning = true;
if ((await service.status()).ready !== true) throw new Error('Trigger readiness did not survive the simulated Streamer.bot restart boundary.');
streamerBotRunning = false;
await service.restore({ name: repaired.backup.name, approvedByCreator: true });
const rolledBack = await service.status();
if (rolledBack.ready !== false || rolledBack.issues.missingTriggers.length !== expectedTriggerCount) throw new Error('The verified rollback did not restore the pre-repair trigger state.');
process.stdout.write(`${JSON.stringify({
  expectedTriggerCount,
  detectedMissingTriggers: missing.issues.missingTriggers.length,
  repairedTriggers: repaired.changed,
  twitch: triggerCountFor('THSV Twitch - Intake'),
  youtube: triggerCountFor('THSV YouTube - Intake'),
  kick: triggerCountFor('THSV Kick - Intake'),
  optional: registry.contracts.filter((contract) => contract.optional === true).reduce((total, contract) => total + contract.triggerTypes.length, 0),
  actionBodiesPreserved: true,
  postRepairRestartReady: true,
  verifiedRollback: true,
})}\n`);
