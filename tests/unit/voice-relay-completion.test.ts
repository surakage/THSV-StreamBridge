import { describe, expect, it } from 'vitest';
import { StreamerBotEventRelay } from '../../bridge/adapters/streamerbot-event-relay.js';
import { waitForVoiceRelayCompletion } from '../../bridge/services/voice-relay-completion.js';

describe('native speech completion', () => {
  it('requires both execution identity and broker token, not transport acceptance', async () => {
    const relay = new StreamerBotEventRelay();
    const tracker = waitForVoiceRelayCompletion(relay, 'request-one', 'private-token');
    let completed = false;
    void tracker.completion.then(() => { completed = true; });
    relay.publish({ id: 'request-one', status: 'ok' });
    relay.publish({ type: 'thsv.voice-result', executionId: 'request-one', relayToken: 'wrong', success: true });
    await Promise.resolve();
    expect(completed).toBe(false);
    relay.publish({ type: 'thsv.voice-result', executionId: 'request-one', relayToken: 'private-token', success: true });
    await tracker.completion;
    expect(completed).toBe(true);
  });
  it('rejects unsuccessful playback and missing completion', async () => {
    const relay = new StreamerBotEventRelay();
    const failed = waitForVoiceRelayCompletion(relay, 'failure', 'token');
    relay.publish({ type: 'thsv.voice-result', executionId: 'failure', relayToken: 'token', success: false });
    await expect(failed.completion).rejects.toThrow('did not complete');
    const missing = waitForVoiceRelayCompletion(relay, 'missing', 'token', undefined, 10);
    await expect(missing.completion).rejects.toThrow('timed out');
  });
  it('cancels immediately and ignores late results', async () => {
    const relay = new StreamerBotEventRelay();
    const controller = new AbortController();
    const tracker = waitForVoiceRelayCompletion(relay, 'cancelled', 'token', controller.signal);
    controller.abort();
    relay.publish({ type: 'thsv.voice-result', executionId: 'cancelled', relayToken: 'token', success: true });
    await expect(tracker.completion).rejects.toThrow('cancelled');
  });
});
