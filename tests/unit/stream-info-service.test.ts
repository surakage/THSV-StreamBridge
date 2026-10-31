import { describe, expect, it, vi } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { RunningModuleSnapshot } from '../../bridge/core/module-registry.js';
import { StreamInfoService, consoleDetectedEvent, consolePresenceSettings, matchConsoleGame } from '../../bridge/services/stream-info-service.js';

const CONTROLLER = '183afef4-fc53-4337-859f-c9fe6d1961e1';
const creatorSettings = {
  enabled: true,
  profile1Enabled: true, profile1Name: 'Starting Soon', profile1Platforms: ['twitch', 'youtube', 'kick'], profile1Title: 'Starting soon', profile1TwitchCategoryId: '', profile1YoutubeCategoryName: 'Gaming', profile1KickCategoryName: 'Just Chatting',
  profile2Enabled: false, profile2Name: 'Gameplay', profile2Platforms: ['twitch'], profile2Title: 'Game',
};
const apply = { profileId: 'profile-1', platforms: ['twitch', 'kick'], title: 'Live now', twitchCategoryId: '509658', youtubeCategoryName: '', kickCategoryName: 'Just Chatting' };

function harness(options: { connected?: boolean; creator?: Partial<RunningModuleSnapshot> | null; pilot?: Partial<RunningModuleSnapshot> } = {}) {
  const ingest = vi.fn(async (event: NormalizedEvent) => { void event; return { accepted: true }; });
  let now = 1_000;
  const creator: RunningModuleSnapshot | undefined = options.creator === null ? undefined : { moduleId: 'thsv.creator-controls', status: 'healthy', settings: creatorSettings, approvedActionIds: [CONTROLLER], ...options.creator };
  const pilot: RunningModuleSnapshot | undefined = options.pilot === undefined ? undefined : { moduleId: 'thsv.category-pilot', status: 'healthy', settings: {}, approvedActionIds: [], ...options.pilot };
  const service = new StreamInfoService({
    runningModule: (moduleId) => moduleId === 'thsv.creator-controls' ? creator : moduleId === 'thsv.category-pilot' ? pilot : undefined,
    streamerBotConnected: () => options.connected ?? true,
    ingest,
    consoleStatus: () => ({ xbox: { saved: true, enabled: true, polling: true, titleName: 'Forza Horizon 5' }, playstation: { saved: false, enabled: false, polling: false, titleName: '' } }),
    now: () => now,
  });
  return { service, ingest, advance: (ms: number) => { now += ms; } };
}

describe('Stream info service', () => {
  it('applies the edited values right away through the Creator Controls control event', async () => {
    const test = harness();
    const started = await test.service.apply(apply);
    expect(started['requestId']).toMatch(/^stream-info-[0-9a-f-]{36}$/u);
    const event = test.ingest.mock.calls[0]?.[0];
    expect(event).toMatchObject({ eventId: started['requestId'], eventType: 'addon.thsv.creator-controls.control', platform: 'system', source: { adapter: 'stream-info-page' }, metadata: { simulated: false }, payload: { profileId: 'profile-1', platforms: ['twitch', 'kick'], title: 'Live now', twitchCategoryId: '509658', kickCategoryName: 'Just Chatting' } });
    expect(test.service.result(String(started['requestId']))).toMatchObject({ state: 'pending' });
    test.service.observe({ ...event, eventType: 'addon.thsv.creator-controls.result', source: { adapter: 'streamerbot-addon-relay', eventName: 'result' }, payload: { requestId: started['requestId'], profileId: 'profile-1', success: false, results: [{ platform: 'twitch', success: true }, { platform: 'kick', success: false }] } } as unknown as NormalizedEvent);
    expect(test.service.result(String(started['requestId']))).toEqual({ requestId: started['requestId'], state: 'done', success: false, platforms: ['twitch', 'kick'], results: [{ platform: 'twitch', success: true }, { platform: 'kick', success: false }] });
  });

  it('reports a timeout when Streamer.bot never answers', async () => {
    const test = harness();
    const started = await test.service.apply(apply);
    test.advance(31_000);
    expect(test.service.result(String(started['requestId']))).toMatchObject({ state: 'timeout' });
  });

  it.each([
    [{ connected: false }, 'Streamer.bot is not connected. Start Streamer.bot, then try again.'],
    [{ creator: null }, 'Creator Controls is not installed.'],
    [{ creator: { settings: { ...creatorSettings, enabled: false } } }, 'Creator Controls is off. Turn it on in the Wizard, save, then restart StreamBridge.'],
    [{ creator: { status: 'failed' as const } }, 'Creator Controls is off. Turn it on in the Wizard, save, then restart StreamBridge.'],
    [{ creator: { approvedActionIds: [] } }, 'Approve the Creator Controls Provider Controller in the Wizard first.'],
  ])('refuses instead of silently doing nothing (%#)', async (options, message) => {
    const test = harness(options);
    await expect(test.service.apply(apply)).rejects.toThrow(message);
    expect(test.ingest).not.toHaveBeenCalled();
  });

  it('validates the request', async () => {
    const test = harness();
    await expect(test.service.apply({ ...apply, profileId: 'profile-2' })).rejects.toThrow('This profile is turned off in the Wizard.');
    await expect(test.service.apply({ ...apply, platforms: [] })).rejects.toThrow('Tick at least one platform.');
    await expect(test.service.apply({ ...apply, twitchCategoryId: 'abc' })).rejects.toThrow('digits only');
    await expect(test.service.apply({ ...apply, title: ' ', twitchCategoryId: '', kickCategoryName: '' })).rejects.toThrow('Type a title or at least one category.');
    await expect(test.service.apply({ ...apply, platforms: ['tiktok'] })).rejects.toThrow('Choose a profile and fill in the title and categories.');
    expect(test.ingest).not.toHaveBeenCalled();
  });

  it('shows profiles, console games and the matched detected game', () => {
    const test = harness({ pilot: { settings: { enabled: true, xboxEnabled: true, console1Enabled: true, console1Platform: 'xbox', console1TitleName: 'forza horizon 5', console1Profile: 'profile-1' } } });
    const status = test.service.status() as Record<string, Record<string, unknown>>;
    expect(status['streamerBotConnected']).toBe(true);
    expect(status['creatorControls']).toMatchObject({ enabled: true, controllerApproved: true });
    expect((status['creatorControls']?.['profiles'] as unknown[])[0]).toMatchObject({ id: 'profile-1', name: 'Starting Soon', title: 'Starting soon' });
    expect(status['categoryPilot']).toMatchObject({ enabled: true, consoles: { xbox: { titleName: 'Forza Horizon 5', profileId: 'profile-1' } } });
  });

  it('builds console detections and settings for the presence checker', () => {
    expect(consoleDetectedEvent('playstation', 'Astro Bot')).toMatchObject({ eventType: 'addon.thsv.category-pilot.console-detected', source: { adapter: 'console-presence' }, payload: { console: 'playstation', titleName: 'Astro Bot' } });
    expect(consolePresenceSettings({ moduleId: 'thsv.category-pilot', status: 'healthy', settings: { enabled: true, intervalSeconds: 45, playstationEnabled: true }, approvedActionIds: [] })).toEqual({ enabled: true, requireLive: true, intervalSeconds: 45, xbox: false, playstation: true });
    expect(consolePresenceSettings(undefined)).toBeUndefined();
    expect(matchConsoleGame([{ console: 'playstation', titleName: 'Astro Bot', profileId: 'profile-2' }], 'xbox', 'Astro Bot')).toBeUndefined();
  });
});
