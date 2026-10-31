import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { StreamerBotEventRelay } from '../../bridge/adapters/streamerbot-event-relay.js';
import type { BrowserOverlayHub } from '../../bridge/services/browser-overlay-hub.js';
import { parseViewerCount, ViewerCountService } from '../../bridge/services/viewer-count-service.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { silentLogger } from '../helpers.js';

const message = (source: string, type: string, data: unknown) => ({ timeStamp: '2026-10-30T20:00:00Z', event: { source, type }, data });

describe('viewer count parsing', () => {
  it('reads Twitch, Kick and YouTube counts from their Streamer.bot events', () => {
    expect(parseViewerCount(message('Twitch', 'ViewerCountUpdate', { viewerCount: 42 }))).toEqual({ platform: 'twitch', viewers: 42 });
    expect(parseViewerCount(message('Kick', 'ViewerCountUpdate', { viewers: '7' }))).toEqual({ platform: 'kick', viewers: 7 });
    expect(parseViewerCount(message('YouTube', 'StatisticsUpdated', { statistics: { concurrentViewers: '15', viewCount: 900, likeCount: 30 } }))).toEqual({ platform: 'youtube', viewers: 15 });
  });

  it('ignores other events, total view counts and bad numbers', () => {
    expect(parseViewerCount(message('Twitch', 'ChatMessage', { viewerCount: 42 }))).toBeUndefined();
    expect(parseViewerCount(message('YouTube', 'StatisticsUpdated', { viewCount: 900, likeCount: 30 }))).toBeUndefined();
    expect(parseViewerCount(message('Twitch', 'ViewerCountUpdate', { viewerCount: -3 }))).toBeUndefined();
    expect(parseViewerCount(message('Twitch', 'ViewerCountUpdate', { viewerCount: 1.5 }))).toBeUndefined();
    expect(parseViewerCount({ type: 'thsv.platform' })).toBeUndefined();
  });
});

describe('viewer count service', () => {
  const setup = () => {
    let now = Date.parse('2026-10-30T20:00:00Z');
    const publishViewerCounts = vi.fn();
    const relay = new StreamerBotEventRelay();
    const service = new ViewerCountService({ publishViewerCounts } as unknown as BrowserOverlayHub, relay, silentLogger, () => now);
    service.start();
    return { relay, service, publishViewerCounts, advance: (ms: number) => { now += ms; } };
  };

  it('keeps the latest count per platform and only publishes changes', () => {
    const { relay, service, publishViewerCounts } = setup();
    relay.publish(message('Twitch', 'ViewerCountUpdate', { viewerCount: 40 }));
    relay.publish(message('Twitch', 'ViewerCountUpdate', { viewerCount: 40 }));
    relay.publish(message('Kick', 'ViewerCountUpdate', { viewerCount: 5 }));
    expect(publishViewerCounts).toHaveBeenCalledTimes(2);
    expect(publishViewerCounts).toHaveBeenLastCalledWith({ total: 45, platforms: { twitch: 40, kick: 5 } });
    expect(service.status()).toMatchObject({ listening: true, received: 3, total: 45 });
    service.stop();
  });

  it('drops a platform when its stream goes offline, but not for simulated events', () => {
    const { relay, service, publishViewerCounts } = setup();
    relay.publish(message('Twitch', 'ViewerCountUpdate', { viewerCount: 40 }));
    relay.publish(message('YouTube', 'StatisticsUpdated', { concurrentViewers: 10 }));
    const offline = (simulated: boolean) => ({ eventType: 'stream.offline', platform: 'twitch', metadata: { simulated } }) as unknown as NormalizedEvent;
    service.observeBridgeEvent(offline(true));
    expect(service.snapshot().total).toBe(50);
    service.observeBridgeEvent(offline(false));
    expect(publishViewerCounts).toHaveBeenLastCalledWith({ total: 10, platforms: { youtube: 10 } });
    service.stop();
  });

  it('forgets counts that stop updating', () => {
    vi.useFakeTimers();
    try {
      const { relay, service, publishViewerCounts, advance } = setup();
      relay.publish(message('Kick', 'ViewerCountUpdate', { viewerCount: 3 }));
      advance(21 * 60_000);
      vi.advanceTimersByTime(60_000);
      expect(publishViewerCounts).toHaveBeenLastCalledWith({ total: 0, platforms: {} });
      service.stop();
    } finally { vi.useRealTimers(); }
  });
});

describe('viewer counter overlay', () => {
  interface Options { mode: string; platforms: string[]; showZero: boolean; size: number; label: string }
  interface Counter { parseOptions(search: string): Options; view(counts: Record<string, number>, options: Options): { platforms: string[]; viewers: number }[]; format(value: number): string }
  const load = async (): Promise<Counter> => {
    const module = { exports: {} as Counter };
    runInNewContext(await readFile('overlays/browser/viewers.js', 'utf8'), { module, URLSearchParams });
    return module.exports;
  };

  it('shows one chip per live platform, or one total', async () => {
    const counter = await load();
    const counts = { twitch: 120, youtube: 0, kick: 8 };
    expect(counter.view(counts, counter.parseOptions(''))).toEqual([{ platforms: ['twitch'], viewers: 120 }, { platforms: ['kick'], viewers: 8 }]);
    expect(counter.view(counts, counter.parseOptions('?showZero=1&platforms=youtube'))).toEqual([{ platforms: ['youtube'], viewers: 0 }]);
    expect(counter.view(counts, counter.parseOptions('?mode=total'))).toEqual([{ platforms: ['twitch', 'kick'], viewers: 128 }]);
    expect(counter.view({}, counter.parseOptions('?mode=total'))).toEqual([]);
  });

  it('clamps settings and shortens big numbers', async () => {
    const counter = await load();
    expect(counter.parseOptions('?size=999&mode=bogus&label=' + 'x'.repeat(40))).toMatchObject({ size: 160, mode: 'split', label: 'x'.repeat(24) });
    expect([counter.format(950), counter.format(1234), counter.format(12_345), counter.format(250_000)]).toEqual(['950', '1,234', '12.3K', '250K']);
  });
});
