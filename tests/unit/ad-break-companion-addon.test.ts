import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain-JS add-on entrypoint has no type declarations
import adBreakCompanion, { deriveAdView, sanitizeAdState } from '../../addons/ad-break-companion/dist/index.js';

interface AdState { readonly phase: string; readonly targetAt: number; readonly expiresAt: number; readonly maximumSeconds: number; readonly adLengthSeconds: number; readonly snoozesLeft: number; readonly updatedAt: number }
interface AdView { readonly state: AdState; readonly visible: boolean; readonly remainingSeconds: number; readonly nextDelayMs: number }
const sanitize = sanitizeAdState as (value: Partial<AdState>) => AdState;
const derive = deriveAdView as (state: AdState, settings: Readonly<Record<string, unknown>>, now: number) => AdView;

describe('Ad Break Companion timing', () => {
  it('stays hidden until the configured lead window, then counts down once per second', () => {
    const now = Date.parse('2026-08-04T12:00:00.000Z');
    const state = sanitize({ phase: 'scheduled', targetAt: now + 5 * 60_000, expiresAt: now + 315_000, maximumSeconds: 60, adLengthSeconds: 90, snoozesLeft: 3, updatedAt: now });
    expect(derive(state, { leadSeconds: 60 }, now)).toMatchObject({ visible: false, remainingSeconds: 300, nextDelayMs: 240_000 });
    expect(derive(state, { leadSeconds: 60 }, now + 240_000)).toMatchObject({ visible: true, remainingSeconds: 60, nextDelayMs: 1_000 });
  });

  it('waits briefly for Ad Run at zero and then fails closed when the signal never arrives', () => {
    const now = Date.parse('2026-08-04T12:00:00.000Z');
    const state = sanitize({ phase: 'scheduled', targetAt: now, expiresAt: now + 15_000, maximumSeconds: 60, adLengthSeconds: 90, snoozesLeft: 0, updatedAt: now });
    expect(derive(state, { leadSeconds: 60 }, now)).toMatchObject({ visible: true, remainingSeconds: 0, state: { phase: 'awaiting-start' } });
    expect(derive(state, { leadSeconds: 60 }, now + 16_000)).toMatchObject({ visible: false, state: { phase: 'idle' } });
  });

  it('uses the Ad Run duration as the active countdown and hides cleanly at zero', () => {
    const now = Date.parse('2026-08-04T12:00:00.000Z');
    const state = sanitize({ phase: 'active', targetAt: now + 90_000, expiresAt: now + 90_000, maximumSeconds: 90, adLengthSeconds: 90, snoozesLeft: 0, updatedAt: now });
    expect(derive(state, {}, now + 30_000)).toMatchObject({ visible: true, remainingSeconds: 60, nextDelayMs: 1_000 });
    expect(derive(state, {}, now + 90_000)).toMatchObject({ visible: false, remainingSeconds: 0, state: { phase: 'idle' } });
  });
});

describe('Ad Break Companion and the stream ending', () => {
  it('clears an active ad break when the stream ends, but not for a preview or another platform going offline', async () => {
    let stored: unknown = {};
    const publish = vi.fn(async () => undefined);
    const context = { settings: {}, state: { read: async () => stored, write: async (value: unknown) => { stored = value; } }, overlay: { publish }, schedule: { after: () => ({}), cancel: () => undefined } };
    const addOn = adBreakCompanion as unknown as { manifest: { eventSubscriptions: string[] }; start(context: unknown): Promise<void>; stop(context: unknown): Promise<void>; onEvent(event: unknown, context: unknown): Promise<void> };
    expect(addOn.manifest.eventSubscriptions).toEqual(expect.arrayContaining(['system.broadcast-stopped', 'stream.offline']));
    await addOn.start(context);
    const phase = (): string | undefined => (stored as { phase?: string }).phase;
    await addOn.onEvent({ eventType: 'addon.thsv.ad-break-companion.started', platform: 'twitch', receivedAt: new Date().toISOString(), payload: { adLength: 180 }, metadata: { simulated: false } }, context);
    expect(phase()).toBe('active');
    await addOn.onEvent({ eventType: 'stream.offline', platform: 'kick', payload: {}, metadata: { simulated: false } }, context);
    expect(phase()).toBe('active');
    await addOn.onEvent({ eventType: 'system.broadcast-stopped', platform: 'system', payload: {}, metadata: { simulated: true } }, context);
    expect(phase()).toBe('active');
    await addOn.onEvent({ eventType: 'system.broadcast-stopped', platform: 'system', payload: {}, metadata: { simulated: false } }, context);
    expect(phase()).toBe('idle');
    expect(publish).toHaveBeenLastCalledWith('thsv.ad-break-companion.timer.hide', { moduleId: 'thsv.ad-break-companion' });
    await addOn.onEvent({ eventType: 'addon.thsv.ad-break-companion.started', platform: 'twitch', receivedAt: new Date().toISOString(), payload: { adLength: 180 }, metadata: { simulated: false } }, context);
    await addOn.onEvent({ eventType: 'stream.offline', platform: 'twitch', payload: {}, metadata: { simulated: false } }, context);
    expect(phase()).toBe('idle');
    await addOn.stop(context);
  });
});
