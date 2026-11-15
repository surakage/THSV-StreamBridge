import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import snap, { blockedReason, cleanCaption, manifest, resetForTests, settingsFor, stateFor } from '../../addons/snap/dist/index.js';
import { addOnOverlayPreviewTopic, buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';
import { isProModule } from '../../bridge/services/licence-plan.js';

function runtime(settings: Record<string, unknown> = {}, saved: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = saved;
  const context = {
    settings: { enabled: true, captureSource: 'Camera', rewardTitles: ['Snap'], alerts: ['raid'], cooldownSeconds: 0, viewerCooldownSeconds: 0, holdSeconds: 3, ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    chat: { send: vi.fn(async () => []) },
    overlay: { publish: vi.fn<(topic: string, payload: unknown) => Promise<undefined>>(async () => undefined) },
    snapshot: { capture: vi.fn(async () => ({ photoId: 'a'.repeat(32), photoUrl: `/overlay/snap/photo/${'a'.repeat(32)}.png`, token: 'b'.repeat(32) })) },
    viewerFoundation: { mutate: vi.fn(async () => ({})) },
    streamerbot: { administerReward: vi.fn(async () => undefined) },
    scenes: { resolve: (value: string) => value },
  };
  return { context, state: () => state as { total: number; paused: boolean; recent: Array<{ name: string; caption: string; ok: boolean; trigger: string }> } };
}

let sequence = 0;
function event(eventType: string, platform: string, user: string, payload: Record<string, unknown> = {}, roles: string[] = []) {
  sequence += 1;
  return { eventId: `event-${String(sequence)}`, eventType, platform, user: { id: `${user.toLowerCase()}-id`, name: user.toLowerCase(), displayName: user, roles, actorType: 'human' }, payload, metadata: { simulated: false } };
}
const reward = (user: string, input = '', extra: Record<string, unknown> = {}) => event('reward.redemption', 'twitch', user, { rewardTitle: 'Snap', rewardId: 'reward-1', redemptionId: `redeem-${user}`, input, ...extra });
const topics = (test: ReturnType<typeof runtime>) => test.context.overlay.publish.mock.calls.map((call: unknown[]) => call[0]);

describe('Snap extension', () => {
  beforeEach(() => { vi.useFakeTimers(); resetForTests(); });
  afterEach(async () => { vi.useRealTimers(); await snap.stop(); });

  it('cleans captions: links removed, length capped and blocked words hide the caption', () => {
    const settings = settingsFor({ settings: { captionLength: 20, blockedWords: ['Badword'] } });
    expect(cleanCaption('look at https://evil.example/x this', settings)).toBe('look at this');
    expect(cleanCaption('visit mysite.com now', settings)).toBe('visit now');
    expect(cleanCaption('a'.repeat(50), settings)).toHaveLength(20);
    expect(cleanCaption('you are a BADWORD', settings)).toBe('');
  });

  it('takes a snap for a reward: camera first, then the photo with the viewer message as caption', async () => {
    const test = runtime();
    await snap.onEvent(reward('Ana', 'hello village'), test.context);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(test.context.snapshot.capture).toHaveBeenCalledWith(expect.objectContaining({ target: 'source', sourceName: 'Camera', fileName: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2} - Ana$/u) }));
    expect(topics(test)).toEqual(['thsv.snap.snap.start', 'thsv.snap.snap.photo']);
    expect(test.context.overlay.publish.mock.calls[1]?.[1]).toMatchObject({ caption: 'hello village', name: 'Ana', token: 'b'.repeat(32), frame: 'village' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(test.state()).toMatchObject({ total: 1, recent: [{ name: 'Ana', caption: 'hello village', ok: true }] });
  });

  it('ignores rewards with another title and simulated events', async () => {
    const test = runtime();
    await snap.onEvent(event('reward.redemption', 'twitch', 'Bo', { rewardTitle: 'Hydrate' }), test.context);
    await snap.onEvent({ ...reward('Bo'), metadata: { simulated: true } }, test.context);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(test.context.overlay.publish).not.toHaveBeenCalled();
  });

  it('snaps a raid with its own caption and skips raids below the minimum', async () => {
    const test = runtime({ minimumRaid: 5 });
    await snap.onEvent(event('channel.raid', 'twitch', 'Cleo', { quantity: 3 }), test.context);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(test.context.overlay.publish).not.toHaveBeenCalled();
    await snap.onEvent(event('channel.raid', 'twitch', 'Cleo', { quantity: 42 }), test.context);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(test.context.overlay.publish.mock.calls[1]?.[1]).toMatchObject({ caption: 'Raided by Cleo with 42 viewers!' });
  });

  it('gives the reward back and tells the viewer when they are on cooldown', async () => {
    const test = runtime({ viewerCooldownSeconds: 300 });
    await snap.onEvent(reward('Dee', 'one'), test.context);
    await vi.advanceTimersByTimeAsync(20_000);
    await snap.onEvent(reward('Dee', 'two'), test.context);
    expect(test.context.streamerbot.administerReward).toHaveBeenCalledWith({ platform: 'twitch', operation: 'cancel', rewardId: 'reward-1', redemptionId: 'redeem-Dee' });
    expect(test.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Dee, the camera needs'), selectedPlatforms: ['twitch'] }));
  });

  it('gives Viewer Points back when a snap fails, and lets the camera leave', async () => {
    const test = runtime();
    test.context.snapshot.capture.mockRejectedValueOnce(new Error('OBS is not connected'));
    await snap.onEvent(reward('Eli', 'hi', { pointsReward: true, pointsViewerId: 'viewer-1', pointsCost: 500 }), test.context);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(topics(test)).toEqual(['thsv.snap.snap.start', 'thsv.snap.snap.cancel']);
    expect(test.context.viewerFoundation.mutate).toHaveBeenCalledWith(expect.objectContaining({ viewerId: 'viewer-1', operation: 'refund', amount: 500 }));
    expect(test.state().recent[0]).toMatchObject({ ok: false });
  });

  it('puts the camera away on chosen scenes and while paused', async () => {
    const test = runtime({ skipScenes: ['BRB'] });
    await snap.onEvent(event('stream.scene-changed', 'system', 'OBS', { sceneName: 'BRB' }), test.context);
    await snap.onEvent(reward('Fay'), test.context);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(test.context.overlay.publish).not.toHaveBeenCalled();
    expect(test.context.streamerbot.administerReward).toHaveBeenCalledTimes(1);
    expect(blockedReason(settingsFor(test.context), stateFor({ paused: true }), { manual: true })).toBe('paused');
  });

  it('lets moderators snap from chat with a caption and pause the camera', async () => {
    const test = runtime();
    await snap.onEvent(event('command.received', 'youtube', 'Viewer', { command: 'snap', arguments: ['hi'] }), test.context);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(test.context.overlay.publish).not.toHaveBeenCalled();
    await snap.onEvent(event('command.received', 'youtube', 'Mod', { command: 'snap', arguments: ['best', 'moment'] }, ['moderator']), test.context);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(test.context.overlay.publish.mock.calls[1]?.[1]).toMatchObject({ caption: 'best moment' });
    await vi.advanceTimersByTimeAsync(20_000);
    await snap.onEvent(event('command.received', 'youtube', 'Mod', { command: 'snap', arguments: ['pause'] }, ['moderator']), test.context);
    expect(test.state().paused).toBe(true);
  });

  it('plays one snap at a time and queues the rest', async () => {
    const test = runtime();
    await snap.onEvent(reward('Gus', 'one'), test.context);
    await snap.onEvent(reward('Hal', 'two'), test.context);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(test.context.snapshot.capture).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(test.context.snapshot.capture).toHaveBeenCalledTimes(2);
  });

  it('runs the Control Panel snap and pause buttons', async () => {
    const test = runtime();
    const panel = await snap.controlPanel({ operation: 'action', action: 'snap', values: { caption: 'from the panel' } }, test.context);
    expect(panel.message).toBe('Snap!');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(test.context.overlay.publish.mock.calls[1]?.[1]).toMatchObject({ caption: 'from the panel', name: 'The streamer' });
    const paused = await snap.controlPanel({ operation: 'action', action: 'pause' }, test.context);
    expect(paused.summary[0]).toEqual({ label: 'Camera', value: 'Paused' });
  });

  it('ships a matching Pro package, schema defaults and a wizard preview', async () => {
    const descriptor = JSON.parse(await readFile('addons/snap/module-package.json', 'utf8')) as { permissions: string[]; manifest: { eventSubscriptions: string[]; commandsProvided: unknown[]; dependencies: string[] } };
    expect([...descriptor.manifest.eventSubscriptions].sort()).toEqual([...manifest.eventSubscriptions].sort());
    expect(descriptor.manifest.commandsProvided).toEqual(manifest.commandsProvided);
    expect(descriptor.permissions).toEqual(expect.arrayContaining(['media.snapshot', 'overlay.publish', 'viewer.foundation.mutate', 'rewards.administer']));
    const schema = JSON.parse(await readFile('addons/snap/schemas/config.json', 'utf8')) as { properties: Record<string, { default?: unknown }> };
    expect(schema.properties['enabled']?.default).toBe(false);
    const ui = JSON.parse(await readFile('addons/snap/ui/settings.json', 'utf8')) as { order: string[]; sections: Array<{ fields: string[] }> };
    expect([...ui.order].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(ui.sections.flatMap((section) => section.fields).sort()).toEqual(Object.keys(schema.properties).sort());
    expect(isProModule('thsv.snap')).toBe(true);
    expect(addOnOverlayPreviewTopic('thsv.snap')).toBe('thsv.snap.snap.photo');
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.snap', name: 'Snap', settings: { frame: 'paper' } })).toMatchObject({ frame: 'paper', templatePreview: true, caption: 'Hello from the village!' });
  });
});
