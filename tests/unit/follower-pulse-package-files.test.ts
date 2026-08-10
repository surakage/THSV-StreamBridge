import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Follower Pulse Streamer.bot package', () => {
  it('uses one group, one triggerless broker controller, fixed Helix scope, and no persisted credential', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/follower-pulse/manifest.json', 'utf8')) as { actions: Array<{ id: string; group: string }>; manualTriggerSetup: { 'snapshot-page': unknown[] } };
    expect(new Set(manifest.actions.map((action) => action.group))).toEqual(new Set(['THSV Addon - Follower Pulse']));
    expect(manifest.actions[0]?.id).toBe('0f41b0d1-7c7a-4a1c-9f11-5ab9cc86b301');
    expect(manifest.manualTriggerSetup['snapshot-page']).toEqual([]);
    const source = await readFile('packages/streamerbot/follower-pulse/src/SnapshotFollowers.cs', 'utf8');
    expect(source).toContain('https://api.twitch.tv/helix/channels/followers');
    expect(source).toContain('CPH.TwitchOAuthToken');
    expect(source).toContain('&first=100');
    expect(source).toContain('relayToken');
    expect(source).toContain('ReadBool("isTest")');
    expect(source).toContain('Bounded((string)item["user_name"], 25)');
    expect(source).toContain('RelayFailure(scanId, page, relayToken');
    expect(source).toContain('["error"] = Bounded(reason, 300)');
    const reconcile = await readFile('packages/streamerbot/follower-pulse/src/ReconcileNow.cs', 'utf8');
    expect(reconcile).toContain('ReadBool("isTest")');
    expect(source).not.toMatch(/SetGlobalVar|File\.|Directory\.|Process\.Start/u);
  });
});
