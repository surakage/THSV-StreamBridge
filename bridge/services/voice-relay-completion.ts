import type { StreamerBotEventRelay } from '../adapters/streamerbot-event-relay.js';

/** Speaker.bot did not confirm the read-out; it may still play once its queue resumes. */
export class VoiceRelayUnconfirmedError extends Error {
  public constructor() { super('Speaker.bot did not confirm the read-out in time. It may still play once its speech queue resumes (for example after the creator stops talking).'); this.name = 'VoiceRelayUnconfirmedError'; }
}

/** Correlates actual native Speak results separately from DoAction acceptance. */
export function waitForVoiceRelayCompletion(relay: StreamerBotEventRelay, executionId: string, token: string, signal?: AbortSignal, timeoutMs = 35_000): { completion: Promise<void>; cancel: () => void } {
  let dispose = (): void => undefined;
  let rejectCompletion: (error: Error) => void = () => undefined;
  const completion = new Promise<void>((resolve, reject) => {
    rejectCompletion = reject;
    const finish = (error?: Error): void => { dispose(); if (error === undefined) resolve(); else reject(error); };
    const unsubscribe = relay.subscribe((message) => {
      if (message['type'] !== 'thsv.voice-result' || message['executionId'] !== executionId || message['relayToken'] !== token) return;
      finish(message['success'] === true ? undefined : new VoiceRelayUnconfirmedError());
    });
    const timer = setTimeout(() => finish(new Error('Speaker.bot playback completion timed out.')), timeoutMs);
    const abort = (): void => finish(new Error('Speaker.bot playback wait was cancelled.'));
    dispose = () => { clearTimeout(timer); unsubscribe(); signal?.removeEventListener('abort', abort); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
  // Dispatch may fail before the caller starts awaiting the completion result.
  void completion.catch(() => undefined);
  return { completion, cancel: () => { dispose(); rejectCompletion(new Error('Speech dispatch was cancelled.')); } };
}
