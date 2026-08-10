import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Village Hydration Station package files', () => {
  it('ships stable triggerless creator controls and bounded Speaker.bot delivery', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/village-hydration-station/manifest.json', 'utf8')) as { version: string; actions: Array<{ id: string; name: string; group: string; importFile: string }> };
    expect(manifest.actions).toHaveLength(6);
    expect(new Set(manifest.actions.map((action) => action.id)).size).toBe(6);
    expect(manifest.actions.every((action) => action.group === 'THSV Addon - Village Hydration Station')).toBe(true);
    expect(new Set(manifest.actions.map((action) => action.importFile))).toEqual(new Set([`THSV-StreamBridge-Village-Hydration-Station-${manifest.version}.sb`]));
    const control = await readFile('packages/streamerbot/village-hydration-station/src/HydrationControl.cs', 'utf8');
    const speak = await readFile('packages/streamerbot/village-hydration-station/src/Speak.cs', 'utf8');
    expect(control).not.toContain('spokenTextInput');
    expect(control).not.toContain('log-voice');
    expect(control).toContain('addon.thsv.village-hydration-station.control');
    expect(speak).toContain('CPH.TtsSpeak');
    expect(speak).toContain('thsvAddonRelayToken');
    const readme = await readFile('packages/streamerbot/village-hydration-station/README.md', 'utf8');
    expect(readme).toContain('does not require Streamer.bot Voice Control');
    expect(readme).not.toContain('SpeechToText.Dictation');
  });

  it('keeps wizard setup compact and hides dependent fields until they are needed', async () => {
    const ui = JSON.parse(await readFile('addons/village-hydration-station/ui/settings.json', 'utf8')) as { sections: Array<{ id: string; fields: string[] }>; fields: Record<string, { visibleWhen?: unknown }> };
    expect(ui.sections.map((section) => section.id)).toEqual(['basics', 'viewers', 'controls', 'wording', 'overlay']);
    expect(ui.sections.flatMap((section) => section.fields)).toContain('goalOunces');
    expect(ui.fields['voiceAlias']?.visibleWhen).toBeDefined();
    expect(JSON.stringify(ui)).toContain('Village Voice');
    expect(JSON.stringify(ui)).toContain('broadcaster-only chat command');
    expect(JSON.stringify(ui)).not.toContain('Voice Control');
    expect(ui.fields['twitchRewardId']?.visibleWhen).toBeDefined();
  });
});
