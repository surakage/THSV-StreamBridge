import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

describe('native platform intake package', () => {
  it('declares one consistently grouped action per supported native platform', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      actions: Array<{ name: string; group: string }>;
      triggerContract: Record<string, string[]>;
    };
    expect(manifest.actions).toEqual([
      expect.objectContaining({ name: 'THSV Twitch - Intake', group: 'THSV StreamBridge - Twitch' }),
      expect.objectContaining({ name: 'THSV YouTube - Intake', group: 'THSV StreamBridge - YouTube' }),
      expect.objectContaining({ name: 'THSV Kick - Intake', group: 'THSV StreamBridge - Kick' }),
    ]);
    expect(Object.keys(manifest.triggerContract)).toEqual(['twitch', 'youtube', 'kick']);
    expect(manifest.triggerContract.twitch).toContain('TwitchRewardRedemption');
    expect(manifest.triggerContract.twitch).toEqual(expect.arrayContaining(['TwitchStreamOnline', 'TwitchStreamOffline']));
    expect(manifest.triggerContract.youtube).toEqual(expect.arrayContaining(['YouTubeBroadcastStarted', 'YouTubeBroadcastEnded']));
    expect(manifest.triggerContract.kick).toEqual(expect.arrayContaining(['KickStreamOnline', 'KickStreamOffline']));
    expect(manifest.triggerContract.kick).toContain('KickRewardRedemption');
  });

  it('keeps the reviewed relay source bounded and side-effect limited', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).toContain('CPH.GetEventType()');
    expect(source).not.toContain('CPH.SetGlobalVar');
    expect(source).not.toContain('CPH.RunAction');
    expect(source).not.toMatch(/Process\.Start|PowerShell|cmd\.exe/);
  });

  it('relays firstMessage with an explicit presence bit so missing history fails closed', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).toContain('CPH.TryGetArg("firstMessage", out firstMessageValue)');
    expect(source).toContain('["firstMessageKnown"] = firstMessageKnown');
  });

  it('relays only Streamer.bot documented Twitch reply fields and restores escaped spaces', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).toContain('"isReply", "reply.msgId", "reply.userId", "reply.userLogin", "reply.userName", "reply.msgBody"');
    expect(source).toContain('["replyMessage"] = Read("reply.msgBody").Replace("\\\\s", " ")');
  });

  it('never leaks a hardcoded item name into unrelated events', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).not.toContain('"Kick Gift"');
  });

  it('uses redemptionId and id as stable-ID fallbacks alongside the standard message/event ID fields', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).toMatch(/SourceEventId\(sourceEventType, First\(Read\("messageId"\), Read\("msgId"\), Read\("eventId"\), Read\("redemptionId"\), Read\("id"\)\)\)/);
  });

  it('supports the real Streamer.bot event name for Kicks Gifted, not the documented-but-wrong one', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).toContain('"KickKicksGifted"');
    expect(source).not.toContain('"KickGifted"');
  });

  it('maps Kick-specific gift fields onto the generic item name and quantity contract', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    const itemNameLine = source.split('\n').find((line) => line.includes('["itemName"] ='));
    const quantityLine = source.split('\n').find((line) => line.includes('["quantity"] ='));
    expect(itemNameLine).toContain('Read("kicks.name")');
    expect(quantityLine).toContain('ReadInvariant("kicks.amount")');
  });

  it('prefers YouTube\'s integer micro-amount over its pre-formatted currency string, using only integer arithmetic', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).toContain('First(MicroAmountToDecimal(ReadInvariant("microAmount")), StripCurrencySymbol(');
    expect(source).toContain('private static string MicroAmountToDecimal(string microAmount)');
    expect(source).not.toMatch(/MicroAmountToDecimal[\s\S]{0,400}\bdouble\b/u);
    expect(source).not.toMatch(/MicroAmountToDecimal[\s\S]{0,400}\bfloat\b/u);
  });

  it('never lets a monetary amount silently become an item quantity', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    const quantityLine = source.split('\n').find((line) => line.includes('["quantity"] ='));
    expect(quantityLine).toBeDefined();
    expect(quantityLine).not.toContain('ReadInvariant("amount")');
  });

  it('strips currency symbols from monetary amounts before they leave the relay', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).toContain('StripCurrencySymbol(First(ReadInvariant("amount"), ReadInvariant("donationAmount")))');
    expect(source).toContain('private static string StripCurrencySymbol(string value)');
  });

  it('builds a deterministic, honestly-flagged fallback ID for Twitch and Kick triggers with no platform ID', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).toContain('private string SourceEventId(string sourceEventType, string realId)');
    for (const eventType of ['TwitchSub', 'TwitchReSub', 'TwitchGiftSub', 'TwitchGiftBomb', 'KickSubscription', 'KickResubscription', 'KickGiftSubscription', 'KickMassGiftSubscription']) {
      expect(source).toContain(`"${eventType}"`);
    }
    expect(source).toContain('"synthetic:" + sourceEventType');
    expect(source).toContain('Read("recipient.userId")');
    expect(source).toContain('Read("subscribedAt")');
    expect(source).toContain('Read("expiresAt")');
  });

  it('packages the current reviewed relay source into all three actions', async () => {
    const root = 'packages/streamerbot/native-platform-intake';
    const reviewed = (await readFile(`${root}/src/RelayPlatform.cs`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
    const decoded = Buffer.from((await readFile(`${root}/THSV-StreamBridge-Native-Platform-Intake-2.4.0.sb`, 'utf8')).trim(), 'base64');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      data: { actions: Array<{ subActions: Array<{ type: number; enabled: boolean; byteCode?: string }> }> };
    };
    expect(exported.data.actions).toHaveLength(3);
    for (const action of exported.data.actions) {
      const code = action.subActions.find((item) => item.type === 99_999 && item.enabled);
      expect(Buffer.from(code?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd()).toBe(reviewed);
    }
  });
});
