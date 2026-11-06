import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERLAY_THEME, normalizeOverlayTheme, readOverlayTheme, saveOverlayTheme } from '../../bridge/services/overlay-theme.js';

describe('overlay theme', () => {
  it('keeps valid values and replaces invalid ones with the default', () => {
    const theme = normalizeOverlayTheme({ enabled: false, panelColor: '#ABCDEF', accentColor: 'red; background:url(x)', panelOpacity: 150, titleFont: 'display', bodyFont: 'comic' });
    expect(theme).toEqual({ ...DEFAULT_OVERLAY_THEME, enabled: false, panelColor: '#abcdef', panelOpacity: 100, titleFont: 'display' });
  });

  it('treats an empty save as a reset to the default', () => {
    expect(normalizeOverlayTheme({})).toEqual(DEFAULT_OVERLAY_THEME);
    expect(normalizeOverlayTheme(['not', 'a', 'theme'])).toEqual(DEFAULT_OVERLAY_THEME);
  });

  it('matches the tokens built into the stylesheet, so a page looks right before the saved theme loads', async () => {
    const css = await readFile('overlays/browser/overlay-theme.css', 'utf8');
    const tokens: readonly (readonly [string, string])[] = [['panel', DEFAULT_OVERLAY_THEME.panelColor], ['accent', DEFAULT_OVERLAY_THEME.accentColor], ['highlight', DEFAULT_OVERLAY_THEME.highlightColor], ['text', DEFAULT_OVERLAY_THEME.textColor], ['muted', DEFAULT_OVERLAY_THEME.mutedColor]];
    for (const [token, value] of tokens) {
      expect(css).toContain(`--thsv-${token}: ${value};`);
    }
  });

  it('saves to disk and survives a missing or damaged file', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'thsv-overlay-theme-')), 'state', 'overlay-theme.json');
    expect(await readOverlayTheme(path)).toEqual(DEFAULT_OVERLAY_THEME);
    await saveOverlayTheme(path, { accentColor: '#112233' });
    expect((await readOverlayTheme(path)).accentColor).toBe('#112233');
    await writeFile(path, '{ damaged', 'utf8');
    expect(await readOverlayTheme(path)).toEqual(DEFAULT_OVERLAY_THEME);
  });
});
