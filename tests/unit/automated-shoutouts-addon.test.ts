import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
/* eslint-disable @typescript-eslint/no-unsafe-call -- executable add-on exports are intentionally loaded from verified plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { channelUrl, displayNameForPresentation, fitMessageToPlatforms, isConnectedAutomaticAccount, localDayKey, matchesViewerRule, renderTemplate, viewerKey, viewerKeys, welcomeSafetyVerdict } from '../../addons/automated-shoutouts/dist/index.js';

const fitMessage = fitMessageToPlatforms as (message: string, candidate: { platform: string; trigger: string; viewers: number; category: string; user: { id: string; name: string; displayName: string } }, platforms: string[]) => string;

describe('Automated Shoutouts add-on helpers', () => {
  const user = { id: 'channel-123', name: 'Creator_Name', displayName: 'Creator Name' };

  it('uses stable IDs for viewer identity and supports scoped creator rules', () => {
    expect(viewerKey('youtube', user)).toBe('youtube:id:channel-123');
    expect(viewerKeys('tiktok', { id: 'changing-provider-id', name: '@Creator_Name' })).toEqual([
      'tiktok:id:changing-provider-id',
      'tiktok:name:creator_name',
    ]);
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
    })).toBe('Creator name raided with 42 from Just Chatting: https://twitch.tv/creator_name ({missing})');
  });

  it('sentence-cases displayed names while preserving usernames used in links', () => {
    expect(displayNameForPresentation({ name: 'TESTUSER123', displayName: 'TEST USER 123' })).toBe('Test user 123');
    expect(renderTemplate('{displayName} {user} {channelUrl}', {
      platform: 'tiktok', trigger: 'first-chat', viewers: 0, user: { name: 'TikTokLOGIN', displayName: 'TIKTOK CREATOR' },
    })).toBe('Tiktok creator TikTokLOGIN https://tiktok.com/@TikTokLOGIN');
  });

  it('clamps to the strictest destination while preserving the complete channel URL', () => {
    const candidate = { platform: 'twitch', trigger: 'manual', viewers: 0, category: 'A'.repeat(500), user };
    const result = fitMessage(`Watch ${'A'.repeat(500)} https://twitch.tv/creator_name`, candidate, ['twitch', 'tiktok']);
    expect(result.length).toBeLessThanOrEqual(150);
    expect(result).toMatch(/… https:\/\/twitch\.tv\/creator_name$/u);
  });

  it('preloads editable high-confidence welcome guards without treating human names as bot evidence', () => {
    const base = { platform: 'twitch', user: { id: 'viewer-1', name: 'new_viewer', actorType: 'human' }, payload: { message: 'hello village' } };
    expect(welcomeSafetyVerdict(base)).toEqual({ accepted: true, reason: 'accepted' });
    expect(welcomeSafetyVerdict({ ...base, payload: { message: 'Want to become famous? Visit https://bigfollows.com' } })).toMatchObject({ accepted: false });
    expect(welcomeSafetyVerdict({ ...base, user: { name: 'anonymous', actorType: 'human' } })).toEqual({ accepted: false, reason: 'missing-stable-id' });
    expect(welcomeSafetyVerdict({ ...base, user: { id: 'bot-1', name: 'nightbot', actorType: 'human' } })).toEqual({ accepted: false, reason: 'ignored-account' });
  });

  it('automatically blocks connected broadcaster and bot identities across platform aliases', () => {
    const state = { connectedAccountIds: ['youtube:id:owner-1'], connectedAccountNames: ['creatorname', 'creator_bot'] };
    const youtubeOwner = { platform: 'youtube', user: { id: 'owner-1', name: 'DifferentLogin', actorType: 'human' }, payload: { message: 'hello' } };
    const kickAlias = { platform: 'kick', user: { id: 'kick-9', name: 'CreatorName', actorType: 'human' }, payload: { message: 'hello' } };
    const tiktokBot = { platform: 'tiktok', user: { id: 'tt-9', name: 'CREATOR_BOT', actorType: 'human' }, payload: { message: 'hello' } };
    expect(isConnectedAutomaticAccount(youtubeOwner, {}, state)).toBe(true);
    expect(isConnectedAutomaticAccount(kickAlias, {}, state)).toBe(true);
    expect(welcomeSafetyVerdict(tiktokBot, {}, state)).toEqual({ accepted: false, reason: 'connected-account' });
    expect(isConnectedAutomaticAccount(tiktokBot, { ignoreConnectedAccounts: false }, state)).toBe(false);
  });

  it('uses the creator timezone for a daily reset instead of each stream restart', () => {
    expect(localDayKey('America/Chicago', Date.parse('2026-08-03T04:30:00.000Z'))).toBe('2026-08-02');
    expect(localDayKey('America/Chicago', Date.parse('2026-08-03T06:30:00.000Z'))).toBe('2026-08-03');
  });

  it('uses one platform-colored card system and hides retired clip controls from the wizard', async () => {
    const schema = JSON.parse(await readFile('addons/automated-shoutouts/schemas/config.json', 'utf8')) as { properties: Record<string, { enum?: string[]; default?: unknown }> };
    const ui = JSON.parse(await readFile('addons/automated-shoutouts/ui/settings.json', 'utf8')) as { order: string[]; sections: Array<{ id: string; fields: string[] }> };
    expect(schema.properties['overlayPlatforms']?.default).toEqual(['twitch', 'youtube', 'kick', 'tiktok']);
    expect(schema.properties['twitchVisualTriggers']?.default).toEqual(['raid', 'first-chat', 'manual']);
    expect(schema.properties['ignoreConnectedAccounts']?.default).toBe(true);
    expect(ui.sections.find((section) => section.id === 'automatic')?.fields).toContain('ignoreConnectedAccounts');
    expect(ui.sections.find((section) => section.id === 'overlay')?.fields).toContain('twitchVisualTriggers');
    expect(ui.sections.find((section) => section.id === 'overlay')?.fields).toContain('overlayPlatforms');
    expect(ui.sections.find((section) => section.id === 'overlay')?.fields).not.toContain('twitchVisualType');
    expect(ui.sections.find((section) => section.id === 'overlay')?.fields).not.toContain('clipCount');
  });
});
