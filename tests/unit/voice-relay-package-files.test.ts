import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

describe('Voice Relay package', () => {
  it('uses private preparation followed by native playback and completion feedback', async () => {
    const root = 'packages/streamerbot/voice-relay';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as { actions: Array<{ name: string; group: string; source: string; importFile: string }> };
    expect(new Set(manifest.actions.map((action) => action.group))).toEqual(new Set(['THSV Addon - Voice Relay']));
    const source = await readFile(`${root}/src/Speak.cs`, 'utf8');
    expect(source).not.toContain('CPH.TtsSpeak');
    expect(source).toContain('voiceRelayPreparedMessage');
    expect(source).toContain('voice.Length == 0');
    expect(source).toContain('voiceRelayMessageHandoff');
    expect(source).toContain('voiceRelayHandoffRoot');
    expect(source).toContain('voice-relay-inbox');
    expect(source).toContain('File.Delete(path)');
    expect(source).toContain('Guid.TryParseExact');
    expect(source).toContain('Path.GetFileName(handoff)');
    expect(source).toContain('FileAttributes.ReparsePoint');
    expect(source).toContain('new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None)');
    expect(source).toContain('stream.Length <= 0 || stream.Length > 4096');
    expect(source).not.toContain('File.ReadAllText');
    expect(source).not.toContain('Read("voiceRelayMessage"');
    expect(source).not.toMatch(/Log(?:Info|Warn|Error)\([^\n]*message/iu);

    const encoded = Buffer.from((await readFile(`${root}/${manifest.actions[0]?.importFile ?? ''}`, 'utf8')).trim(), 'base64');
    expect(encoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(encoded.subarray(4)).toString('utf8')) as { data: { actions: Array<{ name: string; queue: string; concurrent: boolean; subActions: Array<{ type: number; state?: number; enabled: boolean; byteCode?: string }> }> } };
    const speak = exported.data.actions.find((action) => action.name === manifest.actions[0]?.name);
    const code = speak?.subActions.find((action) => action.type === 99_999 && action.enabled);
    expect(Buffer.from(code?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd()).toBe(source.replaceAll('\r\n', '\n').trimEnd());
    expect(speak?.subActions[1]).toMatchObject({ type: 602, delay: true, silent: false, badWordFilter: true });
    expect(speak?.subActions[2]).toMatchObject({ type: 99_999 });
    expect(speak?.concurrent).toBe(false);
    expect(speak?.queue).not.toBe('00000000-0000-0000-0000-000000000000');
    const stop = exported.data.actions.find((action) => action.name.endsWith(' - Stop'));
    expect(stop?.concurrent).toBe(false);
    expect(stop?.queue).toBe('00000000-0000-0000-0000-000000000000');
    expect(stop?.subActions.filter((action) => action.type === 603).map((action) => action.state)).toEqual([1, 0]);
    expect(stop?.subActions.some((action) => Buffer.from(action.byteCode ?? '', 'base64').toString('utf8').includes('CPH.Wait(500)'))).toBe(true);
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

  it('enables the conservative profanity filter by default', async () => {
    const schema = JSON.parse(await readFile('addons/voice-relay/schemas/config.json', 'utf8')) as {
      properties: { useDefaultProfanityFilter: { default: boolean } };
    };
    expect(schema.properties.useDefaultProfanityFilter.default).toBe(true);
    const runtime = await readFile('addons/voice-relay/dist/index.js', 'utf8');
    expect(runtime).toContain('DEFAULT_BLOCKED_TERMS');
    expect(runtime).toContain('containsBlockedTerm');
  });
});
