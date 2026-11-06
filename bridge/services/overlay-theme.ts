import { readFile } from 'node:fs/promises';
import { writeJsonAtomic } from './atomic-state.js';

export const OVERLAY_THEME_FONTS = ['broadcast', 'rounded', 'serif', 'display', 'mono'] as const;
export type OverlayThemeFont = typeof OVERLAY_THEME_FONTS[number];

export interface OverlayTheme {
  readonly enabled: boolean;
  readonly panelColor: string;
  readonly panelOpacity: number;
  readonly accentColor: string;
  readonly highlightColor: string;
  readonly textColor: string;
  readonly mutedColor: string;
  readonly bodyFont: OverlayThemeFont;
  readonly titleFont: OverlayThemeFont;
}

/** Keep in step with the :root tokens in overlays/browser/overlay-theme.css. */
export const DEFAULT_OVERLAY_THEME: OverlayTheme = Object.freeze({
  enabled: true, panelColor: '#10231c', panelOpacity: 94, accentColor: '#e9bd58', highlightColor: '#7ff5cc', textColor: '#fff7df', mutedColor: '#c7e4d5', bodyFont: 'broadcast', titleFont: 'serif',
});

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value.toLowerCase() : fallback;
}

function font(value: unknown, fallback: OverlayThemeFont): OverlayThemeFont {
  return OVERLAY_THEME_FONTS.includes(value as OverlayThemeFont) ? value as OverlayThemeFont : fallback;
}

/** Anything missing or invalid falls back to the default, so a damaged file can never blank an overlay. */
export function normalizeOverlayTheme(input: unknown): OverlayTheme {
  const raw = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const defaults = DEFAULT_OVERLAY_THEME;
  const opacity = raw['panelOpacity'];
  return {
    enabled: raw['enabled'] !== false,
    panelColor: color(raw['panelColor'], defaults.panelColor),
    panelOpacity: typeof opacity === 'number' && Number.isFinite(opacity) ? Math.max(0, Math.min(100, Math.round(opacity))) : defaults.panelOpacity,
    accentColor: color(raw['accentColor'], defaults.accentColor),
    highlightColor: color(raw['highlightColor'], defaults.highlightColor),
    textColor: color(raw['textColor'], defaults.textColor),
    mutedColor: color(raw['mutedColor'], defaults.mutedColor),
    bodyFont: font(raw['bodyFont'], defaults.bodyFont),
    titleFont: font(raw['titleFont'], defaults.titleFont),
  };
}

export async function readOverlayTheme(path: string): Promise<OverlayTheme> {
  try { return normalizeOverlayTheme(JSON.parse(await readFile(path, 'utf8')) as unknown); }
  catch { return DEFAULT_OVERLAY_THEME; }
}

export async function saveOverlayTheme(path: string, input: unknown): Promise<OverlayTheme> {
  const theme = normalizeOverlayTheme(input);
  await writeJsonAtomic(path, theme);
  return theme;
}
