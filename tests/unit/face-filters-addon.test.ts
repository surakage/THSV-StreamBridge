import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import faceFilters, { ACTIVATE_ACTION_ID, DEACTIVATE_ACTION_ID, parseLens, settingsFor } from '../../addons/face-filters/dist/index.js';

function runtime(settings: Record<string, unknown> = {}) {
  const timers: Array<{ delay: number; callback: () => unknown }> = [];
  const context = {
    settings: { enabled: true, globalCooldownSeconds: 0, viewerCooldownSeconds: 0, gapSeconds: 0, ...settings },
    chat: { send: vi.fn(async () => []) },
    streamerbot: { runApprovedAction: vi.fn(async () => ({})) },
    schedule: { after: vi.fn((delay: number, callback: () => unknown) => { const timer = { delay, callback }; timers.push(timer); return timer; }), cancel: vi.fn() },
  };
  return { context, timers };
}

let sequence = 0;
function event(eventType: string, payload: Record<string, unknown> = {}, options: { platform?: string; roles?: string[]; user?: string } = {}) {
  sequence += 1;
  return {
    schemaVersion: '1.0.0', eventId: `event-${String(sequence)}`, eventType, platform: options.platform ?? 'twitch', receivedAt: new Date().toISOString(),
    source: { adapter: 'test', eventId: `source-${String(sequence)}` }, channel: { name: 'channel' },
    user: { id: options.user ?? 'viewer-1', name: 'viewer', displayName: 'Viewer One', actorType: 'human', roles: options.roles ?? [] },
    payload, metadata: { simulated: false },
  };
}
const live = (platform = 'twitch') => event('stream.online', {}, { platform });
const ACTION_ID = ACTIVATE_ACTION_ID as string;
const lensCall = (lensName: string, seconds: string): [string, Record<string, string>] => [ACTION_ID, { faceFilterLensName: lensName, faceFilterDuration: seconds }];
type Dispatch = { streamerbot: { runApprovedAction: { mock: { calls: unknown[][] } } } };
const callsTo = (context: Dispatch, actionId: string): number => context.streamerbot.runApprovedAction.mock.calls.filter((call) => call[0] === actionId).length;
const activations = (context: Dispatch): number => callsTo(context, ACTION_ID);
const deactivations = (context: Dispatch): number => callsTo(context, DEACTIVATE_ACTION_ID as string);
async function restart(test: ReturnType<typeof runtime>, goLive = true) {
  await faceFilters.stop(test.context); await faceFilters.start(test.context);
  if (goLive) await faceFilters.onEvent(live(), test.context);
}

