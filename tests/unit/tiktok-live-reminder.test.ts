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

  it('names the streaming app that actually started or stopped, never assuming OBS', async () => {
    let app = 'SprigCast';
    const reminder = new TikTokLiveReminder({ studio: async () => ({ enabled: true, executable: LAUNCHER }), appName: () => app });
    await reminder.broadcastStopped();
    expect(reminder.status()['text']).toBe('SprigCast stopped streaming. Click End LIVE in TikTok LIVE Studio so your TikTok LIVE ends too. Click here to open it.');
    app = 'OBS';
    await reminder.broadcastStarted();
    expect(reminder.status()['text']).toBe("OBS is streaming, but TikTok isn't live yet. Click Go LIVE in TikTok LIVE Studio. Click here to open it.");
    const unnamed = new TikTokLiveReminder({ studio: async () => ({ enabled: true }) });
    await unnamed.broadcastStopped();
    expect(String(unnamed.status()['text'])).toMatch(/^Your streaming app stopped streaming\./u);
  });

  it('stays quiet when TikTok LIVE Studio is closed or has nothing to end (a Twitch-only or test stream)', async () => {
    let state: 'closed' | 'not-live' | 'live' | 'paused' | 'unknown' = 'closed';
    const reminder = new TikTokLiveReminder({ studio: async () => ({ enabled: true, executable: LAUNCHER }), studioState: async () => state });
    await reminder.broadcastStarted();
    await reminder.broadcastStopped();
    expect(reminder.status()['signature']).toBe('');
    state = 'not-live';
    await reminder.broadcastStopped();
    expect(reminder.status()['signature']).toBe('');
    // Open but not live when the stream starts: remind to Go LIVE.
    await reminder.broadcastStarted();
    expect(reminder.status()).toMatchObject({ kind: 'start' });
    // Live when the stream stops: remind to End LIVE.
    state = 'live';
    await reminder.broadcastStopped();
    expect(reminder.status()).toMatchObject({ kind: 'end' });
    // Can't ask LIVE Studio: remind as before rather than miss a running LIVE.
    const unknown = new TikTokLiveReminder({ studio: async () => ({ enabled: true }), studioState: async () => { throw new Error('no answer'); } });
    await unknown.broadcastStopped();
    expect(unknown.status()).toMatchObject({ kind: 'end' });
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
