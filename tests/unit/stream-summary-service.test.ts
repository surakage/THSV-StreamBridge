import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StreamSummaryService } from '../../bridge/services/stream-summary-service.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function event(eventType: string, platform = 'twitch', user?: { id: string; actorType?: 'human' | 'bot' }, simulated = false): NormalizedEvent {
  return { schemaVersion: '1.0.0', eventId: `${eventType}-${String(Math.random())}`, eventType, platform, source: { adapter: 'test', eventName: 'Test' }, receivedAt: new Date().toISOString(), channel: { name: 'Channel' }, ...(user === undefined ? {} : { user: { id: user.id, name: user.id, actorType: user.actorType ?? 'human', roles: [] } }), payload: {}, metadata: { simulated, unverifiedFields: [] } } as unknown as NormalizedEvent;
}

describe('StreamSummaryService', () => {
  let root: string | undefined;
  afterEach(async () => { if (root !== undefined) await rm(root, { recursive: true, force: true }); });

  it('counts a stream from start to end and stores no names', async () => {
    root = await mkdtemp(join(tmpdir(), 'thsv-stream-summary-'));
    const path = join(root, 'state', 'stream-summaries.json');
    let now = Date.parse('2026-11-10T18:00:00.000Z');
    const service = new StreamSummaryService(path, () => now); await service.start();
    service.observe(event('chat.message', 'twitch', { id: 'before' }));
    expect(service.status()).toEqual({ live: false, recent: [] });
    service.observe(event('system.broadcast-started', 'system'));
    service.observe(event('chat.message', 'twitch', { id: 'Maple' }));
    service.observe(event('chat.message', 'twitch', { id: 'maple' }));
    service.observe(event('chat.message', 'twitch', { id: 'Fern' }));
    service.observe(event('chat.message', 'twitch', { id: 'helper', actorType: 'bot' }));
    service.observe(event('chat.message', 'tiktok', { id: 'Moss' }));
    service.observe(event('chat.message', 'kick', { id: 'Sim' }, true));
    for (const type of ['channel.follow', 'channel.follow', 'channel.subscription', 'channel.membership', 'channel.gift-subscription', 'engagement.cheer', 'engagement.gift', 'channel.raid', 'reward.redemption', 'command.received', 'addon.thsv.ad-break-companion.started', 'system.timed']) service.observe(event(type));
    service.observeProblem('warn', 'Kick chat reconnecting'); service.observeProblem('warn', 'Kick chat reconnecting'); service.observeProblem('error', 'OBS dropped frames');
    expect(service.status().current).toMatchObject({ platforms: { twitch: { messages: 3, chatters: 2 }, tiktok: { messages: 1, chatters: 1 } }, follows: 2, subscriptions: 2, giftedSubscriptions: 1, support: 2, raids: 1, redemptions: 1, commands: 1, adBreaks: 1, warnings: 2, errors: 1, problems: ['Kick chat reconnecting', 'OBS dropped frames'] });
    now += 2 * 60 * 60 * 1_000;
    service.observe(event('system.broadcast-stopped', 'system'));
    service.observeProblem('warn', 'After the stream');
    await service.flush();
    const status = service.status();
    expect(status.live).toBe(false);
    expect(status.recent[0]).toMatchObject({ startedAt: '2026-11-10T18:00:00.000Z', endedAt: '2026-11-10T20:00:00.000Z', warnings: 2, follows: 2 });
    const saved = await readFile(path, 'utf8');
    expect(saved).not.toMatch(/maple|fern|moss/iu);
    const restarted = new StreamSummaryService(path, () => now); await restarted.start();
    expect(restarted.status().recent).toHaveLength(1);
  });

  it('carries on counting a running stream after a restart and keeps the newest ten', async () => {
    root = await mkdtemp(join(tmpdir(), 'thsv-stream-summary-'));
    const path = join(root, 'stream-summaries.json');
    const first = new StreamSummaryService(path); await first.start();
    for (let index = 0; index < 11; index += 1) { first.observe(event('system.broadcast-started', 'system')); first.observe(event('system.broadcast-stopped', 'system')); }
    first.observe(event('system.broadcast-started', 'system')); first.observe(event('channel.follow')); await first.flush();
    const second = new StreamSummaryService(path); await second.start();
    expect(second.status().recent).toHaveLength(10);
    second.observe(event('channel.follow'));
    expect(second.status().current).toMatchObject({ follows: 2 });
  });
});
