import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadConfig } from '../../bridge/services/config-loader.js';

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
});
