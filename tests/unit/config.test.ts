import { describe, expect, it } from 'vitest';
import { bridgeConfigSchema } from '../../schemas/config.js';
import { testConfig } from '../helpers.js';

describe('bridge configuration', () => {
  it('accepts the example configuration', async () => {
    expect(bridgeConfigSchema.safeParse(await testConfig()).success).toBe(true);
  });

  it('rejects invalid port and unsafe network binding', async () => {
    const config = await testConfig();
    const result = bridgeConfigSchema.safeParse({ ...config, service: { ...config.service, host: '0.0.0.0', port: 80 } });
    expect(result.success).toBe(false);
  });
});
