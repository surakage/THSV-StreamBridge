import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { bridgeConfigSchema, DEFAULT_IGNORED_BOT_NAMES } from '../../schemas/config.js';
import { testConfig } from '../helpers.js';

describe('bridge configuration', () => {
  it('migrates the deprecated meldOverlay alias to browserOverlay', async () => {
    const config = await testConfig();
    const input: Record<string, unknown> = { ...config, meldOverlay: { ...config.browserOverlay } };
    delete input['browserOverlay'];
    const parsed = bridgeConfigSchema.parse(input);
    expect(parsed.browserOverlay).toEqual(config.browserOverlay);
  });

  it('removes the obsolete add-on relay pseudo-platform because the relay is internal', async () => {
    const config = await testConfig();
    const parsed = bridgeConfigSchema.parse({
      ...config,
      platforms: {
        ...config.platforms,
        addons: { ...config.platforms['mock'], adapter: 'streamerbot-addon-relay', capabilities: [] },
      },
    });
    expect(parsed.platforms).not.toHaveProperty('addons');
  });

  it('accepts the example configuration', async () => {
    const config = await testConfig();
    expect(bridgeConfigSchema.safeParse(config).success).toBe(true);
    const raw = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as { streamerbot: { testMode: boolean } };
    expect(raw.streamerbot.testMode).toBe(false);
  });

  it('defaults private caption accuracy controls and rejects ambiguous duplicate rules', async () => {
    const config = await testConfig();
    const legacyCaptions = { ...config.liveCaptions } as Record<string, unknown>;
    delete legacyCaptions['useAlternatives'];
    delete legacyCaptions['alternativeConfidenceTolerance'];
    delete legacyCaptions['corrections'];
    delete legacyCaptions['profanityFilter'];
    delete legacyCaptions['additionalProfanity'];
    const parsed = bridgeConfigSchema.parse({ ...config, liveCaptions: legacyCaptions });
    expect(parsed.liveCaptions).toMatchObject({ minimumConfidence: 0.7, useAlternatives: true, alternativeConfidenceTolerance: 0.15, corrections: [], profanityFilter: true, additionalProfanity: [] });
    expect(bridgeConfigSchema.safeParse({ ...config, liveCaptions: { ...config.liveCaptions, corrections: [{ heard: 'slot', intended: 'sloth' }, { heard: 'SLOT', intended: 'Sloth' }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, liveCaptions: { ...config.liveCaptions, additionalProfanity: ['heck', 'HECK'] } }).success).toBe(false);
  });

  it('preloads conservative ignored bot names when chat settings omit the list', async () => {
    const config = await testConfig();
    const chat = { ...config.browserOverlay.chat } as Record<string, unknown>;
    delete chat['ignoredNames'];
    const parsed = bridgeConfigSchema.parse({ ...config, browserOverlay: { ...config.browserOverlay, chat } });
    expect(parsed.browserOverlay.chat.ignoredNames).toEqual([...DEFAULT_IGNORED_BOT_NAMES]);
  });

  it('rejects invalid port and unsafe network binding', async () => {
    const config = await testConfig();
    const result = bridgeConfigSchema.safeParse({ ...config, service: { ...config.service, host: '0.0.0.0', port: 80 } });
    expect(result.success).toBe(false);
  });

  it('accepts dynamically named platform entries', async () => {
    const config = await testConfig();
    const mock = config.platforms['mock'];
    expect(mock).toBeDefined();
    const result = bridgeConfigSchema.safeParse({ ...config, platforms: { ...config.platforms, vstream: { ...mock, adapter: 'vstream-plugin' } } });
    expect(result.success).toBe(true);
  });

  it('requires explicit secure opt-in for remote Streamer.bot egress', async () => {
    const config = await testConfig();
    const implicit = bridgeConfigSchema.safeParse({ ...config, streamerbot: { ...config.streamerbot, url: 'wss://remote.example/socket', allowRemote: false } });
    const insecure = bridgeConfigSchema.safeParse({ ...config, streamerbot: { ...config.streamerbot, url: 'ws://remote.example/socket', allowRemote: true } });
    const embeddedSecret = bridgeConfigSchema.safeParse({ ...config, streamerbot: { ...config.streamerbot, url: 'wss://user:secret@remote.example/socket', allowRemote: true } });
    const explicit = bridgeConfigSchema.safeParse({ ...config, streamerbot: { ...config.streamerbot, url: 'wss://remote.example/socket', allowRemote: true } });
    expect(implicit.success).toBe(false);
    expect(insecure.success).toBe(false);
    expect(embeddedSecret.success).toBe(false);
    expect(explicit.success).toBe(true);
  });

  it('validates one central prefix and rejects command or alias collisions', async () => {
    const config = await testConfig();
    expect(config.commands).toMatchObject({ enabled: true, prefix: '!' });
    const collision = bridgeConfigSchema.safeParse({
      ...config,
      commands: { ...config.commands, definitions: [
        { name: 'first', aliases: ['shared'], minimumRole: 'viewer', allowBots: false },
        { name: 'second', aliases: ['shared'], minimumRole: 'viewer', allowBots: false },
      ] },
    });
    const invalidPrefix = bridgeConfigSchema.safeParse({ ...config, commands: { ...config.commands, prefix: '??' } });
    expect(collision.success).toBe(false);
    expect(invalidPrefix.success).toBe(false);
  });

  it('defaults command definitions to a manual source and keeps synced definitions distinct', async () => {
    const config = await testConfig();
    const manual = bridgeConfigSchema.parse({
      ...config,
      commands: { ...config.commands, definitions: [{ name: 'existing', aliases: [], minimumRole: 'viewer', allowBots: false }] },
    });
    expect(manual.commands.definitions[0]?.source).toBe('manual');
    const synced = bridgeConfigSchema.parse({
      ...config,
      commands: { ...config.commands, definitions: [{ name: 'synced-command', aliases: [], minimumRole: 'viewer', allowBots: false, source: 'synced' }] },
    });
    expect(synced.commands.definitions[0]?.source).toBe('synced');
  });

  it('keeps pre-0.5.1 configuration compatible with commands safely disabled', async () => {
    const config = await testConfig();
    const { commands: _commands, ...legacy } = config;
    void _commands;
    expect(bridgeConfigSchema.parse(legacy).commands).toEqual({ enabled: false, prefix: '!', definitions: [] });
  });

  it('defaults timed actions to empty and rejects duplicate timer IDs', async () => {
    const config = await testConfig();
    const { timedActions: _timedActions, ...legacy } = config;
    void _timedActions;
    expect(bridgeConfigSchema.parse(legacy).timedActions).toEqual({ stateFile: 'data/state/timed-actions.json', definitions: [] });
    const definition = { id: 'duplicate', name: 'Duplicate', enabled: true, everyMinutes: 15, missedRunPolicy: 'skip' as const, payload: {}, selection: { mode: 'fixed' as const } };
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [definition, definition] } }).success).toBe(false);
  });

  it('rejects timed-action intervals outside the documented one-day bounds', async () => {
    const config = await testConfig();
    const definition = { id: 'bounded', name: 'Bounded', enabled: true, missedRunPolicy: 'skip', payload: {}, selection: { mode: 'fixed' } };
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...definition, everyMinutes: 0 }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...definition, everyMinutes: 1_441 }] } }).success).toBe(false);
  });

  it('validates random intervals, activity gates, and approved action targets', async () => {
    const config = await testConfig();
    const base = { id: 'random', name: 'Random', enabled: true, intervalMode: 'random', everyMinutes: 15, missedRunPolicy: 'skip', payload: {}, selection: { mode: 'fixed' } };
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, minimumMinutes: 20, maximumMinutes: 10 }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, minimumMinutes: 10, maximumMinutes: 20, target: { provider: 'run-existing-action', actionId: '11111111-1111-4111-8111-111111111111', actionName: 'Creator Action', approvedByCreator: false } }] } }).success).toBe(false);
    const parsed = bridgeConfigSchema.parse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, minimumMinutes: 10, maximumMinutes: 20 }] } });
    expect(parsed.timedActions.definitions[0]).toMatchObject({ intervalMode: 'random', gates: { requireLive: true, activity: { minimumMessages: 0, windowMinutes: 5 } }, target: { provider: 'event-only' } });
  });

  it('validates unique timed-message delivery platforms independently from live gates', async () => {
    const config = await testConfig();
    const base = { id: 'delivery', name: 'Delivery', enabled: true, everyMinutes: 15, missedRunPolicy: 'skip', payload: {}, selection: { mode: 'shuffle-container', messages: ['One', 'Two'] } };
    const action = { provider: 'run-existing-action', actionId: '7d107c29-1127-5bb1-ae8b-6f04d89a71d4', actionName: 'THSV StreamBridge - Send Timed Message', approvedByCreator: true };
    const valid = bridgeConfigSchema.parse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, gates: { requireLive: true, platforms: ['twitch'], scenes: [], activity: { minimumMessages: 0, windowMinutes: 5 } }, target: { ...action, deliveryPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'] } }] } });
    expect(valid.timedActions.definitions[0]).toMatchObject({ gates: { platforms: ['twitch'] }, target: { deliveryPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'] } });
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, gates: { requireLive: false, platforms: [], scenes: [], activity: { minimumMessages: 0, windowMinutes: 5 } }, target: { ...action, deliveryPlatforms: ['twitch'] } }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, selection: { mode: 'shuffle-container', messages: ['x'.repeat(151), 'valid'] }, target: { ...action, deliveryPlatforms: ['tiktok'] } }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, target: { ...action, deliveryPlatforms: ['twitch', 'twitch'] } }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, target: { ...action, deliveryPlatforms: ['facebook'] } }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, target: { ...action, actionId: '04ca0087-578d-5c2e-9e06-249dc072e9f8' } }] } }).success).toBe(false);
  });

  it('keeps timed-message groups as an exact organizational view of one shuffle list', async () => {
    const config = await testConfig();
    const definition = {
      id: 'grouped-rotation', name: 'Grouped rotation', enabled: true, everyMinutes: 15, missedRunPolicy: 'skip', payload: {},
      selection: {
        mode: 'shuffle-container', messages: ['Rule one', 'Hydrate', 'Join Discord'],
        groups: [
          { id: 'rules', name: 'Rules', messages: ['Rule one'] },
          { id: 'community', name: 'Community', messages: ['Hydrate', 'Join Discord'] },
        ],
      },
    };
    const parsed = bridgeConfigSchema.parse({ ...config, timedActions: { ...config.timedActions, definitions: [definition] } });
    expect(parsed.timedActions.definitions[0]?.selection).toMatchObject({ mode: 'shuffle-container', messages: ['Rule one', 'Hydrate', 'Join Discord'], groups: [{ id: 'rules' }, { id: 'community' }] });
    const drifted = { ...definition, selection: { ...definition.selection, messages: ['Hydrate', 'Rule one', 'Join Discord'] } };
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [drifted] } }).success).toBe(false);
    const duplicated = { ...definition, selection: { ...definition.selection, messages: ['Rule one', 'Hydrate', 'hydrate'], groups: [{ id: 'rules', name: 'Rules', messages: ['Rule one'] }, { id: 'community', name: 'Community', messages: ['Hydrate', 'hydrate'] }] } };
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [duplicated] } }).success).toBe(false);
  });

  it('validates independent per-platform timed-message rotations and character limits', async () => {
    const config = await testConfig();
    const definition = {
      id: 'platform-rotation', name: 'Platform rotation', enabled: true, everyMinutes: 15, missedRunPolicy: 'skip', payload: {},
      selection: { mode: 'platform-shuffle', messagesByPlatform: { twitch: ['Twitch one', 'Twitch two'], youtube: ['YouTube one', 'YouTube two'], tiktok: ['TikTok one', 'TikTok two'] } },
    };
    const parsed = bridgeConfigSchema.parse({ ...config, timedActions: { ...config.timedActions, definitions: [definition] } });
    expect(parsed.timedActions.definitions[0]?.selection).toMatchObject({ mode: 'platform-shuffle', messagesByPlatform: { twitch: ['Twitch one', 'Twitch two'] } });
    const tooLongYouTube = { ...definition, selection: { mode: 'platform-shuffle', messagesByPlatform: { youtube: ['x'.repeat(201), 'valid'] } } };
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [tooLongYouTube] } }).success).toBe(false);
    const onlyOne = { ...definition, selection: { mode: 'platform-shuffle', messagesByPlatform: { kick: ['Only one'] } } };
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [onlyOne] } }).success).toBe(false);
  });

  it('validates alert presentation templates, bounds, and gift-only aggregation', async () => {
    const config = await testConfig();
    const valid = bridgeConfigSchema.parse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: {
      twitch: { cheer: { enabled: true, priority: 'critical', durationMs: 9_000, titleTemplate: '{actor} cheered {quantity} bits', detailTemplate: '{message}', sound: { mode: 'chime', volume: 0.4 }, aggregation: { mode: 'none', windowMs: 5_000 } } },
      kick: { gift: { enabled: true, sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'sum-quantity', windowMs: 4_000 } } },
    } } } });
    expect(valid.browserOverlay.alerts.profiles.twitch?.cheer).toMatchObject({ priority: 'critical', durationMs: 9_000 });
    // A platform that never produces a given alert type is rejected, not silently accepted.
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: { twitch: { 'super-chat': { enabled: true, sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'none', windowMs: 5_000 } } } } } } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: { twitch: { cheer: { titleTemplate: '{unknown}', sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'none', windowMs: 5_000 } } } } } } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: { twitch: { follow: { sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'sum-quantity', windowMs: 5_000 } } } } } } }).success).toBe(false);
  });

  it('accepts an animated GIF or an uploaded background video for an alert card, but not both at once', async () => {
    const config = await testConfig();
    const gifUrl = `/overlay/assets/${'a'.repeat(64)}.gif`;
    const withGif = bridgeConfigSchema.parse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: {
      twitch: { follow: { sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'none', windowMs: 5_000 }, card: { backgroundColor: '#171120', fontFamily: 'system', backgroundImageUrl: gifUrl } } },
    } } } });
    expect(withGif.browserOverlay.alerts.profiles.twitch?.follow?.card.backgroundImageUrl).toBe(gifUrl);
    const videoUrl = `/overlay/assets/${'b'.repeat(64)}.mp4`;
    const withVideo = bridgeConfigSchema.parse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: {
      twitch: { follow: { sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'none', windowMs: 5_000 }, card: { backgroundColor: '#171120', fontFamily: 'system', backgroundVideoUrl: videoUrl } } },
    } } } });
    expect(withVideo.browserOverlay.alerts.profiles.twitch?.follow?.card.backgroundVideoUrl).toBe(videoUrl);
    // An image and a video on the same card at once is ambiguous for the renderer and is rejected, not silently resolved.
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: {
      twitch: { follow: { sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'none', windowMs: 5_000 }, card: { backgroundColor: '#171120', fontFamily: 'system', backgroundImageUrl: gifUrl, backgroundVideoUrl: videoUrl } } },
    } } } }).success).toBe(false);
    // Only mp4/webm are accepted video extensions, matching what the upload endpoint ever produces.
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: {
      twitch: { follow: { sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'none', windowMs: 5_000 }, card: { backgroundColor: '#171120', fontFamily: 'system', backgroundVideoUrl: `/overlay/assets/${'c'.repeat(64)}.mov` } } },
    } } } }).success).toBe(false);
  });

  it('defaults an alert card to a classic rectangle with vertical slide and accepts explicit overrides', async () => {
    const config = await testConfig();
    const defaulted = bridgeConfigSchema.parse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: {
      twitch: { follow: { sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'none', windowMs: 5_000 }, card: { backgroundColor: '#171120', fontFamily: 'system' } } },
    } } } });
    expect(defaulted.browserOverlay.alerts.profiles.twitch?.follow?.card).toMatchObject({ layout: 'classic', mediaPlacement: 'behind', transition: 'slide-vertical' });
    const overridden = bridgeConfigSchema.parse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: {
      twitch: { follow: { sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'none', windowMs: 5_000 }, card: { backgroundColor: '#171120', fontFamily: 'system', layout: 'stacked', mediaPlacement: 'inset', transition: 'fade' } } },
    } } } });
    expect(overridden.browserOverlay.alerts.profiles.twitch?.follow?.card).toMatchObject({ layout: 'stacked', mediaPlacement: 'inset', transition: 'fade' });
    // An unrecognized layout or placement is rejected, not silently coerced to a default.
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: {
      twitch: { follow: { sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'none', windowMs: 5_000 }, card: { backgroundColor: '#171120', fontFamily: 'system', layout: 'floating' } } },
    } } } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, alerts: { profiles: {
      twitch: { follow: { sound: { mode: 'none', volume: 0.35 }, aggregation: { mode: 'none', windowMs: 5_000 }, card: { backgroundColor: '#171120', fontFamily: 'system', transition: 'spin' } } },
    } } } }).success).toBe(false);
  });

  it('validates saved chat appearance and a case-insensitive ignored-name list', async () => {
    const config = await testConfig();
    const valid = bridgeConfigSchema.parse({ ...config, browserOverlay: { ...config.browserOverlay, chat: {
      ...config.browserOverlay.chat, layout: 'compact', orientation: 'horizontal', newMessagePosition: 'start', animation: 'fade', textAlign: 'center', fontFamily: 'rounded', fontSizePx: 24, backgroundMode: 'solid', ignoredNames: ['ExampleBot', 'Another Viewer'],
    } } });
    expect(valid.browserOverlay.chat).toMatchObject({ layout: 'compact', orientation: 'horizontal', newMessagePosition: 'start', animation: 'fade', textAlign: 'center', fontSizePx: 24, ignoredNames: ['ExampleBot', 'Another Viewer'] });
    expect(bridgeConfigSchema.parse({ ...config, browserOverlay: { ...config.browserOverlay, chat: { ...config.browserOverlay.chat, layout: 'classic' } } }).browserOverlay.chat.layout).toBe('classic');
    expect(valid.browserOverlay.chat).toMatchObject({ messageColorMode: 'platform', platformMessageColors: { twitch: '#321b52', youtube: '#571313', kick: '#153e12', tiktok: '#10272c', streamlabs: '#125a47', kofi: '#123b52' } });
    expect(valid.browserOverlay.chat.events).toMatchObject({ enabled: true, platforms: { twitch: true, youtube: true, kick: true, tiktok: true, streamlabs: true, kofi: true }, platformEvents: { youtube: { subscriber: { enabled: true }, member: { enabled: true } }, tiktok: { likes: { enabled: true }, subscription: { enabled: true } }, streamlabs: { donation: { enabled: true } }, kofi: { donation: { enabled: true } } }, characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150, streamlabs: 500, kofi: 500 } });
    expect(valid.browserOverlay.chat.events).not.toHaveProperty('categories');
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, chat: { ...config.browserOverlay.chat, fontSizePx: 60 } } }).success).toBe(false);
    expect(bridgeConfigSchema.parse({ ...config, browserOverlay: { ...config.browserOverlay, chat: { ...config.browserOverlay.chat, fontSizePx: 12 } } }).browserOverlay.chat.fontSizePx).toBe(14);
    expect(bridgeConfigSchema.parse({ ...config, browserOverlay: { ...config.browserOverlay, chat: { ...config.browserOverlay.chat, fontSizePx: 36 } } }).browserOverlay.chat.fontSizePx).toBe(28);
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, chat: { ...config.browserOverlay.chat, backgroundColor: 'red' } } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, chat: { ...config.browserOverlay.chat, orientation: 'diagonal' } } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, chat: { ...config.browserOverlay.chat, layout: 'bubble' } } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, chat: { ...config.browserOverlay.chat, ignoredNames: ['ExampleBot', 'examplebot'] } } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, chat: { ...config.browserOverlay.chat, events: { ...config.browserOverlay.chat.events, characterLimits: { ...config.browserOverlay.chat.events.characterLimits, youtube: 39 } } } } }).success).toBe(false);
    const invalidEvents = structuredClone(config.browserOverlay.chat.events);
    invalidEvents.platformEvents.youtube.subscriber.template = '{rawStreamerBotVariable}';
    expect(bridgeConfigSchema.safeParse({ ...config, browserOverlay: { ...config.browserOverlay, chat: { ...config.browserOverlay.chat, events: invalidEvents } } }).success).toBe(false);
  });

  it('repairs known mojibake in saved reward and alert templates', async () => {
    const config = await testConfig();
    const input = structuredClone(config);
    input.browserOverlay.chat.events.platformEvents.twitch['reward-redemption'].template = '{actor} redeemed {rewardTitle} \u00c2\u00b7 {input}';
    const profile = (titleTemplate: string) => ({
      enabled: true, titleTemplate,
      sound: { mode: 'none' as const, volume: 0.35 },
      card: { backgroundColor: '#171120', fontFamily: 'system' as const, layout: 'classic' as const, mediaPlacement: 'behind' as const, transition: 'slide-vertical' as const },
      aggregation: { mode: 'none' as const, windowMs: 5_000 },
    });
    input.browserOverlay.alerts.profiles.twitch = { follow: profile('\u00e2\u0153\u00a8 {actor} followed \u00e2\u20ac\u201d thank you!') };
    input.browserOverlay.alerts.profiles.streamlabs = { donation: profile('\u00f0\u0178\u201d\u00a5 {actor} donated {amount} {currency} \u00c2\u00b7 LET\'S GO!') };
    const repaired = bridgeConfigSchema.parse(input);
    expect(repaired.browserOverlay.chat.events.platformEvents.twitch['reward-redemption'].template).toBe('{actor} redeemed {rewardTitle} \u00b7 {input}');
    expect(repaired.browserOverlay.alerts.profiles.twitch?.follow?.titleTemplate).toBe('\u2728 {actor} followed \u2014 thank you!');
    expect(repaired.browserOverlay.alerts.profiles.streamlabs?.donation?.titleTemplate).toBe('\ud83d\udd25 {actor} donated {amount} {currency} \u00b7 LET\'S GO!');
  });

  it('repairs repeatedly encoded decorations from older saved alert profiles', async () => {
    const config = await testConfig();
    const input = structuredClone(config);
    const profile = (titleTemplate: string) => ({
      enabled: true, titleTemplate,
      sound: { mode: 'none' as const, volume: 0.35 },
      card: { backgroundColor: '#171120', fontFamily: 'system' as const, layout: 'classic' as const, mediaPlacement: 'behind' as const, transition: 'slide-vertical' as const },
      aggregation: { mode: 'none' as const, windowMs: 5_000 },
    });
    input.browserOverlay.alerts.profiles.tiktok = { gift: profile('\u00c3\u00a2\u00c5\u201c\u00c2\u00a8 {actor} sent {quantity} {itemName} \u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac thank you!') };
    input.browserOverlay.alerts.profiles.kofi = { donation: profile('\u00c3\u00b0\u00c5\u00b8\u00e2\u20ac\u00c2\u00a5 {actor} donated {amount} {currency} \u00c3\u201a\u00c2\u00b7 LET\'S GO!') };
    const repaired = bridgeConfigSchema.parse(input);
    expect(repaired.browserOverlay.alerts.profiles.tiktok?.gift?.titleTemplate).toBe('\u2728 {actor} sent {quantity} {itemName} \u2014 thank you!');
    expect(repaired.browserOverlay.alerts.profiles.kofi?.donation?.titleTemplate).toBe('\ud83d\udd25 {actor} donated {amount} {currency} \u00b7 LET\'S GO!');
  });

  it('migrates legacy grouped chat events into separate platform events', async () => {
    const config = await testConfig();
    const input = structuredClone(config) as unknown as Record<string, unknown>;
    const overlay = input['browserOverlay'] as Record<string, unknown>;
    const chat = overlay['chat'] as Record<string, unknown>;
    chat['events'] = {
      enabled: true,
      platforms: { twitch: true, youtube: true, kick: true, tiktok: true },
      categories: { rewards: true, follows: true, subscriptions: false, gifts: true, support: true, raids: true, milestones: true },
      templates: { youtube: { follows: '{actor} found the channel' } },
      characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150 },
    };
    const migrated = bridgeConfigSchema.parse(input).browserOverlay.chat.events;
    expect(migrated.platformEvents.youtube.subscriber).toEqual({ enabled: true, template: '{actor} found the channel' });
    expect(migrated.platformEvents.youtube.member.enabled).toBe(false);
    expect(migrated.platformEvents.tiktok.subscription.enabled).toBe(false);
    expect(migrated.platformEvents.kofi.donation).toEqual({ enabled: true, template: '{actor} supported with {amount} {currency} {message}' });
    expect(migrated.platformEvents.streamlabs.donation).toEqual({ enabled: true, template: '{actor} donated {amount} {currency} {message}' });
    expect(migrated.platforms.kofi).toBe(true);
    expect(migrated.platforms.streamlabs).toBe(true);
    expect(migrated.characterLimits.kofi).toBe(500);
    expect(migrated.characterLimits.streamlabs).toBe(500);
    expect(migrated).not.toHaveProperty('categories');
    expect(migrated).not.toHaveProperty('templates');
  });

  it('loads legacy viewer and companion configuration without reactivating archived add-ons', async () => {
    const config = await testConfig();
    const legacy = {
      ...config,
      browserOverlay: { ...config.browserOverlay, maxCompanionQueue: 20 },
      viewerIdentity: { enabled: true, stateFile: 'data/state/viewer-progression.json' },
      companion: { enabled: true, stateFile: 'data/state/companion.json' },
    };
    const parsed = bridgeConfigSchema.parse(legacy);
    expect(parsed).not.toHaveProperty('viewerIdentity');
    expect(parsed).not.toHaveProperty('companion');
    expect(parsed.browserOverlay).not.toHaveProperty('maxCompanionQueue');
  });
});
