/** Screen effects an extension (Streamer Punishments) can ask a streaming app for, and how ready each app is for one. */
export type StreamingEffectKind = 'blackout' | 'pixelate' | 'barrel-roll' | 'filter';
export type StreamingEffectStatus = 'ready' | 'needs-setup' | 'not-available' | 'unchecked';
export interface StreamingEffectCheck {
  readonly status: StreamingEffectStatus;
  /** One plain sentence about what was found. */
  readonly detail: string;
  /** True when StreamBridge can create what is missing ("Set it up for me"). */
  readonly canCreate: boolean;
}
export interface StreamingEffectRequest { readonly name: string; readonly source: string; readonly filter: string }

/** The same rule Streamer Punishments uses: the effect's name or filter says what it is. */
export function streamingEffectKind(name: string, filter: string): StreamingEffectKind {
  const text = `${name} ${filter}`.toLowerCase().replace(/[^a-z0-9]+/gu, '');
  if (text.includes('blackout')) return 'blackout';
  if (text.includes('pixel')) return 'pixelate';
  if (text.includes('barrelroll') || text.includes('spin')) return 'barrel-roll';
  return 'filter';
}

/** Color Correction turned all the way dark: OBS and Streamlabs both ship it, so StreamBridge can add it for a blackout. */
export const BLACKOUT_FILTER_KIND = 'color_filter_v2';
export const BLACKOUT_FILTER_SETTINGS: Readonly<Record<string, number>> = Object.freeze({ brightness: -1, contrast: -4, saturation: -1 });
