import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
/* eslint-disable @typescript-eslint/no-unsafe-call -- executable add-on exports are intentionally loaded from verified plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { channelUrl, fitMessageToPlatforms, matchesViewerRule, renderTemplate, viewerKey } from '../../addons/automated-shoutouts/dist/index.js';

const fitMessage = fitMessageToPlatforms as (message: string, candidate: { platform: string; trigger: string; viewers: number; category: string; user: { id: string; name: string; displayName: string } }, platforms: string[]) => string;

describe('Automated Shoutouts add-on helpers', () => {
  const user = { id: 'channel-123', name: 'Creator_Name', displayName: 'Creator Name' };

  it('uses stable IDs for viewer identity and supports scoped creator rules', () => {
    expect(viewerKey('youtube', user)).toBe('youtube:id:channel-123');
    expect(matchesViewerRule('creator_name', 'youtube', user)).toBe(true);
    expect(matchesViewerRule('youtube:Creator_Name', 'youtube', user)).toBe(true);
    expect(matchesViewerRule('youtube:id:channel-123', 'youtube', user)).toBe(true);
    expect(matchesViewerRule('twitch:Creator_Name', 'youtube', user)).toBe(false);
  });

  it('builds honest platform channel links without inventing provider lookup APIs', () => {
    expect(channelUrl('twitch', { name: '@Some Creator' })).toBe('https://twitch.tv/some%20creator');
    expect(channelUrl('youtube', user)).toBe('https://youtube.com/channel/channel-123');
    expect(channelUrl('youtube', { name: 'Creator Name' })).toBe('https://youtube.com/@Creator%20Name');
    expect(channelUrl('kick', { name: 'KickCreator' })).toBe('https://kick.com/kickcreator');
    expect(channelUrl('tiktok', { name: '@Tik Creator' })).toBe('https://tiktok.com/@Tik%20Creator');
  });

  it('expands only documented template tokens and strips control characters', () => {
    expect(renderTemplate('{displayName}\nraided with {viewers} from {category}: {channelUrl} ({missing})', {
      platform: 'twitch', trigger: 'raid', viewers: 42, category: 'Just Chatting', user,
    })).toBe('Creator Name raided with 42 from Just Chatting: https://twitch.tv/creator_name ({missing})');
  });

  it('clamps to the strictest destination while preserving the complete channel URL', () => {
    const candidate = { platform: 'twitch', trigger: 'manual', viewers: 0, category: 'A'.repeat(500), user };
    const result = fitMessage(`Watch ${'A'.repeat(500)} https://twitch.tv/creator_name`, candidate, ['twitch', 'tiktok']);
    expect(result.length).toBeLessThanOrEqual(150);
    expect(result).toMatch(/… https:\/\/twitch\.tv\/creator_name$/u);
  });

  it('keeps Twitch visual choices in one guided section and other platforms chat-only', async () => {
    const schema = JSON.parse(await readFile('addons/automated-shoutouts/schemas/config.json', 'utf8')) as { properties: Record<string, { enum?: string[]; default?: unknown }> };
    const ui = JSON.parse(await readFile('addons/automated-shoutouts/ui/settings.json', 'utf8')) as { sections: Array<{ id: string; fields: string[] }> };
    expect(schema.properties['twitchVisualType']?.enum).toEqual(['profile-card', 'random-clip']);
    expect(schema.properties['twitchVisualTriggers']?.default).toEqual(['raid', 'first-chat', 'manual']);
    expect(schema.properties['clipMuted']?.default).toBe(true);
    expect(ui.sections.find((section) => section.id === 'overlay')?.fields).toContain('clipFallbackToCard');
    expect(ui.sections.find((section) => section.id === 'overlay')?.fields).toContain('twitchVisualTriggers');
    expect(schema.properties).not.toHaveProperty('youtubeVisualType');
    expect(schema.properties).not.toHaveProperty('kickVisualType');
    expect(schema.properties).not.toHaveProperty('tiktokVisualType');
  });
});
