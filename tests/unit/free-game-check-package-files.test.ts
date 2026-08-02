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

  it('keeps optional Discord delivery triggerless, broker-authorized, and secret-safe', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/free-game-check/manifest.json', 'utf8')) as { actions: Array<{ source: string; arguments?: Array<{ name: string }> }>; manualTriggerSetup: Record<string, unknown> };
    const source = await readFile('packages/streamerbot/free-game-check/src/DeliverDiscord.cs', 'utf8');
    expect(manifest.actions).toHaveLength(2);
    expect(manifest.actions[1]?.arguments).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'freeGameDiscordWebhookUrl' })]));
    expect(manifest.manualTriggerSetup).toEqual({ refresh: [], discord: [] });
    expect(source).toContain('thsvAddonRelayToken');
    expect(source).toContain('addon.thsv.free-game-check.discord-result');
    expect(source).toContain('["allowed_mentions"] = new JObject { ["parse"] = new JArray() }');
    expect(source).toContain('wait=true');
    expect(source).toContain('/api/webhooks/');
    expect(source).toContain('gamerpower.com');
    expect(source).not.toContain('LogError(webhook');
    expect(source).not.toContain('LogWarn(webhook');
  });

  it('documents the shared reward and command intake without adding duplicate direct triggers', async () => {
    const descriptor = JSON.parse(await readFile('addons/free-game-check/module-package.json', 'utf8')) as { manifest: { eventSubscriptions: string[]; commandsProvided: Array<{ name: string }> } };
    const settings = JSON.parse(await readFile('addons/free-game-check/schemas/config.json', 'utf8')) as { properties: Record<string, unknown> };
    expect(descriptor.manifest.eventSubscriptions).toEqual(expect.arrayContaining(['reward.redemption', 'command.received', 'chat.message']));
    expect(descriptor.manifest.commandsProvided).toContainEqual(expect.objectContaining({ name: 'freegames' }));
    expect(settings.properties).toHaveProperty('rewardId');
    expect(settings.properties).toHaveProperty('kickRewardId');
    expect(settings.properties).toHaveProperty('discordInviteUrl');
  });
});
