import { describe, expect, it } from 'vitest';
import { coreAcceptanceFingerprints } from '../../bridge/services/acceptance-fingerprints.js';

describe('core acceptance fingerprints', () => {
  it('derives deterministic scoped fingerprints from executable modules', async () => {
    const first = await coreAcceptanceFingerprints();
    expect(await coreAcceptanceFingerprints()).toEqual(first);
    expect(Object.keys(first).sort()).toEqual(['delivery', 'overlay', 'persistence', 'startup']);
    for (const value of Object.values(first)) expect(value).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(first['startup']).not.toBe(first['overlay']);
  });
});
