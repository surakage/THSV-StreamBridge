import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import { alertPresentationSchema, type BrowserOverlayConfig } from '../../schemas/config.js';
import { matchAlertVariant, projectBrowserOverlayEvent, type BrowserOverlayEvent, type OverlayAlertDisplay } from '../../bridge/core/browser-overlay.js';
import { readMediaDurationMs } from '../../bridge/core/media-duration.js';
import { AlertPresentationController } from '../../overlays/browser/alert-queue.js';
import { testConfig } from '../helpers.js';

const VIDEO = `/overlay/assets/${'a'.repeat(64)}.mp4`;
const PICTURE = `/overlay/assets/${'b'.repeat(64)}.png`;
const SOUND = `/overlay/assets/${'c'.repeat(64)}.mp3`;

function cheer(bits: number, sequence = 1): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `cheer-${String(sequence)}`, eventType: 'engagement.cheer', platform: 'twitch', occurredAt: '2026-11-21T01:00:00.000Z', receivedAt: '2026-11-21T01:00:00.000Z',
    source: { adapter: 'test', sourceEventName: 'Cheer', sourceEventId: `cheer-${String(sequence)}` },
    channel: { name: 'village' }, user: { name: 'night_owl', displayName: 'Night_Owl', actorType: 'human', roles: [] },
    payload: { quantity: bits, message: 'nice' }, metadata: { simulated: false, bridgeSequence: sequence },
  } as unknown as NormalizedEvent;
}

function displayOf(event: BrowserOverlayEvent | undefined): OverlayAlertDisplay {
  if (event?.kind !== 'alert.show') throw new Error('Expected an alert.');
  return event.payload.display;
}

function variant(overrides: Record<string, unknown>): Record<string, unknown> {
  return { id: 'nice', name: 'Nice', match: 'exact', amount: 69, videoUrl: VIDEO, mediaDurationMs: 24_600, ...overrides };
}

async function configWith(variants: readonly Record<string, unknown>[]): Promise<BrowserOverlayConfig> {
  const base = (await testConfig()).browserOverlay;
  return { ...base, alerts: alertPresentationSchema.parse({ profiles: { twitch: { cheer: { variants, aggregation: { mode: 'sum-quantity', windowMs: 5_000 } } } } }) };
}

describe('variant alerts', () => {
  it('ships empty: a profile without variants keeps the normal card', async () => {
    expect((await testConfig()).browserOverlay.alerts.profiles).toEqual({});
    const config = await configWith([]);
    const shown = displayOf(projectBrowserOverlayEvent(cheer(69), config));
    expect(shown.variant).toBeUndefined();
  });

  it('plays the video for an exact 69-bit cheer for the video length plus a 2-second fade', async () => {
    const config = await configWith([variant({})]);
    const shown = displayOf(projectBrowserOverlayEvent(cheer(69), config));
    expect(shown).toMatchObject({ title: 'Night_owl · cheer', viewerMessage: 'nice', durationMs: 26_600, variant: { id: 'nice', videoUrl: VIDEO, mediaDurationMs: 24_600, fadeOutMs: 2_000, volume: 1 } });
    // A variant is for this one cheer, so it is never held back to be combined with other cheers.
    expect(shown.aggregation).toBeUndefined();
    const other = displayOf(projectBrowserOverlayEvent(cheer(70, 2), config));
    expect(other.variant).toBeUndefined();
    expect(other.aggregation).toBeDefined();
  });

  it('uses the variant title and text, and can hide the viewer message', async () => {
    const config = await configWith([variant({ titleTemplate: '{actor} cheered {quantity} bits!', messageTemplate: 'Nice.', showViewerMessage: false })]);
    const shown = displayOf(projectBrowserOverlayEvent(cheer(69), config));
    expect(shown).toMatchObject({ title: 'Night_owl cheered 69 bits!', thankYou: 'Nice.' });
    expect(shown.viewerMessage).toBeUndefined();
  });

  it('prefers an exact amount, then the narrowest range, then the highest "or more"', () => {
    const parsed = alertPresentationSchema.parse({ profiles: { twitch: { cheer: { variants: [
      variant({ id: 'fifty-plus', match: 'at-least', amount: 50 }),
      variant({ id: 'hundred-plus', match: 'at-least', amount: 100 }),
      variant({ id: 'wide', match: 'between', amount: 1, maxAmount: 1_000 }),
      variant({ id: 'narrow', match: 'between', amount: 60, maxAmount: 80 }),
      variant({ id: 'exact', match: 'exact', amount: 69 }),
      variant({ id: 'off', match: 'exact', amount: 70, enabled: false }),
    ] } } } });
    const variants = parsed.profiles.twitch?.cheer?.variants;
    expect(matchAlertVariant(variants, 69)?.id).toBe('exact');
    expect(matchAlertVariant(variants, 70)?.id).toBe('narrow');
    expect(matchAlertVariant(variants, 90)?.id).toBe('wide');
    expect(matchAlertVariant(variants, 5_000)?.id).toBe('hundred-plus');
    expect(matchAlertVariant(variants, undefined)).toBeUndefined();
  });

  it('uses a fixed length when set, and the normal length when the video length is unknown', async () => {
    const fixed = displayOf(projectBrowserOverlayEvent(cheer(69), await configWith([variant({ durationMs: 5_000 })])));
    expect(fixed.durationMs).toBe(5_000);
    expect(fixed.variant?.fixedDurationMs).toBe(5_000);
    const unknown = displayOf(projectBrowserOverlayEvent(cheer(69), await configWith([variant({ mediaDurationMs: undefined })])));
    expect(unknown.durationMs).toBe(7_000);
  });

  it('matches tips on their money amount and picture variants with their own sound', async () => {
    const base = (await testConfig()).browserOverlay;
    const config: BrowserOverlayConfig = { ...base, alerts: alertPresentationSchema.parse({ profiles: { kofi: { donation: { variants: [{ id: 'coffee', name: 'Coffee', match: 'between', amount: 3, maxAmount: 5.5, imageUrl: PICTURE, soundUrl: SOUND, mediaDurationMs: 3_000, fadeOutMs: 1_000 }] } } } }) };
    const tip = { ...cheer(1), eventType: 'engagement.donation', platform: 'kofi', payload: { amount: '5.50', currency: 'USD' } } as unknown as NormalizedEvent;
    const shown = displayOf(projectBrowserOverlayEvent(tip, config));
    expect(shown).toMatchObject({ durationMs: 4_000, variant: { id: 'coffee', imageUrl: PICTURE, soundUrl: SOUND } });
  });

  it('rejects variants that cannot work', () => {
    const parse = (profiles: unknown) => alertPresentationSchema.safeParse({ profiles }).success;
    expect(parse({ twitch: { cheer: { variants: [variant({ videoUrl: undefined })] } } })).toBe(false);
    expect(parse({ twitch: { cheer: { variants: [variant({ imageUrl: PICTURE })] } } })).toBe(false);
    expect(parse({ twitch: { cheer: { variants: [variant({ soundUrl: SOUND })] } } })).toBe(false);
    expect(parse({ twitch: { cheer: { variants: [variant({ match: 'between', amount: 10, maxAmount: 5 })] } } })).toBe(false);
    expect(parse({ twitch: { cheer: { variants: [variant({}), variant({})] } } })).toBe(false);
    expect(parse({ twitch: { follow: { variants: [variant({})] } } })).toBe(false);
    expect(parse({ twitch: { cheer: { variants: [variant({ videoUrl: 'https://example.com/a.mp4' })] } } })).toBe(false);
    expect(parse({ twitch: { cheer: { variants: [variant({})] } } })).toBe(true);
  });
});

