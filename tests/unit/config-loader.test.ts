import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadConfig, loadConfigWithNotices } from '../../bridge/services/config-loader.js';

describe('loadConfig', () => {
  it('reports a missing file', async () => {
    await expect(loadConfig('definitely-missing-config.json')).rejects.toBeInstanceOf(ConfigurationError);
  });

  it('reports invalid JSON', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-config-'));
    const path = join(directory, 'invalid.json');
    await writeFile(path, '{broken', 'utf8');
    await expect(loadConfig(path)).rejects.toMatchObject({ name: 'ConfigurationError' });
  });

  it('accepts a valid configuration saved with a UTF-8 byte-order mark', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-config-bom-'));
    const path = join(directory, 'bridge.local.json');
    const source = await readFile('config/bridge.example.json', 'utf8');
    await writeFile(path, `\ufeff${source}`, 'utf8');
    await expect(loadConfig(path)).resolves.toMatchObject({ service: { host: '127.0.0.1' } });
  });

  it('reports archived configuration keys while loading the core configuration safely', async () => {
    const source = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as Record<string, unknown>;
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-config-legacy-'));
    const path = join(directory, 'legacy.json');
    await writeFile(path, JSON.stringify({
      ...source,
      browserOverlay: { ...(source['browserOverlay'] as Record<string, unknown>), maxCompanionQueue: 20 },
      viewerIdentity: { enabled: true, stateFile: 'data/state/viewer-progression.json' },
      companion: { enabled: true, stateFile: 'data/state/companion.json' },
    }), 'utf8');

    const loaded = await loadConfigWithNotices(path);
    expect(loaded.notices).toEqual([expect.objectContaining({
      code: 'archived-config-ignored',
      paths: ['viewerIdentity', 'companion', 'browserOverlay.maxCompanionQueue'],
    })]);
    expect(loaded.config).not.toHaveProperty('viewerIdentity');
    expect(loaded.config).not.toHaveProperty('companion');
    expect(loaded.config.browserOverlay).not.toHaveProperty('maxCompanionQueue');
  });

  it('does not warn for a clean Stage 2 core configuration', async () => {
    expect((await loadConfigWithNotices('config/bridge.example.json')).notices).toEqual([]);
  });
});
