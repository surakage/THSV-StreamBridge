import { readFile } from 'node:fs/promises';
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
      expect.objectContaining({ name: 'THSV Streamlabs - Intake', group: 'THSV StreamBridge - Streamlabs' }),
      expect.objectContaining({ name: 'THSV Kofi - Intake', group: 'THSV StreamBridge - Kofi' }),
    ]);
    expect(Object.keys(manifest.triggerContract)).toEqual(['twitch', 'youtube', 'kick', 'streamlabs', 'kofi']);
  });

  it('keeps the reviewed relay source bounded and side-effect limited', async () => {
    const source = await readFile('packages/streamerbot/native-platform-intake/src/RelayPlatform.cs', 'utf8');
    expect(source).toContain('CPH.WebsocketBroadcastJson');
    expect(source).toContain('CPH.GetEventType()');
    expect(source).not.toContain('CPH.SetGlobalVar');
    expect(source).not.toContain('CPH.RunAction');
    expect(source).not.toMatch(/Process\.Start|PowerShell|cmd\.exe/);
    expect(source).toContain('ReadInvariant("gift.jewelsAmount")');
    expect(source).toContain('"power-up:" + userId');
    expect(source).toContain('"modiversary:" + Read("userId")');
    expect(source).toContain('"watch-streak:" + Read("userId")');
    expect(source).toContain('["sourceEventIdVerified"]');
    expect(source).toContain('["eventTimestamp"]');
    expect(source).toContain('["items"] = ReadItems()');
    expect(source).toContain('Read("broadcast.id")');
  });

  it('supports YouTube jewels gifts in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { youtube: string[] };
    };
    expect(manifest.triggerContract.youtube).toContain('YouTubeJewelsGifted');
  });

  it('supports Twitch gift paid upgrades in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { twitch: string[] };
    };
    expect(manifest.triggerContract.twitch).toContain('TwitchGiftPaidUpgrade');
  });

  it('supports Twitch pay-it-forward in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { twitch: string[] };
    };
    expect(manifest.triggerContract.twitch).toContain('TwitchPayItForward');
  });

  it('supports Twitch prime paid upgrade in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { twitch: string[] };
    };
    expect(manifest.triggerContract.twitch).toContain('TwitchPrimePaidUpgrade');
  });

  it('supports Twitch hype train start in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { twitch: string[] };
    };
    expect(manifest.triggerContract.twitch).toContain('TwitchHypeTrainStart');
  });

  it('supports Twitch hype train level up in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { twitch: string[] };
    };
    expect(manifest.triggerContract.twitch).toContain('TwitchHypeTrainLevelUp');
  });

  it('supports Twitch hype train update in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { twitch: string[] };
    };
    expect(manifest.triggerContract.twitch).toContain('TwitchHypeTrainUpdate');
  });

  it('supports Twitch hype train end in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { twitch: string[] };
    };
    expect(manifest.triggerContract.twitch).toContain('TwitchHypeTrainEnd');
  });

  it('supports Twitch modiversary in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { twitch: string[] };
    };
    expect(manifest.triggerContract.twitch).toContain('TwitchModiversary');
  });

  it('supports Twitch watch streak in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { twitch: string[] };
    };
    expect(manifest.triggerContract.twitch).toContain('TwitchWatchStreak');
  });

  it('supports Twitch ad run in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { twitch: string[] };
    };
    expect(manifest.triggerContract.twitch).toContain('TwitchAdRun');
  });

  it('supports Twitch upcoming ad in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { twitch: string[] };
    };
    expect(manifest.triggerContract.twitch).toContain('TwitchUpcomingAd');
  });

  it('supports Kofi shop order in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { kofi: string[] };
    };
    expect(manifest.triggerContract.kofi).toContain('KofiShopOrder');
  });

  it('supports Streamlabs merchandise in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { streamlabs: string[] };
    };
    expect(manifest.triggerContract.streamlabs).toContain('StreamlabsMerchandise');
  });

  it('supports Streamlabs charity donation in trigger contract', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/native-platform-intake/manifest.json', 'utf8')) as {
      triggerContract: { streamlabs: string[] };
    };
    expect(manifest.triggerContract.streamlabs).toContain('StreamlabsCharityDonation');
  });
});
