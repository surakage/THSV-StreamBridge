import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Chat Guard Streamer.bot package', () => {
  it('keeps one stable moderation controller triggerless and reports correlated results', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/chat-guard/manifest.json', 'utf8')) as { actions: Array<{ id: string; group: string }>; manualTriggerSetup: { moderate: unknown[] } };
    expect(manifest.actions).toEqual([expect.objectContaining({ id: '9b8d5b4a-6a6f-4f63-a09a-85bddc872ea9', group: 'THSV Addon - Chat Guard' })]);
    expect(manifest.manualTriggerSetup.moderate).toEqual([]);
    const source = await readFile('packages/streamerbot/chat-guard/src/Moderate.cs', 'utf8');
    expect(source).toContain('TwitchDeleteChatMessage'); expect(source).toContain('YouTubeTimeoutUserById'); expect(source).toContain('KickTimeoutUser');
    expect(source).toContain('addon.thsv.chat-guard.moderation-result'); expect(source).not.toContain('chatGuardMessageText');
  });
});
