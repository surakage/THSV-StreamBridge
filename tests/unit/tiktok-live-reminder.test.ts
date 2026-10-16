import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import { TikTokLiveReminder, type TikTokLiveStudioSetting } from '../../bridge/services/tiktok-live-reminder.js';

const LAUNCHER = 'C:\\Program Files\\TikTok LIVE Studio\\TikTok LIVE Studio Launcher.exe';

function harness(studio: TikTokLiveStudioSetting | null = { enabled: true, executable: LAUNCHER }) {
  let now = Date.parse('2026-10-16T01:00:00.000Z');
  const reminder = new TikTokLiveReminder({ studio: async () => studio ?? undefined, now: () => now });
  const tiktok = (simulated = false) => ({ platform: 'tiktok', metadata: { simulated } }) as unknown as NormalizedEvent;
  return { reminder, tiktok, advance: (ms: number) => { now += ms; }, status: () => reminder.status() as { signature: string; kind?: string; title?: string; launchPath?: string } };
}

describe('TikTokLiveReminder', () => {
  it('reminds the creator to Go LIVE when OBS starts streaming and to End LIVE when it stops', async () => {
    const h = harness();
    expect(h.status().signature).toBe('');
    await h.reminder.broadcastStarted();
    expect(h.status()).toMatchObject({ kind: 'start', title: 'Go LIVE on TikTok', launchPath: LAUNCHER });
    const started = h.status().signature;
    h.advance(3 * 60 * 60_000);
    await h.reminder.broadcastStopped();
    expect(h.status()).toMatchObject({ kind: 'end', title: 'End your TikTok LIVE', launchPath: LAUNCHER });
    expect(h.status().signature).not.toBe(started);
  });

  it('skips the Go LIVE reminder when TikTok activity shows the LIVE is already running', async () => {
    const h = harness();
    h.reminder.observe(h.tiktok());
    h.advance(60_000);
    await h.reminder.broadcastStarted();
    expect(h.status().signature).toBe('');
    // Old activity from an earlier stream does not count, and simulated events never do.
    h.advance(10 * 60_000);
    h.reminder.observe(h.tiktok(true));
    await h.reminder.broadcastStarted();
    expect(h.status().kind).toBe('start');
  });

  it('stays silent when TikTok LIVE Studio is not enabled in the launcher', async () => {
    for (const studio of [null, { enabled: false, executable: LAUNCHER }]) {
      const h = harness(studio);
      await h.reminder.broadcastStarted();
      await h.reminder.broadcastStopped();
      expect(h.status().signature).toBe('');
    }
  });

  it('never throws when the launcher status cannot be read', async () => {
    const reminder = new TikTokLiveReminder({ studio: async () => { throw new Error('probe failed'); } });
    await expect(reminder.broadcastStarted()).resolves.toBeUndefined();
    expect(reminder.status()).toEqual({ signature: '' });
  });
});
