import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { StreamerBotTriggerAssuranceService } from '../../bridge/services/streamerbot-trigger-assurance-service.js';

const contracts = [
  ['THSV Twitch - Intake', [133, 101, 102, 104, 105, 106, 107, 112, 154, 155]],
  ['THSV YouTube - Intake', [4003, 4006, 4007, 4030, 4018, 4008, 4009, 4015, 4019, 4002]],
  ['THSV Kick - Intake', [35010, 35011, 35016, 35015, 35017, 35025, 35024, 35012, 35013]],
] as const;

async function fixture(): Promise<{ root: string; actionsPath: string; service: StreamerBotTriggerAssuranceService }> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-trigger-assurance-'));
  const actionsPath = join(root, 'streamerbot', 'data', 'actions.json'); await mkdir(join(root, 'streamerbot', 'data'), { recursive: true });
  await writeFile(actionsPath, JSON.stringify({ actions: contracts.map(([name, types], actionIndex) => ({
    id: `action-${String(actionIndex)}`, name, group: 'THSV', enabled: true,
    triggers: types.map((type, triggerIndex) => ({ id: `${String(actionIndex)}-${String(triggerIndex)}`, type, enabled: true, exclusions: [] })),
  })) }));
  const packageRoot = join(root, 'packages'); await mkdir(join(packageRoot, 'native-platform-intake'), { recursive: true });
  await writeFile(join(packageRoot, 'native-platform-intake', 'manifest.json'), JSON.stringify({ name: 'Native', version: '4.0.3', actions: [{ name: 'one' }], triggerContract: {} }));
  return { root, actionsPath, service: new StreamerBotTriggerAssuranceService({ packageRoot, stateRoot: join(root, 'state'), actionsPath: async () => actionsPath, streamerBotRunning: async () => false }) };
}

describe('StreamerBotTriggerAssuranceService', () => {
  it('recognizes the supported 1.0.7 contract and records genuine activity only', async () => {
    const { service } = await fixture();
    service.observe({ platform: 'twitch', eventType: 'chat.message', receivedAt: '2026-08-22T12:00:00.000Z', metadata: { simulated: false } });
    service.observe({ platform: 'twitch', eventType: 'chat.message', receivedAt: '2026-08-22T12:01:00.000Z', metadata: { simulated: true } });
    service.acknowledge('twitch', '2026-08-22T12:00:01.000Z');
    const status = await service.status();
    expect(status['ready']).toBe(true);
    expect((status['activity'] as Record<string, Record<string, unknown>>)['twitch']).toMatchObject({ genuineEvents: 1, failures: 0, lastAcknowledgedAt: '2026-08-22T12:00:01.000Z' });
  });

  it('backs up before disabling an exact enabled duplicate and blocks live edits', async () => {
    const { actionsPath, root, service } = await fixture();
    const document = JSON.parse(await readFile(actionsPath, 'utf8')) as { actions: Array<{ triggers: Array<Record<string, unknown>> }> };
    document.actions[0]?.triggers.push({ id: 'duplicate', type: 133, enabled: true, exclusions: [] });
    await writeFile(actionsPath, JSON.stringify(document));
    expect((await service.status())['ready']).toBe(false);
    const result = await service.reconcile({ approvedByCreator: true });
    expect(result['changed']).toBe(1);
    expect((await service.status())['ready']).toBe(true);
    expect((await service.backups())['backups']).toHaveLength(1);
    const running = new StreamerBotTriggerAssuranceService({ packageRoot: join(root, 'packages'), stateRoot: join(root, 'state'), actionsPath: async () => actionsPath, streamerBotRunning: async () => true });
    await expect(running.reconcile({ approvedByCreator: true })).rejects.toThrow(/Close Streamer\.bot/u);
  });
});
