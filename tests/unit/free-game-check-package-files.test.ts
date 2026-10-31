import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Free Game Check Streamer.bot package', () => {
  it('keeps refresh correlated, test-aware, and restricted to GamerPower links', async () => {
    const source = await readFile('packages/streamerbot/free-game-check/src/RefreshGames.cs', 'utf8');
    expect(source).toContain('freeGameCheckRequestId');
    expect(source).toContain('ReadBool("isTest")');
    expect(source).toContain('item["gamerpower_url"]');
    expect(source).toContain('parsed.Host.ToLowerInvariant() != "gamerpower.com"');
    expect(source).toContain('ReadBounded(reader, 1048576)');
    expect(source).not.toContain('open_giveaway_url');
  });

  it('leaves Discord posting to StreamBridge so no webhook lives in Streamer.bot', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/free-game-check/manifest.json', 'utf8')) as { actions: Array<{ source: string; arguments?: Array<{ name: string }> }>; manualTriggerSetup: Record<string, unknown> };
    expect(manifest.actions).toHaveLength(2);
    expect(JSON.stringify(manifest)).not.toContain('WebhookUrl');
    expect(manifest.manualTriggerSetup).toEqual({ refresh: [], 'settle-twitch-reward': [] });
    await expect(readFile('packages/streamerbot/free-game-check/src/DeliverDiscord.cs', 'utf8')).rejects.toThrow();
    const descriptor = JSON.parse(await readFile('addons/free-game-check/module-package.json', 'utf8')) as { permissions: string[]; manifest: { eventSubscriptions: string[] } };
    expect(descriptor.permissions).toContain('discord.post');
    expect(descriptor.manifest.eventSubscriptions).not.toContain('addon.thsv.free-game-check.discord-result');
  });

  it('keeps Twitch settlement triggerless and broker-authorized', async () => {
    const source = await readFile('packages/streamerbot/free-game-check/src/SettleReward.cs', 'utf8');
    expect(source).toContain('thsvAddonRelayToken');
    expect(source).toContain('CPH.TwitchRedemptionFulfill');
    expect(source).toContain('CPH.TwitchRedemptionCancel');
    expect(source).toContain('freeGameRedemptionId');
  });

  it('documents the shared reward and command intake without adding duplicate direct triggers', async () => {
    const descriptor = JSON.parse(await readFile('addons/free-game-check/module-package.json', 'utf8')) as { manifest: { eventSubscriptions: string[]; commandsProvided: Array<{ name: string }> } };
    const settings = JSON.parse(await readFile('addons/free-game-check/schemas/config.json', 'utf8')) as { properties: Record<string, { default?: unknown }> };
    expect(descriptor.manifest.eventSubscriptions).toEqual(expect.arrayContaining(['reward.redemption', 'command.received', 'chat.message', 'stream.online', 'stream.offline']));
    expect(descriptor.manifest.commandsProvided).toContainEqual(expect.objectContaining({ name: 'freegames' }));
    expect(settings.properties).toHaveProperty('rewardId');
    expect(settings.properties).toHaveProperty('kickRewardId');
    expect(settings.properties.pointsCost?.default).toBe(100);
    expect(settings.properties).toHaveProperty('discordInviteUrl');
    expect(settings.properties.discordInviteUrl?.default).toBe('');
  });
});
