import { describe, expect, it, vi } from 'vitest';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timedActionsSchema, type PlatformConfig } from '../../schemas/config.js';
import { projectMultiTimedAction } from '../../bridge/core/multi-timed-actions.js';
import { buildMultiTimedActionArguments } from '../../bridge/adapters/streamerbot-adapter.js';
import { TimedActionsAdapter } from '../../bridge/adapters/timed-actions-adapter.js';
import { silentLogger } from '../helpers.js';
import type { NormalizedEvent } from '../../schemas/event.js';

describe('five-platform timed rotations', () => {
  it('keeps Facebook text out of the four-platform Streamer.bot sender', async () => {
    const event = JSON.parse(await readFile('tests/fixtures/system-timed-message-output.json', 'utf8')) as NormalizedEvent;
    event.payload['selectionMode'] = 'platform-shuffle';
    event.payload['selectedMessages'] = { twitch: 'Prime reminder', facebook: 'Follow the Page' };
    event.payload['deliveryPlatforms'] = ['twitch', 'facebook'];
    const action = projectMultiTimedAction(event);
    if (!action) throw new Error('Missing timed action');
    const args = buildMultiTimedActionArguments(action);
    expect(JSON.parse(args['multiTimedSelectedMessages'] as string)).toEqual({ twitch: 'Prime reminder' });
    expect(JSON.parse(args['multiTimedDeliveryPlatforms'] as string)).toEqual(['twitch']);
    expect(action.selectedMessages['facebook']).toBe('Follow the Page');
  });

  // Each emit persists rotation state to disk, which can exceed vi.waitFor's 1 s default on a loaded CI runner.
  it('fires at 15 minutes and exhausts each platform list before repeating', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-02T16:00:00Z');
    const root = await mkdtemp(join(tmpdir(), 'five-platform-timer-'));
    const messagesByPlatform = Object.fromEntries(['twitch', 'youtube', 'kick', 'tiktok', 'facebook'].map(platform => [platform, Array.from({ length: 15 }, (_, index) => `${platform} message ${String(index)}`)]));
    const config = timedActionsSchema.parse({ stateFile: join(root, 'state.json'), definitions: [{
      id: 'rotation', name: 'Rotation', enabled: true, intervalMode: 'fixed', everyMinutes: 15,
      firstRunAfterMinutes: 15, missedRunPolicy: 'skip', selection: { mode: 'platform-shuffle', messagesByPlatform },
      gates: { requireLive: false },
    }] });
    const platform: PlatformConfig = { enabled: true, inputEnabled: true, outputEnabled: false, adapter: 'timed-actions', capabilities: ['timedActions'], reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 } };
    const events: NormalizedEvent[] = [];
    const adapter = new TimedActionsAdapter('timers', platform, config, () => 0.6);
    try {
      await adapter.start({ logger: silentLogger, emit: async event => { events.push(event as NormalizedEvent); return { accepted: true }; } });
      await adapter.control('start');
      await vi.advanceTimersByTimeAsync(899_999); expect(events).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1); await vi.waitFor(() => expect(events).toHaveLength(1), { timeout: 10_000 });
      expect(events[0]?.payload['scheduledAt']).toBe('2026-10-02T16:15:00.000Z');
      for (let index = 1; index < 30; index++) { await vi.advanceTimersByTimeAsync(900_000); await vi.waitFor(() => expect(events).toHaveLength(index + 1), { timeout: 10_000 }); }
      expect(events).toHaveLength(30);
      for (const key of Object.keys(messagesByPlatform)) {
        const texts = events.map(event => (event.payload['selectedMessages'] as Record<string, string>)[key]);
        expect(new Set(texts.slice(0, 15)).size).toBe(15);
        expect(new Set(texts.slice(15)).size).toBe(15);
        expect(texts[14]).not.toBe(texts[15]);
      }
    } finally { await adapter.control('stop'); await adapter.stop(); vi.useRealTimers(); await rm(root, { recursive: true, force: true }); }
  });
});
