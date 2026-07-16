import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { StructuredLogger } from '../../bridge/services/logger.js';

describe('StructuredLogger', () => {
  it('redacts sensitive keys, registered values, errors, and message patterns', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-log-'));
    const logger = new StructuredLogger('debug', directory, 10_000, 2);
    logger.addSensitiveValue('installation-secret-value');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger.info('token=inline-value installation-secret-value', {
      password: 'field-secret',
      nested: { authorization: 'Bearer hidden', value: 'installation-secret-value' },
      error: new Error('Bearer secret-bearer-value'),
    });
    await logger.flush();
    stdout.mockRestore();
    const content = await readFile(join(directory, 'streambridge.log'), 'utf8');
    expect(content).not.toContain('inline-value');
    expect(content).not.toContain('installation-secret-value');
    expect(content).not.toContain('field-secret');
    expect(content).not.toContain('secret-bearer-value');
    expect(content).toContain('[REDACTED]');
  });

  it('rotates bounded log files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'streambridge-rotate-'));
    const logger = new StructuredLogger('info', directory, 1_024, 2);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    for (let index = 0; index < 40; index += 1) logger.info('x'.repeat(100), { index });
    await logger.flush();
    stdout.mockRestore();
    await expect(readFile(join(directory, 'streambridge.log.1'), 'utf8')).resolves.toBeTypeOf('string');
    await expect(readFile(join(directory, 'streambridge.log.3'), 'utf8')).rejects.toThrow();
  });
});
