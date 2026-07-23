import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Discord Chat Archive Streamer.bot package', () => {
  it('uses the documented Discord webhook method and relays bounded correlated results', async () => {
    const source = await readFile('packages/streamerbot/discord-chat-archive/src/DeliverToDiscord.cs', 'utf8');
    expect(source).toContain('CPH.DiscordPostTextToWebhook(');
    expect(source).toContain('addon.thsv.discord-chat-archive.delivery-received');
    expect(source).toContain('MaximumContentCharacters = 1900');
    expect(source).toContain('missing-relay-token');
    expect(source).toContain('simulated-delivery-blocked');
    expect(source).toContain('Regex.Replace(content, "@(?!\\u200B)", "@\\u200B")');
    expect(source).not.toMatch(/System\.IO|File\.|StreamWriter|Process\.Start|powershell|cmd\.exe/iu);
    expect(source).not.toMatch(/CPH\.Log(?:Info|Debug|Warn|Error)\([^\n]*(?:webhookUrl|content)/u);
  });

  it('pins one triggerless broker action with an editable webhook Set Argument', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/discord-chat-archive/manifest.json', 'utf8')) as {
      minimumStreamerBotVersion: string;
      actions: Array<{ id: string; name: string; arguments?: Array<{ name: string; value: string }> }>;
      manualTriggerSetup: unknown[];
    };
    expect(manifest.minimumStreamerBotVersion).toBe('1.0.5-alpha.33');
    expect(manifest.actions).toHaveLength(1);
    expect(manifest.actions[0]).toMatchObject({
      id: 'df40969d-5923-4432-bdca-ecdee451f150',
      name: 'THSV Addon - Discord Chat Archive - Deliver',
    });
    expect(manifest.actions[0]?.arguments).toContainEqual(expect.objectContaining({
      name: 'discordArchiveWebhookUrl',
      value: 'REPLACE_WITH_DISCORD_WEBHOOK_URL',
    }));
    expect(manifest.manualTriggerSetup).toEqual([]);
  });
});
