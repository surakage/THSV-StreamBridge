import { describe, expect, it, vi } from 'vitest';
import { OverlayTestSequence, OverlayTestSequenceError, type OverlayTestSequenceDependencies } from '../../bridge/services/overlay-test-sequence.js';
import { addOnOverlayPreviewTopic, buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function harness(options: { live?: boolean } = {}) {
  const timers: Array<{ at: number; callback: () => void; cancelled: boolean }> = [];
  let clock = 1_800_000_000_000; let live = options.live ?? false;
  const calls: string[] = [];
  const hub = {
    publishPreview: vi.fn((event: NormalizedEvent, _config: unknown, template = false) => { calls.push(`preview:${event.eventType}:${event.platform}:${String(template)}`); return 1; }),
    publishAddOn: vi.fn((moduleId: string, topic: string) => { calls.push(`addon:${topic}`); return Promise.resolve(); }),
    publishEmoteWallTrigger: vi.fn((trigger: { test?: string }) => { calls.push(`emote:${trigger.test ?? ''}`); }),
    clearAlertPreview: vi.fn(() => { calls.push('clear-alert'); }),
    clearChatPreviews: vi.fn(() => { calls.push('clear-chat'); }),
    clientConfig: vi.fn(() => ({ alertDurationMs: 7_000 })),
  };
  const event = (eventType: string, platform: string) => ({ eventType, platform } as unknown as NormalizedEvent);
  const dependencies = {
    hub: hub as unknown as OverlayTestSequenceDependencies['hub'],
    overlayAddOns: () => Promise.resolve([
      { moduleId: 'thsv.local-clock', name: 'Local Clock', settings: {} },
      { moduleId: 'thsv.random-clip-player', name: 'Random Clip Player', settings: {} },
    ]),
    communityName: () => Promise.resolve('Village'),
    isLive: () => live,
    buildAlert: (platform: string, alertType: string) => (platform === 'twitch' && alertType === 'follow' ? event('channel.follow', platform) : undefined),
    alertTypes: () => [['twitch', 'follow']] as const,
    buildChat: (platform: string) => event('chat.message', platform),
    buildAddOnPreview: buildAddOnOverlayPreview,
    addOnPreviewTopic: addOnOverlayPreviewTopic,
    captions: { preview: vi.fn(() => { calls.push('captions'); return {}; }), clear: vi.fn() },
    now: () => clock,
    setTimer: (callback: () => void, delayMs: number) => { const timer = { at: clock + delayMs, callback, cancelled: false }; timers.push(timer); return () => { timer.cancelled = true; }; },
  } satisfies OverlayTestSequenceDependencies;
  const advance = async (ms: number) => {
    const until = clock + ms;
    for (;;) {
      const next = timers.filter((timer) => !timer.cancelled && timer.at <= until).sort((a, b) => a.at - b.at)[0];
      if (next === undefined) break;
      next.cancelled = true; clock = next.at; next.callback();
      await new Promise((resolve) => { setImmediate(resolve); });
    }
    clock = until;
  };
  return { sequence: new OverlayTestSequence(dependencies), calls, hub, advance, goLive: () => { live = true; } };
}

describe('overlay test sequence', () => {
  it('fires each step a fixed gap apart, hides template previews, and records times', async () => {
    const { sequence, calls, advance } = harness();
    const run = await sequence.start({ steps: ['alert:twitch:follow', 'addon:thsv.local-clock', 'emote-wall:fireworks', 'chat', 'captions'], gapMs: 6_000, label: 'Gameplay' });
    expect(run).toMatchObject({ label: 'Gameplay', gapMs: 6_000, holdMs: 5_000, state: 'running' });
    expect(run.steps.map((step) => step.page)).toEqual(['/overlay/alerts', '/overlay/addons/thsv.local-clock', '/overlay/emote-wall', '/overlay/chat', '/overlay/captions']);
    expect(run.steps[0]?.sound).toBe(true);
    await advance(0);
    expect(calls).toEqual(['preview:channel.follow:twitch:false']);
    await advance(6_000);
    expect(calls.at(-1)).toBe('addon:thsv.local-clock.clock.update');
    await advance(5_000);
    expect(calls.at(-1)).toBe('addon:thsv.local-clock.preview.hide');
    await advance(30_000);
    expect(calls).toContain('emote:fireworks');
    expect(calls).toContain('captions');
    expect(calls.filter((call) => call === 'preview:chat.message:twitch:true')).toHaveLength(1);
    const status = sequence.status() as { running: boolean; run: { state: string; steps: Array<{ ok?: boolean; firedAt?: string }> } };
    expect(status.running).toBe(false);
    expect(status.run.state).toBe('finished');
    expect(status.run.steps.every((step) => step.ok === true && typeof step.firedAt === 'string')).toBe(true);
  });

  it('stops a clip placeholder as well as hiding it', async () => {
    const { sequence, calls, advance } = harness();
    await sequence.start({ steps: ['addon:thsv.random-clip-player'], gapMs: 4_000 });
    await advance(4_000);
    expect(calls).toEqual(['addon:thsv.random-clip-player.media.play', 'addon:thsv.random-clip-player.media.stop', 'addon:thsv.random-clip-player.preview.hide']);
  });

  it('refuses while live, unknown steps, a second run, and stops early when a platform goes live', async () => {
    await expect(harness({ live: true }).sequence.start({ steps: ['chat'] })).rejects.toMatchObject({ statusCode: 409 });
    const { sequence, calls, advance, goLive } = harness();
    await expect(sequence.start({ steps: ['alert:twitch:raid-everyone'] })).rejects.toBeInstanceOf(OverlayTestSequenceError);
    await expect(sequence.start({ steps: ['addon:thsv.not-installed'] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(sequence.start({ steps: [] })).rejects.toMatchObject({ statusCode: 400 });
    await sequence.start({ steps: ['chat', 'alert:twitch:follow'], gapMs: 3_000 });
    await expect(sequence.start({ steps: ['chat'] })).rejects.toMatchObject({ statusCode: 409 });
    await advance(0);
    goLive();
    await advance(10_000);
    expect(calls).not.toContain('preview:channel.follow:twitch:false');
    expect(calls).toContain('clear-chat');
    expect((sequence.status() as { run: { state: string } }).run.state).toBe('stopped');
  });

  it('lists what can be fired, with pages and sound', async () => {
    const catalog = await harness().sequence.catalog() as { steps: Array<{ step: string; page: string; sound: boolean }>; alertDurationMs: number };
    expect(catalog.alertDurationMs).toBe(7_000);
    expect(catalog.steps).toContainEqual(expect.objectContaining({ step: 'alert:twitch:follow', sound: true }));
    expect(catalog.steps).toContainEqual(expect.objectContaining({ step: 'addon:thsv.random-clip-player', page: '/overlay/clips' }));
  });

  it('bounds the gap', async () => {
    const { sequence } = harness();
    expect((await sequence.start({ steps: ['chat'], gapMs: 10 })).gapMs).toBe(2_000);
  });
});
