import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { isIgnoredSceneChange } from '../../bridge/core/bridge.js';
import { sceneRolesSchema } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function sceneEvent(sceneName: string, simulated = false, eventType = 'stream.scene-changed'): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `scene-${sceneName}`, eventType, platform: 'system',
    source: { adapter: 'scenes', eventId: 'source', eventName: 'SceneChanged' }, receivedAt: '2026-10-19T12:00:00.000Z',
    channel: { name: 'system' }, payload: { provider: 'obs', sceneName }, metadata: { simulated },
  };
}

describe('ignored scene prefixes', () => {
  it('drops live switches to building-block scenes and keeps every other scene change', () => {
    const prefixes = ['🟠'];
    expect(isIgnoredSceneChange(sceneEvent('🟠 Starting Soon'), prefixes)).toBe(true);
    expect(isIgnoredSceneChange(sceneEvent('  🟠 Gameplay (Vertical)'), prefixes)).toBe(true);
    expect(isIgnoredSceneChange(sceneEvent('🔴 Starting Soon'), prefixes)).toBe(false);
    expect(isIgnoredSceneChange(sceneEvent('Starting Soon'), prefixes)).toBe(false);
    expect(isIgnoredSceneChange(sceneEvent('🟠 Starting Soon'), [])).toBe(false);
    // Simulated tests and non-scene events are never filtered here.
    expect(isIgnoredSceneChange(sceneEvent('🟠 Starting Soon', true), prefixes)).toBe(false);
    expect(isIgnoredSceneChange(sceneEvent('🟠 Starting Soon', false, 'system.scene-catalog'), prefixes)).toBe(false);
  });

  it('defaults to no ignored prefixes and validates saved ones', () => {
    expect(sceneRolesSchema.parse({}).ignoredScenePrefixes).toEqual([]);
    expect(sceneRolesSchema.parse({ ignoredScenePrefixes: ['🟠', ' 🟤 '] }).ignoredScenePrefixes).toEqual(['🟠', '🟤']);
    expect(() => sceneRolesSchema.parse({ ignoredScenePrefixes: [''] })).toThrow();
  });

  it('lets the creator edit the prefixes next to the scene roles in the wizard', async () => {
    const shell = await readFile('wizard/browser/index.html', 'utf8');
    const script = await readFile('wizard/browser/addons.js', 'utf8');
    expect(shell).toContain('name="ignoredScenePrefixes"');
    expect(script).toContain('sceneRoles.ignoredScenePrefixes = ');
  });
});
