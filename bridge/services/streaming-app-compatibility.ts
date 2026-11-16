import type { BroadcastConnectionProvider } from './broadcast-connection-vault-service.js';

export type StreamingAppSupportLevel = 'yes' | 'partly' | 'no';
export interface StreamingAppSupport {
  readonly apps: Readonly<Record<BroadcastConnectionProvider, StreamingAppSupportLevel>>;
  /** What "partly" or "no" means, per app, in the creator's words. */
  readonly notes?: Partial<Readonly<Record<BroadcastConnectionProvider, string>>>;
}

/**
 * Extensions whose features depend on which streaming app the creator uses. Every extension not listed
 * works the same in OBS Studio, SprigCast, Meld Studio and Streamlabs Desktop (overlays, chat, Streamer.bot).
 * Sources: Streamer.bot's Meld Studio and Streamlabs Desktop sub-actions, the Streamlabs Desktop remote API,
 * obs-websocket 5, and SprigCast's own API.
 */
export const STREAMING_APP_SUPPORT: Readonly<Record<string, StreamingAppSupport>> = {
  'thsv.streamer-punishments': {
    apps: { obs: 'yes', sprigcast: 'yes', streamlabs: 'yes', meld: 'partly' },
    notes: { meld: 'Blackout and pixelate work as Meld effects on a layer. Meld cannot rotate a layer, so a barrel roll needs a Meld effect that spins.' },
  },
  'thsv.snap': {
    apps: { obs: 'yes', sprigcast: 'yes', meld: 'no', streamlabs: 'no' },
    notes: { meld: 'Meld saves screenshots in its own folder, so Snap cannot use them.', streamlabs: 'Streamlabs Desktop cannot take screenshots for other apps.' },
  },
};

export function streamingAppSupport(moduleId: string): StreamingAppSupport | undefined { return STREAMING_APP_SUPPORT[moduleId]; }
