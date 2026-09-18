import type { AddOnActionArgumentsV2 } from './v2/addon-capability.js';

export const VOICE_RELAY_MODULE_ID = 'thsv.voice-relay';
export const VOICE_RELAY_SPEAK_ACTION_ID = '9d7b9f62-8f33-41a0-b7d8-a2d247a02fd3';

const HANDOFF_NAME = /^voice-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.txt$/iu;
const ALLOWED_ARGUMENTS = new Set(['voiceRelayMessageHandoff', 'voiceRelayHandoffRoot', 'voiceRelayVoiceAlias', 'thsvAddonRelayToken']);

/** Final fail-closed check before the Voice Relay payload can be serialized to WebSocket JSON. */
export function assertSecureVoiceRelayArguments(actionId: string, argumentsValue: AddOnActionArgumentsV2): void {
  if (actionId.toLowerCase() !== VOICE_RELAY_SPEAK_ACTION_ID) return;
  const keys = Object.keys(argumentsValue);
  if (keys.some((key) => !ALLOWED_ARGUMENTS.has(key))) throw new Error('Village Voice rejected unexpected or plaintext Streamer.bot arguments.');
  const filename = argumentsValue['voiceRelayMessageHandoff'];
  const root = argumentsValue['voiceRelayHandoffRoot'];
  const alias = argumentsValue['voiceRelayVoiceAlias'];
  const token = argumentsValue['thsvAddonRelayToken'];
  if (typeof filename !== 'string' || !HANDOFF_NAME.test(filename)) throw new Error('Village Voice requires a valid opaque speech handoff name.');
  if (typeof root !== 'string' || root.length === 0 || root.length > 1_024) throw new Error('Village Voice requires a bounded speech handoff root.');
  if (typeof alias !== 'string' || alias.trim().length === 0 || alias.length > 80) throw new Error('Village Voice requires a bounded Speaker.bot voice alias.');
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw new Error('Village Voice requires a valid one-use broker token.');
}
