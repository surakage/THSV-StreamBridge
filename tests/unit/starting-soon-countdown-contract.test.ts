import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import countdown from '../../addons/starting-soon-countdown/dist/index.js';

describe('Stream Launch Countdown add-on contract', () => {
  it('subscribes to normalized scene changes and exposes exact-scene settings', async () => {
    const modulePackage = JSON.parse(await readFile('addons/starting-soon-countdown/module-package.json', 'utf8')) as {
      manifest: { eventSubscriptions: string[]; installationSteps: string[] };
    };
    const schema = JSON.parse(await readFile('addons/starting-soon-countdown/schemas/config.json', 'utf8')) as {
      properties: Record<string, unknown>;
    };
    const settingsUi = JSON.parse(await readFile('addons/starting-soon-countdown/ui/settings.json', 'utf8')) as unknown;
    const setupText = modulePackage.manifest.installationSteps.join(' ');

    expect(modulePackage.manifest.eventSubscriptions).toContain('stream.scene-changed');
    expect(schema.properties).toHaveProperty('automaticSceneNames');
    expect(schema.properties).toHaveProperty('stopOutsideAutomaticScenes');
    expect(JSON.stringify(settingsUi)).toContain('automaticSceneNames');
    expect(setupText).not.toMatch(/scene-active|scene-inactive/i);
    expect(setupText).toContain('normalized program-scene changes');
    expect(countdown.manifest).toEqual(modulePackage.manifest);
  });
});
