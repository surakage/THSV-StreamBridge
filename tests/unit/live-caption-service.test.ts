import { describe, expect, it, vi } from 'vitest';
import { StreamerBotEventRelay } from '../../bridge/adapters/streamerbot-event-relay.js';
import type { BrowserOverlayHub } from '../../bridge/services/browser-overlay-hub.js';
import { LiveCaptionService } from '../../bridge/services/live-caption-service.js';
import { silentLogger, testConfig } from '../helpers.js';

describe('LiveCaptionService', () => {
  it('publishes native dictation directly with confidence and repeat gates', async () => {
    const config = await testConfig();
    config.liveCaptions.enabled = true;
    config.liveCaptions.minimumConfidence = 0.6;
    config.liveCaptions.repeatSuppressionMs = 1_500;
    const publishLiveCaption = vi.fn<(payload: Readonly<Record<string, unknown>>) => void>();
    const clearLiveCaptions = vi.fn<(reason: string) => void>();
    const overlay = { publishLiveCaption, clearLiveCaptions } as unknown as BrowserOverlayHub;
    const relay = new StreamerBotEventRelay();
    let now = 1_000;
    const service = new LiveCaptionService(config.liveCaptions, overlay, relay, silentLogger, () => now);
    service.start();

    relay.publish(dictation('Too uncertain', 0.2));
    relay.publish(dictation('Readable creator speech', 0.96));
    now = 1_500;
    relay.publish(dictation('Readable creator speech', 96));
    expect(publishLiveCaption).toHaveBeenCalledOnce();
    const published = publishLiveCaption.mock.calls[0]?.[0];
    expect(published).toMatchObject({ text: 'Readable creator speech', confidence: 0.96, expiresAt: new Date(1_000 + config.liveCaptions.durationMs).toISOString(), style: { fontSizePx: 48 } });
    expect(service.status()).toMatchObject({ listening: true, received: 3, published: 1, rejectedLowConfidence: 1, rejectedStale: 0, suppressedRepeats: 1, privacy: { storesAudio: false, storesTranscripts: false, logsCaptionText: false } });

    service.stop();
    expect(clearLiveCaptions).toHaveBeenCalledWith('bridge-shutdown');
    relay.publish(dictation('Not consumed after stop', 0.99));
    expect(publishLiveCaption).toHaveBeenCalledOnce();
  });

  it('previews unsaved validated appearance settings and clears on stream offline', async () => {
    const config = await testConfig();
    const publishLiveCaption = vi.fn<(payload: Readonly<Record<string, unknown>>) => void>();
    const clearLiveCaptions = vi.fn<(reason: string) => void>();
    const service = new LiveCaptionService(config.liveCaptions, { publishLiveCaption, clearLiveCaptions } as unknown as BrowserOverlayHub, new StreamerBotEventRelay(), silentLogger);
    service.preview({ settings: { ...config.liveCaptions, fontFamily: 'serif', fontSizePx: 72, backgroundMode: 'highlight' } });
    const preview = publishLiveCaption.mock.calls[0]?.[0];
    expect(preview).toMatchObject({ preview: true, style: { fontFamily: 'serif', fontSizePx: 72, backgroundMode: 'highlight' } });
    service.observeBridgeEvent({ schemaVersion: '1.0.0', eventId: 'offline-1', eventType: 'stream.offline', platform: 'twitch', source: { adapter: 'test', eventName: 'offline' }, receivedAt: new Date().toISOString(), channel: { name: 'test-channel' }, payload: {}, metadata: { simulated: false } });
    expect(clearLiveCaptions).toHaveBeenCalledWith('stream-offline');
  });

  it('resets repeat suppression when the stream ends', async () => {
    const config = await testConfig();
    config.liveCaptions.enabled = true;
    config.liveCaptions.repeatSuppressionMs = 30_000;
    const relay = new StreamerBotEventRelay();
    const publishLiveCaption = vi.fn<(payload: Readonly<Record<string, unknown>>) => void>();
    const service = new LiveCaptionService(config.liveCaptions, { publishLiveCaption, clearLiveCaptions: vi.fn() } as unknown as BrowserOverlayHub, relay, silentLogger, () => 1_000);
    service.start();
    relay.publish(dictation('Same phrase in a new stream', 0.99));
    relay.publish(dictation('Same phrase in a new stream', 0.99));
    expect(publishLiveCaption).toHaveBeenCalledOnce();
    service.observeBridgeEvent({ schemaVersion: '1.0.0', eventId: 'offline-reset', eventType: 'stream.offline', platform: 'twitch', source: { adapter: 'test', eventName: 'offline' }, receivedAt: new Date().toISOString(), channel: { name: 'test-channel' }, payload: {}, metadata: { simulated: false } });
    relay.publish(dictation('Same phrase in a new stream', 0.99));
    expect(publishLiveCaption).toHaveBeenCalledTimes(2);
  });

  it('uses saved settings for an explicit empty preview request', async () => {
    const config = await testConfig();
    const publishLiveCaption = vi.fn<(payload: Readonly<Record<string, unknown>>) => void>();
    const service = new LiveCaptionService(config.liveCaptions, { publishLiveCaption, clearLiveCaptions: vi.fn() } as unknown as BrowserOverlayHub, new StreamerBotEventRelay(), silentLogger);
    expect(service.preview({})).toMatchObject({ published: true, overlayUrl: '/overlay/captions' });
    expect(publishLiveCaption.mock.calls[0]?.[0]).toMatchObject({ style: { fontFamily: config.liveCaptions.fontFamily, fontSizePx: config.liveCaptions.fontSizePx } });
    expect(() => service.preview({ settings: { enabled: true, durationMs: 86_400_000 } })).toThrow();
  });

  it('drops dictation that arrived after its display window instead of reviving stale speech', async () => {
    const config = await testConfig();
    config.liveCaptions.enabled = true;
    config.liveCaptions.durationMs = 6_000;
    const publishLiveCaption = vi.fn<(payload: Readonly<Record<string, unknown>>) => void>();
    const relay = new StreamerBotEventRelay();
    const active = new LiveCaptionService(config.liveCaptions, { publishLiveCaption, clearLiveCaptions: vi.fn() } as unknown as BrowserOverlayHub, relay, silentLogger, () => 10_000);
    active.start();
    relay.publish({ ...dictation('Old speech', 0.99), timeStamp: new Date(1_000).toISOString() });
    expect(publishLiveCaption).not.toHaveBeenCalled();
    expect(active.status()).toMatchObject({ received: 1, published: 0, rejectedStale: 1 });
    relay.publish({ ...dictation('Slightly delayed speech', 0.99), timeStamp: new Date(7_000).toISOString() });
    expect(publishLiveCaption).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 3_000, expiresAt: new Date(13_000).toISOString() }));
    expect(active.status()).toMatchObject({ received: 2, published: 1, rejectedStale: 1 });
  });

  it('uses a close alternate when an accent correction recognizes it and masks profanity', async () => {
    const config = await testConfig();
    config.liveCaptions.enabled = true;
    config.liveCaptions.minimumConfidence = 0.6;
    config.liveCaptions.useAlternatives = true;
    config.liveCaptions.alternativeConfidenceTolerance = 0.15;
    config.liveCaptions.corrections = [{ heard: 'hidden sloth village', intended: 'Hidden Sloth Village' }];
    config.liveCaptions.profanityFilter = true;
    const publishLiveCaption = vi.fn<(payload: Readonly<Record<string, unknown>>) => void>();
    const relay = new StreamerBotEventRelay();
    const service = new LiveCaptionService(config.liveCaptions, { publishLiveCaption, clearLiveCaptions: vi.fn() } as unknown as BrowserOverlayHub, relay, silentLogger, () => 1_000);
    service.start();

    relay.publish(dictation('the hidden slow village is shit', 0.91, [{ text: 'the hidden sloth village is shit', confidence: 0.82 }]));

    expect(publishLiveCaption).toHaveBeenCalledWith(expect.objectContaining({ text: 'the Hidden Sloth Village is ••••', confidence: 0.82 }));
    expect(service.status()).toMatchObject({ received: 1, published: 1, corrected: 1, alternativeSelections: 1, profanityMasked: 1, correctionRules: 1, profanityFilter: true });
  });

  it('does not promote a corrected alternate outside the configured confidence tolerance', async () => {
    const config = await testConfig();
    config.liveCaptions.enabled = true;
    config.liveCaptions.alternativeConfidenceTolerance = 0.05;
    config.liveCaptions.corrections = [{ heard: 'hidden sloth village', intended: 'Hidden Sloth Village' }];
    const publishLiveCaption = vi.fn<(payload: Readonly<Record<string, unknown>>) => void>();
    const relay = new StreamerBotEventRelay();
    const service = new LiveCaptionService(config.liveCaptions, { publishLiveCaption, clearLiveCaptions: vi.fn() } as unknown as BrowserOverlayHub, relay, silentLogger, () => 1_000);
    service.start();
    relay.publish(dictation('the hidden slow village', 0.95, [{ text: 'the hidden sloth village', confidence: 0.75 }]));
    expect(publishLiveCaption).toHaveBeenCalledWith(expect.objectContaining({ text: 'the hidden slow village', confidence: 0.95 }));
    expect(service.status()).toMatchObject({ corrected: 0, alternativeSelections: 0 });
  });

  it('masks creator-defined complete phrases but preserves uncensored captions when disabled', async () => {
    const config = await testConfig();
    config.liveCaptions.enabled = true;
    config.liveCaptions.additionalProfanity = ['heck no'];
    const relay = new StreamerBotEventRelay();
    const publishLiveCaption = vi.fn<(payload: Readonly<Record<string, unknown>>) => void>();
    const service = new LiveCaptionService(config.liveCaptions, { publishLiveCaption, clearLiveCaptions: vi.fn() } as unknown as BrowserOverlayHub, relay, silentLogger, () => 1_000);
    service.start();
    relay.publish(dictation('Heck no, checkered flags are classic.', 0.99));
    expect(publishLiveCaption).toHaveBeenLastCalledWith(expect.objectContaining({ text: '•••• ••, checkered flags are classic.' }));

    const uncensoredConfig = { ...config.liveCaptions, profanityFilter: false };
    const uncensoredPublish = vi.fn<(payload: Readonly<Record<string, unknown>>) => void>();
    const uncensoredRelay = new StreamerBotEventRelay();
    const uncensored = new LiveCaptionService(uncensoredConfig, { publishLiveCaption: uncensoredPublish, clearLiveCaptions: vi.fn() } as unknown as BrowserOverlayHub, uncensoredRelay, silentLogger, () => 1_000);
    uncensored.start();
    uncensoredRelay.publish(dictation('This is shit.', 0.99));
    expect(uncensoredPublish).toHaveBeenCalledWith(expect.objectContaining({ text: 'This is shit.' }));
    expect(uncensored.status()).toMatchObject({ profanityMasked: 0, profanityFilter: false });
  });
});

function dictation(text: string, confidence: number, alternatives: readonly Readonly<{ text: string; confidence: number }>[] = []): Readonly<Record<string, unknown>> {
  return { timeStamp: '2026-09-02T12:00:00.000Z', event: { source: 'SpeechToText', type: 'Dictation' }, data: { text, confidence, alternatives } };
}
