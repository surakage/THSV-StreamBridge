import { mkdtemp, readFile } from 'node:fs/promises';
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

  it('prefers an explicit environment token', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-token-env-'));
    process.env[VARIABLE] = 'environment-control-token-with-32-characters';
    await expect(resolveControlToken(VARIABLE, join(directory, 'unused'))).resolves.toBe(process.env[VARIABLE]);
  });
});
