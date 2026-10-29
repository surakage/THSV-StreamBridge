import { describe, expect, it, vi } from 'vitest';
import { StreamerBotPlatformWatch, type StreamerBotBroadcasterConnections } from '../../bridge/services/streamerbot-platform-watch.js';

function harness(enabled: readonly string[] = ['twitch', 'youtube', 'kick']) {
  let answer: StreamerBotBroadcasterConnections | undefined = { connected: ['twitch', 'youtube', 'kick'], disconnected: [] };
  let now = 1_000_000;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const watch = new StreamerBotPlatformWatch({ query: async () => answer, enabledPlatforms: () => enabled, logger, now: () => now });
  return { watch, logger, set: (value: StreamerBotBroadcasterConnections | undefined) => { answer = value; }, advance: (ms: number) => { now += ms; } };
}

describe('StreamerBotPlatformWatch', () => {
  it('raises one tray alert when Kick stays disconnected for two checks, and clears it when Kick returns', async () => {
    const h = harness();
    await h.watch.check();
    expect(h.watch.status()).toMatchObject({ signature: '', down: [] });
    h.set({ connected: ['twitch', 'youtube'], disconnected: ['kick'] });
    await h.watch.check();
    expect(h.watch.status()['signature']).toBe('');
    h.advance(60_000); await h.watch.check();
    const alert = h.watch.status();
    expect(alert).toMatchObject({ down: ['kick'], title: 'Kick disconnected in Streamer.bot' });
    expect(String(alert['text'])).toContain('Platforms > Kick > Accounts');
    expect(String(alert['signature'])).toMatch(/^kick:/u);
    expect(h.logger.warn).toHaveBeenCalledOnce();
    h.advance(60_000); await h.watch.check();
    expect(h.logger.warn).toHaveBeenCalledOnce();
    h.set({ connected: ['twitch', 'youtube', 'kick'], disconnected: [] });
    h.advance(60_000); await h.watch.check();
    expect(h.watch.status()).toMatchObject({ signature: '', down: [] });
    expect(h.logger.info).toHaveBeenCalledWith('Streamer.bot platform connection is back', expect.objectContaining({ platform: 'kick', downForSeconds: 120 }));
  });

  it('only watches platforms turned on in StreamBridge, and stays quiet while Streamer.bot itself is unreachable', async () => {
    const h = harness(['twitch']);
    h.set({ connected: ['twitch'], disconnected: ['kick', 'youtube'] });
    await h.watch.check(); await h.watch.check();
    expect(h.watch.status()).toMatchObject({ signature: '', watching: ['twitch'] });
    h.set(undefined);
    await h.watch.check(); await h.watch.check();
    expect(h.watch.status()['signature']).toBe('');
    expect(h.logger.warn).not.toHaveBeenCalled();
  });

  it('ignores a platform that is missing once while Streamer.bot is still connecting', async () => {
    const h = harness();
    h.set({ connected: ['twitch', 'youtube'], disconnected: ['kick'] });
    await h.watch.check();
    h.set({ connected: ['twitch', 'youtube', 'kick'], disconnected: [] });
    await h.watch.check();
    h.set({ connected: ['twitch', 'youtube'], disconnected: ['kick'] });
    await h.watch.check();
    expect(h.watch.status()['signature']).toBe('');
    expect(h.logger.warn).not.toHaveBeenCalled();
  });

  it('names every platform that is down in one alert', async () => {
    const h = harness();
    h.set({ connected: ['twitch'], disconnected: ['youtube', 'kick'] });
    await h.watch.check(); await h.watch.check();
    expect(h.watch.status()['title']).toBe('YouTube and Kick disconnected in Streamer.bot');
  });
});
