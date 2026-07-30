import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Chat Guard Streamer.bot package', () => {
  it('keeps moderation triggerless and imports a disabled stable-ID trust command', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/chat-guard/manifest.json', 'utf8')) as { actions: Array<{ id: string; group: string; name: string; triggers?: unknown[] }>; commands: Array<{ name: string; enabled: boolean; sources: number }>; manualTriggerSetup: { moderate: unknown[] } };
    expect(manifest.actions).toEqual([
      expect.objectContaining({ id: '9b8d5b4a-6a6f-4f63-a09a-85bddc872ea9', group: 'THSV Addon - Chat Guard', name: 'THSV Addon - Chat Guard - Moderate' }),
      expect.objectContaining({ id: '7a44a6d4-6624-4c21-8ad8-e639bcc18813', group: 'THSV Addon - Chat Guard', name: 'THSV Addon - Chat Guard - Trust Viewer', triggers: [expect.objectContaining({ commandId: 'a31ae434-53e5-4182-bd67-54ed39f3e16b' })] }),
    ]);
    expect(manifest.commands).toEqual([expect.objectContaining({ name: 'guardtrust', enabled: false, sources: 2_098_177 })]);
    expect(manifest.manualTriggerSetup.moderate).toEqual([]);
    const source = await readFile('packages/streamerbot/chat-guard/src/Moderate.cs', 'utf8');
    expect(source).toContain('TwitchDeleteChatMessage'); expect(source).toContain('YouTubeTimeoutUserById'); expect(source).toContain('KickTimeoutUser');
    expect(source).toContain('addon.thsv.chat-guard.moderation-result'); expect(source).not.toContain('chatGuardMessageText');
    const trustSource = await readFile('packages/streamerbot/chat-guard/src/TrustViewer.cs', 'utf8');
    expect(trustSource).toContain('reply.userId'); expect(trustSource).toContain('isModerator'); expect(trustSource).toContain('addon.thsv.chat-guard.trusted-account-request');
  });
});