describe('Face Filters extension', () => {
  it('ships four editable filler lenses and parses the one-line lens format', () => {
    const settings = settingsFor({ settings: {} });
    expect(settings.enabled).toBe(false);
    expect(settings.lenses.map((lens: { label: string }) => lens.label)).toEqual(['Banana', 'Sloth', 'Female', 'Mystery']);
    expect(parseLens('Big Banana | Banana Head 3D | !BigBanana | twitch-id-1, kick-id-2, twitch-id-1 | 45', 30)).toEqual({ label: 'Big Banana', lensName: 'Banana Head 3D', command: 'bigbanana', rewardIds: ['twitch-id-1', 'kick-id-2'], seconds: 45 });
    expect(parseLens('Clown', 30)).toEqual({ label: 'Clown', lensName: 'Clown', command: '', rewardIds: [], seconds: 30 });
    expect(parseLens('Long | Long | | | 9999', 30)?.seconds).toBe(600);
    expect(parseLens(' | ', 30)).toBeUndefined();
  });

  it('turns on a lens from its command, the main command, random, and a verified channel point reward', async () => {
    const test = runtime({ lenses: ['Banana | Banana Head | !banana | twitch-banana, kick-banana | 20', 'Sloth | Sloth Face | | | 30'], maximumQueue: 0 });
    await restart(test);
    await faceFilters.onEvent(event('command.received', { command: 'banana' }), test.context);
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(...lensCall('Banana Head', '20'));
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Viewer One put the Banana filter on for 20s!', sourcePlatform: 'twitch' }));
    await restart(test);
    await faceFilters.onEvent(event('command.received', { command: 'filter', arguments: ['sloth'] }), test.context);
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(...lensCall('Sloth Face', '30'));
    // A verified redemption counts as live even when StreamBridge started mid-stream.
    await restart(test, false);
    // Rewards match by stable ID only, never by a title that can be renamed.
    await faceFilters.onEvent(event('reward.redemption', { rewardTitle: 'Banana Head', rewardId: 'renamed-or-other', verifiedTransport: true }, { platform: 'kick' }), test.context);
    expect(activations(test.context)).toBe(2);
    await faceFilters.onEvent(event('reward.redemption', { rewardTitle: 'Anything', rewardId: 'kick-banana', verifiedTransport: true }, { platform: 'kick' }), test.context);
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(...lensCall('Banana Head', '20'));
    await restart(test);
    await faceFilters.onEvent(event('command.received', { command: 'filter', arguments: ['random'] }), test.context);
    expect(activations(test.context)).toBe(4);
  });

  it('lists lenses for an unknown name and ignores unverified rewards, simulations, and offline viewers', async () => {
    const test = runtime();
    await restart(test, false);
    await faceFilters.onEvent(event('command.received', { command: 'banana' }), test.context);
    await faceFilters.onEvent(event('reward.redemption', { rewardId: 'banana-id', verifiedTransport: false }), test.context);
    await faceFilters.onEvent({ ...live(), metadata: { simulated: true } }, test.context);
    await faceFilters.onEvent({ ...event('command.received', { command: 'banana' }), metadata: { simulated: true } }, test.context);
    expect(activations(test.context)).toBe(0);
    await faceFilters.onEvent(event('command.received', { command: 'filter', arguments: ['pizza'] }), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Face filters: !banana, !sloth, !female, !mystery. Use !filter <name> or random.' }));
    // Moderators and the broadcaster can test while offline.
    await faceFilters.onEvent(event('command.received', { command: 'sloth' }, { roles: ['moderator'] }), test.context);
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(...lensCall('Sloth', '30'));
  });

  it('plays one lens at a time, queues the rest in order, and drops the queue when every platform goes offline', async () => {
    const test = runtime({ maximumQueue: 1 });
    await restart(test);
    await faceFilters.onEvent(event('command.received', { command: 'banana' }, { user: 'a' }), test.context);
    await faceFilters.onEvent(event('command.received', { command: 'sloth' }, { user: 'b' }), test.context);
    await faceFilters.onEvent(event('command.received', { command: 'female' }, { user: 'c' }), test.context);
    expect(activations(test.context)).toBe(1);
    expect(test.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Viewer One, Sloth is queued (#1).' }));
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('cooling down') }));
    expect(test.timers.at(-1)?.delay).toBeGreaterThan(25_000);
    await test.timers.at(-1)?.callback();
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(...lensCall('Sloth', '30'));
    await faceFilters.onEvent(event('command.received', { command: 'mystery' }, { user: 'd' }), test.context);
    await faceFilters.onEvent(event('stream.offline'), test.context);
    await test.timers.at(-1)?.callback();
    expect(activations(test.context)).toBe(2);
  });

  it('enforces global and per-viewer cooldowns for commands but not for redemptions or moderators', async () => {
    const test = runtime({ globalCooldownSeconds: 60, viewerCooldownSeconds: 300, maximumQueue: 5 });
    await restart(test);
    await faceFilters.onEvent(event('command.received', { command: 'banana' }, { user: 'a' }), test.context);
    await faceFilters.onEvent(event('command.received', { command: 'sloth' }, { user: 'b' }), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringMatching(/cooling down\. Try again in (59|60)s\./u) }));
    const paid = runtime({ globalCooldownSeconds: 60, lenses: ['Banana | Banana | !banana | banana-id | 30'] });
    await restart(paid);
    await faceFilters.onEvent(event('command.received', { command: 'banana' }, { user: 'a' }), paid.context);
    await faceFilters.onEvent(event('reward.redemption', { rewardId: 'banana-id', verifiedTransport: true }, { user: 'b' }), paid.context);
    await faceFilters.onEvent(event('command.received', { command: 'banana' }, { user: 'm', roles: ['moderator'] }), paid.context);
    expect(paid.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Viewer One, Banana is queued (#2).' }));
  });

  it('does nothing while disabled and survives a Streamer.bot dispatch failure', async () => {
    const off = runtime({ enabled: false });
    await restart(off);
    await faceFilters.onEvent(event('command.received', { command: 'banana' }), off.context);
    expect(activations(off.context)).toBe(0);
    const failing = runtime();
    failing.context.streamerbot.runApprovedAction.mockRejectedValueOnce(new Error('not approved'));
    await restart(failing);
    await faceFilters.onEvent(event('command.received', { command: 'banana' }, { user: 'a' }), failing.context);
    // A lens Streamer.bot refused is never announced in chat.
    expect(failing.context.chat.send).not.toHaveBeenCalled();
    await faceFilters.onEvent(event('command.received', { command: 'sloth' }, { user: 'b' }), failing.context);
    expect(failing.context.chat.send).toHaveBeenCalledTimes(1);
    expect(failing.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(...lensCall('Sloth', '30'));
  });

  it('turns the lens off itself when its time is up, when the stream ends, and when stopped', async () => {
    // Streamfog ignores the Activate Lens duration, so StreamBridge runs Deactivate Lens.
    const test = runtime({ lenses: ['Banana | Banana | !banana | | 15'] });
    await restart(test);
    await faceFilters.onEvent(event('command.received', { command: 'banana' }, { user: 'a' }), test.context);
    const off = test.timers.at(-1);
    expect(off?.delay).toBe(15_000);
    const before = deactivations(test.context);
    await off?.callback();
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(DEACTIVATE_ACTION_ID, {});
    // A second firing finds the lens already off and sends nothing.
    await off?.callback();
    expect(deactivations(test.context)).toBe(before + 1);
    await faceFilters.onEvent(event('command.received', { command: 'banana' }, { user: 'b', roles: ['moderator'] }), test.context);
    await faceFilters.onEvent(event('stream.offline'), test.context);
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(DEACTIVATE_ACTION_ID, {});
    // The stale off-timer from before the stream ended does nothing.
    await test.timers.at(-1)?.callback();
    expect(deactivations(test.context)).toBe(before + 2);
    await faceFilters.onEvent(live(), test.context);
    await faceFilters.onEvent(event('command.received', { command: 'banana' }, { user: 'c', roles: ['moderator'] }), test.context);
    await faceFilters.stop(test.context);
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenLastCalledWith(DEACTIVATE_ACTION_ID, {});
    expect(deactivations(test.context)).toBe(before + 3);
    expect(activations(test.context)).toBe(3);
  });
});
