import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import streamLabels, { primaryKey, processStreamLabelEvent, sanitizeStreamLabelState } from '../../addons/stream-labels/dist/index.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function event(eventType: string, platform: string, payload: Record<string, unknown> = {}, simulated = false): NormalizedEvent {
  return {
    schemaVersion: '1.0.0',
    eventId: `${platform}-${eventType}-1`,
    eventType,
    platform,
    source: { adapter: 'test', eventId: `${platform}-source-1`, eventName: eventType },
    receivedAt: '2026-07-31T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'Example Channel' },
    user: { id: 'viewer-1', name: 'example_viewer', displayName: 'Example Viewer', actorType: 'human', roles: [] },
    payload,
    metadata: { simulated },
  } as NormalizedEvent;
}

function context() {
  let state: unknown;
  const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
  return {
    context: {
      settings: {},
      state: { read: async () => state, write: async (value: unknown) => { state = value; } },
      overlay: { publish: async (topic: string, payload: Record<string, unknown>) => { overlays.push({ topic, payload }); } },
    },
    overlays,
    state: () => state,
  };
}

describe('Stream Labels add-on', () => {
  it('groups equivalent platform events by meaning', () => {
    expect(primaryKey(event('channel.follow', 'twitch'))).toBe('follower');
    expect(primaryKey(event('channel.follow', 'youtube'))).toBe('follower');
    expect(primaryKey(event('channel.subscription', 'tiktok'))).toBe('member');
    expect(primaryKey(event('channel.membership', 'youtube'))).toBe('member');
    expect(primaryKey(event('channel.gift-subscription', 'kick'))).toBe('gift-membership');
    expect(primaryKey(event('engagement.super-chat', 'youtube'))).toBe('support');
  });

  it('persists only the latest bounded label values and publishes the latest-event mirror', async () => {
    const runtime = context();
    await processStreamLabelEvent(event('channel.membership', 'youtube', { months: 6 }), runtime.context, 100);
    await processStreamLabelEvent(event('engagement.super-chat', 'youtube', { amount: '25.00', currency: 'USD' }), runtime.context, 200);
    const state = sanitizeStreamLabelState(runtime.state()) as { labels: Record<string, { value: string; platform: string; at: number }> };
    expect(Object.keys(state.labels).sort()).toEqual(['latest', 'member', 'support']);
    expect(state.labels.member).toMatchObject({ value: 'Example Viewer · 6 months', platform: 'youtube', at: 100 });
    expect(state.labels.support).toMatchObject({ value: 'Example Viewer · 25.00 USD', at: 200 });
    expect(state.labels.latest).toMatchObject({ value: 'Example Viewer · 25.00 USD', at: 200 });
    expect(runtime.overlays.at(-1)?.topic).toBe('thsv.stream-labels.labels.update');
  });

  it('shows simulator events without replacing saved live labels', async () => {
    const runtime = context();
    await processStreamLabelEvent(event('channel.follow', 'twitch'), runtime.context, 100);
    const liveState = JSON.stringify(runtime.state());
    await processStreamLabelEvent(event('channel.follow', 'kick', {}, true), runtime.context, 200);
    await processStreamLabelEvent(event('channel.membership', 'youtube', { months: 3 }, true), runtime.context, 300);
    expect(JSON.stringify(runtime.state())).toBe(liveState);
    expect(runtime.overlays.at(-1)?.payload).toMatchObject({ preview: true, labels: { follower: { platform: 'kick' }, member: { platform: 'youtube' } } });
  });

  it('serializes concurrent event updates so one label cannot overwrite another', async () => {
    const runtime = context();
    await streamLabels.start(runtime.context);
    await Promise.all([
      streamLabels.onEvent(event('channel.follow', 'twitch'), runtime.context),
      streamLabels.onEvent(event('engagement.super-chat', 'youtube', { amount: '5.00', currency: 'USD' }), runtime.context),
    ]);
    const state = sanitizeStreamLabelState(runtime.state()) as { labels: Record<string, unknown> };
    expect(Object.keys(state.labels).sort()).toEqual(['follower', 'latest', 'support']);
    await streamLabels.stop(runtime.context);
  });

  it('ships a guided configuration with no direct Streamer.bot action dependency', async () => {
    const descriptor = JSON.parse(await readFile('addons/stream-labels/module-package.json', 'utf8')) as {
      permissions: string[];
      manifest: { actionsProvided: unknown[]; eventSubscriptions: string[] };
    };
    const ui = JSON.parse(await readFile('addons/stream-labels/ui/settings.json', 'utf8')) as { sections: Array<{ id: string }> };
    expect(descriptor.permissions).toEqual(['events.subscribe', 'overlay.publish', 'state.private']);
    expect(descriptor.manifest.actionsProvided).toEqual([]);
    expect(descriptor.manifest.eventSubscriptions).toContain('channel.membership');
    expect(ui.sections.map((section) => section.id)).toEqual(['quick-start', 'mapping', 'wording', 'appearance', 'obs']);
  });
});
