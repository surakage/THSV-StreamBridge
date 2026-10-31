import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import endCredits, { processEndCreditsEvent, sanitizeCreditsState, sectionFor, settingsFor } from '../../addons/end-credits/dist/index.js';
import type { NormalizedEvent } from '../../schemas/event.js';

interface CreditsName { readonly name: string; readonly platform: string; readonly count?: number }
interface CreditsSection { readonly key: string; readonly names: readonly CreditsName[] }
interface CreditsPayload { readonly preview?: boolean; readonly sections: readonly CreditsSection[] }
interface Published { readonly topic: string; readonly payload: CreditsPayload; readonly lane: string | undefined }

let sequence = 0;
function event(eventType: string, platform: string, options: { name?: string; id?: string; roles?: string[]; payload?: Record<string, unknown>; simulated?: boolean } = {}): NormalizedEvent {
  sequence += 1;
  const name = options.name ?? 'Example Viewer';
  return {
    schemaVersion: '1.0.0',
    eventId: `${platform}-${eventType}-${String(sequence)}`,
    eventType,
    platform,
    source: { adapter: 'test', eventId: `${platform}-source-${String(sequence)}`, eventName: eventType },
    receivedAt: '2026-10-31T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'Example Channel' },
    user: { id: options.id ?? name.toLowerCase(), name: name.toLowerCase(), displayName: name, actorType: 'human', roles: options.roles ?? [] },
    payload: options.payload ?? {},
    metadata: { simulated: options.simulated === true },
  } as NormalizedEvent;
}

function harness(settings: Record<string, unknown> = {}) {
  let state: unknown;
  const overlays: Published[] = [];
  return {
    context: {
      settings,
      state: { read: async () => state, write: async (value: unknown) => { state = value; } },
      overlay: { publish: async (topic: string, payload: CreditsPayload, options?: { lane?: string }) => { overlays.push({ topic, payload, lane: options?.lane }); } },
    },
    overlays,
    state: () => state as { sessionStartedAt: number } | undefined,
  };
}
function last<T>(items: readonly T[]): T { const item = items.at(-1); if (item === undefined) throw new Error('No overlay was published.'); return item; }
const section = (payload: CreditsPayload, key: string) => payload.sections.find((item) => item.key === key);
const names = (payload: CreditsPayload, key: string) => section(payload, key)?.names.map((entry) => entry.name);

