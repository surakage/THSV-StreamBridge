import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Discord Chat Archive delivery', () => {
  it('posts through the shared Discord webhooks and no longer ships a Streamer.bot package', async () => {
    await expect(access('packages/streamerbot/discord-chat-archive/manifest.json')).rejects.toThrow();
    const descriptor = JSON.parse(await readFile('addons/discord-chat-archive/module-package.json', 'utf8')) as {
      permissions: string[];
      manifest: { actionsProvided: unknown[]; eventSubscriptions: string[] };
    };
    expect(descriptor.permissions).toContain('discord.post');
    expect(descriptor.permissions).not.toContain('streamerbot.run-approved-action');
    expect(descriptor.manifest.actionsProvided).toEqual([]);
    expect(descriptor.manifest.eventSubscriptions).not.toContain('addon.thsv.discord-chat-archive.delivery-received');
    const ui = JSON.parse(await readFile('addons/discord-chat-archive/ui/settings.json', 'utf8')) as { fields: Record<string, { control?: string }> };
    expect(ui.fields['webhookId']?.control).toBe('discord-webhook');
  });
});