describe('media length from the file header', () => {
  it('reads an MP4 movie header', () => {
    const mvhd = Buffer.alloc(8 + 100);
    mvhd.writeUInt32BE(108, 0); mvhd.write('mvhd', 4, 'latin1');
    mvhd.writeUInt32BE(1_000, 8 + 12); mvhd.writeUInt32BE(24_600, 8 + 16);
    const moov = Buffer.concat([Buffer.from([0, 0, 0, 116]), Buffer.from('moov', 'latin1'), mvhd]);
    const ftyp = Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(4)]);
    const mdat = Buffer.concat([Buffer.from([0, 0, 0, 12]), Buffer.from('mdat', 'latin1'), Buffer.alloc(4)]);
    expect(readMediaDurationMs(Buffer.concat([ftyp, mdat, moov]), 'mp4')).toBe(24_600);
    expect(readMediaDurationMs(Buffer.from('not a video'), 'mp4')).toBeUndefined();
  });

  it('reads a WebM segment duration', () => {
    const duration = Buffer.alloc(8); duration.writeDoubleBE(12_345, 0);
    const info = Buffer.concat([Buffer.from([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]), Buffer.from([0x44, 0x89, 0x88]), duration]);
    const segmentBody = Buffer.concat([Buffer.from([0x15, 0x49, 0xa9, 0x66, 0x80 | info.length]), info]);
    const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80]);
    const segment = Buffer.concat([Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), segmentBody]);
    expect(readMediaDurationMs(Buffer.concat([ebmlHeader, segment]), 'webm')).toBe(12_345);
  });
});

describe('alert page timing', () => {
  it('lets a variant move its end once the video really plays', () => {
    const timers: Array<{ callback: () => void; delay: number; cancelled: boolean }> = [];
    let rendered: Parameters<AlertPresentationController['retime']>[0] | undefined;
    const controller = new AlertPresentationController({
      capacity: 5, defaultDurationMs: 7_000, render: (shown) => { rendered = shown; }, clear: () => undefined, playSound: () => undefined, onError: () => undefined,
      schedule: (callback, delay) => { const timer = { callback, delay, cancelled: false }; timers.push(timer); return timer as unknown as ReturnType<typeof setTimeout>; },
      cancel: (timer) => { if (timer !== undefined) (timer as unknown as { cancelled: boolean }).cancelled = true; },
    });
    const alert = { priority: 'high' as const, alertType: 'cheer', display: { durationMs: 26_600 } };
    controller.enqueue(alert);
    expect(timers.at(-1)?.delay).toBe(26_600);
    // The page retimes the alert object it was given to draw.
    if (rendered === undefined) throw new Error('The alert was not drawn.');
    expect(controller.retime(rendered, 30_000)).toBe(true);
    expect(timers.at(-2)?.cancelled).toBe(true);
    expect(timers.at(-1)?.delay).toBe(30_000);
    expect(controller.retime({ priority: 'low' }, 1_000)).toBe(false);
  });
});
