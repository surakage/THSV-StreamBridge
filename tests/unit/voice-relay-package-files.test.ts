import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Voice Relay package', () => {
  it('uses the documented TtsSpeak method and one dedicated group', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/voice-relay/manifest.json', 'utf8')) as { actions: Array<{ group: string }> };
    expect(new Set(manifest.actions.map((action) => action.group))).toEqual(new Set(['THSV Addon - Voice Relay']));
    const source = await readFile('packages/streamerbot/voice-relay/src/Speak.cs', 'utf8');
    expect(source).toContain('CPH.TtsSpeak');
    expect(source).toContain('voice.Length == 0');
    expect(source).not.toMatch(/Log(?:Info|Warn|Error)\([^\n]*message/iu);
  });

  it('selects every alert acknowledgement by default without opting into chat', async () => {
    const schema = JSON.parse(await readFile('addons/voice-relay/schemas/config.json', 'utf8')) as {
      properties: { eventTypes: { default: string[] } };
    };
    expect(schema.properties.eventTypes.default).toEqual([
      'channel.follow',
      'channel.subscription',
      'channel.membership',
      'channel.gift-subscription',
      'engagement.gift',
      'engagement.donation',
      'engagement.cheer',
      'engagement.raid',
      'engagement.super-chat',
      'engagement.milestone',
    ]);
    expect(schema.properties.eventTypes.default).not.toContain('chat.message');
    const runtime = await readFile('addons/voice-relay/dist/index.js', 'utf8');
    expect(runtime).toContain('!settings.voiceAlias');
  });
});