describe('End Credits add-on', () => {
  it('sorts events into credits sections by meaning', () => {
    expect(sectionFor(event('channel.follow', 'youtube'))).toMatchObject({ key: 'followers' });
    expect(sectionFor(event('channel.membership', 'youtube'))).toMatchObject({ key: 'members' });
    expect(sectionFor(event('channel.gift-subscription', 'twitch', { payload: { quantity: 5 } }))).toMatchObject({ key: 'gifters', count: 5 });
    expect(sectionFor(event('engagement.super-chat', 'youtube'))).toMatchObject({ key: 'supporters' });
    expect(sectionFor(event('channel.raid', 'twitch'))).toMatchObject({ key: 'raiders' });
    expect(sectionFor(event('chat.message', 'twitch', { roles: ['moderator'] }))).toMatchObject({ key: 'moderators', alsoChatter: true });
    expect(sectionFor(event('chat.message', 'twitch', { roles: ['broadcaster'] }))).toBeUndefined();
    expect(sectionFor(event('chat.message', 'kick'))).toMatchObject({ key: 'chatters' });
  });

  it('collects names once per platform, sums gifts and starts fresh when the stream goes live', async () => {
    const test = harness();
    await processEndCreditsEvent(event('channel.follow', 'twitch', { name: 'Ada' }), test.context, 1);
    await processEndCreditsEvent(event('channel.follow', 'twitch', { name: 'Ada' }), test.context, 2);
    await processEndCreditsEvent(event('channel.follow', 'youtube', { name: 'Ada' }), test.context, 3);
    await processEndCreditsEvent(event('channel.gift-subscription', 'twitch', { name: 'Gifty', payload: { quantity: 3 } }), test.context, 4);
    await processEndCreditsEvent(event('channel.gift-subscription', 'twitch', { name: 'Gifty', payload: { quantity: 2 } }), test.context, 5);
    const payload = last(test.overlays).payload;
    expect(test.overlays.at(-1)).toMatchObject({ topic: 'thsv.end-credits.credits.update', lane: 'persistent' });
    expect(section(payload, 'followers')?.names).toEqual([{ name: 'Ada', platform: 'twitch' }, { name: 'Ada', platform: 'youtube' }]);
    expect(section(payload, 'gifters')?.names).toEqual([{ name: 'Gifty', platform: 'twitch', count: 5 }]);
    expect(payload.sections.map((item) => item.key)).not.toContain('chatters');

    await processEndCreditsEvent(event('stream.online', 'twitch'), test.context, 10);
    expect(test.state()?.sessionStartedAt).toBe(10);
    expect(names(last(test.overlays).payload, 'followers')).toEqual([]);
  });

  it('keeps moderators and optional chatters, ignores disabled platforms and caps each section', async () => {
    const test = harness({ enabledSections: ['moderators', 'chatters'], enabledPlatforms: ['twitch'], maximumNamesPerSection: 10 });
    await processEndCreditsEvent(event('chat.message', 'twitch', { name: 'Mod', roles: ['moderator'] }), test.context);
    await processEndCreditsEvent(event('chat.message', 'kick', { name: 'KickViewer' }), test.context);
    for (let index = 0; index < 15; index += 1) await processEndCreditsEvent(event('chat.message', 'twitch', { name: `Viewer${String(index)}` }), test.context);
    const payload = last(test.overlays).payload;
    expect(names(payload, 'moderators')).toEqual(['Mod']);
    expect(names(payload, 'chatters')).toHaveLength(10);
    expect(names(payload, 'chatters')).toContain('Mod');
    expect(names(payload, 'chatters')).not.toContain('KickViewer');
  });

  it('shows simulated events as a preview without saving them', async () => {
    const test = harness();
    await processEndCreditsEvent(event('channel.raid', 'twitch', { name: 'Test Raider', simulated: true }), test.context);
    expect(test.state()).toBeUndefined();
    expect(test.overlays.at(-1)).toMatchObject({ lane: 'preview', payload: { preview: true } });
    expect(names(last(test.overlays).payload, 'raiders')).toEqual(['Test Raider']);
  });

  it('lets moderators roll, hide and reset the credits, but not viewers', async () => {
    const test = harness({ commandName: '!Credits' });
    await processEndCreditsEvent(event('channel.follow', 'twitch', { name: 'Ada' }), test.context);
    const command = (argument: string | undefined, roles: string[]) => event('command.received', 'twitch', { roles, payload: { command: 'credits', arguments: argument ? [argument] : [] } });
    expect(await processEndCreditsEvent(command(undefined, []), test.context)).toBeUndefined();
    expect(await processEndCreditsEvent(command(undefined, ['moderator']), test.context)).toEqual({ action: 'roll' });
    expect(test.overlays.at(-1)).toMatchObject({ topic: 'thsv.end-credits.credits.roll' });
    expect(names(last(test.overlays).payload, 'followers')).toEqual(['Ada']);
    await processEndCreditsEvent(command('stop', ['broadcaster']), test.context);
    expect(last(test.overlays).topic).toBe('thsv.end-credits.credits.hide');
    await processEndCreditsEvent(command('reset', ['mod']), test.context);
    expect(names(last(test.overlays).payload, 'followers')).toEqual([]);
    expect(await processEndCreditsEvent(command(undefined, ['moderator']), harness({ enableModeratorCommand: false }).context)).toBeUndefined();
  });

  it('bounds settings and saved state', () => {
    const settings = settingsFor({ settings: { scrollSpeed: 9999, columns: 0, commandName: '!!bad name', enabledSections: ['followers', 'nope'] } });
    expect(settings.scrollSpeed).toBe(300);
    expect(settings.columns).toBe(1);
    expect(settings.commandName).toBe('credits');
    expect([...settings.enabledSections]).toEqual(['followers']);
    const state = sanitizeCreditsState({ sessionStartedAt: 5, sections: { followers: [{ name: 'Ada', platform: 'twitch' }, { name: 'Ada', platform: 'twitch' }, { name: 'x', platform: 'myspace' }], bogus: [{ name: 'Nope', platform: 'twitch' }] } });
    expect(state.sections.followers).toEqual([{ key: 'twitch:ada', name: 'Ada', platform: 'twitch', count: 1 }]);
    expect(state.sections).not.toHaveProperty('bogus');
  });

  it('publishes the saved list on start and ships a matching package descriptor', async () => {
    const test = harness();
    await endCredits.start(test.context);
    expect(test.overlays).toHaveLength(1);
    const descriptor = JSON.parse(await readFile('addons/end-credits/module-package.json', 'utf8')) as { manifest: { moduleId: string; commandsProvided: Array<{ id: string }> }; permissions: string[] };
    expect(descriptor.manifest).toMatchObject({ moduleId: 'thsv.end-credits', commandsProvided: [{ id: 'end-credits.roll' }] });
    expect(descriptor.permissions).toEqual(['events.subscribe', 'overlay.publish', 'state.private']);
    expect(endCredits.manifest.eventSubscriptions).toEqual(expect.arrayContaining(['stream.online', 'chat.message', 'command.received']));
  });

  it('counts StreamElements tips, including for saved lists that ticked every platform before it existed', () => {
    const legacyAll = ['twitch', 'youtube', 'kick', 'tiktok', 'streamlabs', 'kofi'];
    expect([...settingsFor({ settings: {} }).enabledPlatforms]).toContain('streamelements');
    expect([...settingsFor({ settings: { enabledPlatforms: legacyAll } }).enabledPlatforms]).toContain('streamelements');
    expect([...settingsFor({ settings: { enabledPlatforms: ['twitch', 'kofi'] } }).enabledPlatforms]).toEqual(['twitch', 'kofi']);
  });
});
