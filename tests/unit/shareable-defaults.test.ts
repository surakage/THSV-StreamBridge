import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { bridgeConfigSchema } from '../../schemas/config.js';
import { validateSettings } from '../../bridge/services/addon-wizard-service.js';
import { testConfig } from '../helpers.js';

// Shipped defaults must not carry one creator's accounts, community name, or home time zone.
const PERSONAL_DEFAULTS = [/suraruisuh/iu, /hidden sloth village/iu, /America\/Chicago/u];

function collectDefaults(value: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) { for (const item of value) collectDefaults(item, found); return found; }
  if (typeof value !== 'object' || value === null) return found;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'default') found.push(child);
    collectDefaults(child, found);
  }
  return found;
}

async function addOnFolders(): Promise<string[]> {
  return (await readdir('addons', { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

describe('shareable defaults', () => {
  it('ships no personal account names, community name, or fixed home time zone in add-on setting defaults', async () => {
    for (const folder of await addOnFolders()) {
      let schema: unknown;
      try { schema = JSON.parse(await readFile(`addons/${folder}/schemas/config.json`, 'utf8')); } catch { continue; }
      const defaults = JSON.stringify(collectDefaults(schema));
      for (const pattern of PERSONAL_DEFAULTS) expect(defaults, `${folder} default matches ${String(pattern)}`).not.toMatch(pattern);
    }
  });

  it('ships no personal account names or community name in add-on runtime fallbacks', async () => {
    for (const folder of await addOnFolders()) {
      let source: string;
      try { source = await readFile(`addons/${folder}/dist/index.js`, 'utf8'); } catch { continue; }
      expect(source, folder).not.toMatch(/suraruisuh/iu);
      expect(source, folder).not.toMatch(/hidden sloth village/iu);
      expect(source, folder).not.toMatch(/'America\/Chicago'/u);
    }
  });

  it('keeps a saved America/Chicago time zone valid for every add-on time zone setting', async () => {
    for (const folder of ['first-five', 'fan-crown', 'chat-play-pack', 'community-analytics', 'lurk-tracker', 'village-roll-call']) {
      const schema = JSON.parse(await readFile(`addons/${folder}/schemas/config.json`, 'utf8')) as { properties: Record<string, unknown> };
      expect(validateSettings(schema, { timeZone: 'America/Chicago' })['timeZone'], folder).toBe('America/Chicago');
      expect(validateSettings(schema, { timeZone: 'Europe/Berlin' })['timeZone'], folder).toBe('Europe/Berlin');
      expect(validateSettings(schema, {}, true)['timeZone'], folder).toBe('');
    }
  });

  it('defaults the overlay brand label to blank while preserving a saved label', async () => {
    const config = await testConfig();
    const withoutLabel: Record<string, unknown> = { ...config.browserOverlay };
    delete withoutLabel['brandLabel'];
    expect(bridgeConfigSchema.parse({ ...config, browserOverlay: withoutLabel }).browserOverlay.brandLabel).toBe('');
    expect(bridgeConfigSchema.parse({ ...config, browserOverlay: { ...config.browserOverlay, brandLabel: 'THE HIDDEN SLOTH VILLAGE' } }).browserOverlay.brandLabel).toBe('THE HIDDEN SLOTH VILLAGE');
    const example = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as { browserOverlay: { brandLabel: string } };
    expect(example.browserOverlay.brandLabel).toBe('');
  });

  it('uses a neutral follow thank-you in the overlay, wizard, and Voice Relay defaults', async () => {
    const neutral = 'Welcome to the community, {actor}! Glad to have you here.';
    const voiceRelay = JSON.parse(await readFile('addons/voice-relay/schemas/config.json', 'utf8')) as { properties: { followTemplate: { default: string } } };
    expect(voiceRelay.properties.followTemplate.default).toBe(neutral);
    expect(await readFile('wizard/browser/app.js', 'utf8')).toContain(`follow:'${neutral}'`);
    expect(await readFile('bridge/core/browser-overlay.ts', 'utf8')).toContain('`Welcome to the community, ${actor}! Glad to have you here.`');
  });

  it('lets the break-ad action follow the mapped break scene instead of fixed scene names', async () => {
    const source = await readFile('packages/streamerbot/scene-actions/src/RequestBreakAd.cs', 'utf8');
    expect(source).toContain('CPH.TryGetArg<string>("sceneName"');
    expect(source).not.toContain('Be Right Back"');
  });
});
