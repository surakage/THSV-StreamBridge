import type { NormalizedEvent } from '../../schemas/event.js';

export interface StreamerBotEventArguments {
  readonly streamBridgeEvent: string;
}

export function buildStreamerBotEventArguments(event: NormalizedEvent): StreamerBotEventArguments {
  return {
    streamBridgeEvent: JSON.stringify(event),
  };
}
