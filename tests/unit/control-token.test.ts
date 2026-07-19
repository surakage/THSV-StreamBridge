import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveControlToken } from '../../bridge/services/control-token.js';

const VARIABLE = 'THSV_STREAMBRIDGE_TEST_CONTROL_TOKEN';
afterEach(() => { process.env[VARIABLE] = undefined; });

describe('resolveControlToken', () => {
  it('generates and reuses a private installation token', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-token-'));
    const path = join(directory, 'control-token');
    const first = await resolveControlToken(VARIABLE, path);
    const second = await resolveControlToken(VARIABLE, path);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(second).toBe(first);
    expect((await readFile(path, 'utf8')).trim()).toBe(first);
  });

  it('generates a different cryptographic token for every installation', async () => {
    const firstDirectory = await mkdtemp(join(tmpdir(), 'streambridge-token-install-a-'));
    const secondDirectory = await mkdtemp(join(tmpdir(), 'streambridge-token-install-b-'));
    const first = await resolveControlToken(VARIABLE, join(firstDirectory, 'control-token'));
    const second = await resolveControlToken(VARIABLE, join(secondDirectory, 'control-token'));
    expect(first).not.toBe(second);
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    expect(Buffer.from(second, 'base64url')).toHaveLength(32);
  });

  it('prefers an explicit environment token', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-token-env-'));
    process.env[VARIABLE] = 'environment-control-token-with-32-characters';
    await expect(resolveControlToken(VARIABLE, join(directory, 'unused'))).resolves.toBe(process.env[VARIABLE]);
  });

  it('converges on one token when multiple startup attempts race', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-token-race-'));
    const path = join(directory, 'control-token');
    const tokens = await Promise.all(Array.from({ length: 12 }, () => resolveControlToken(VARIABLE, path)));
    expect(new Set(tokens)).toEqual(new Set([tokens[0]]));
    expect((await readFile(path, 'utf8')).trim()).toBe(tokens[0]);
  });

  it('refuses to silently replace a corrupt existing token', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-token-invalid-'));
    const path = join(directory, 'control-token');
    await writeFile(path, 'short\n', { encoding: 'utf8', mode: 0o600 });
    await expect(resolveControlToken(VARIABLE, path)).rejects.toThrow('refusing to replace');
    expect(await readFile(path, 'utf8')).toBe('short\n');
  });
});
