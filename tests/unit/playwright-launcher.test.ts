import { describe, expect, it } from 'vitest';
import { playwrightEnvironment } from '../../tools/run-playwright.mjs';

describe('Playwright launcher', () => {
  it('does not forward conflicting color controls to Node workers', () => {
    expect(playwrightEnvironment({ FORCE_COLOR: '1', NO_COLOR: '1', KEEP_ME: 'yes' })).toEqual({ KEEP_ME: 'yes' });
    expect(playwrightEnvironment({ FORCE_COLOR: '1', KEEP_ME: 'yes' })).toEqual({ KEEP_ME: 'yes' });
    expect(playwrightEnvironment({ NO_COLOR: '1' })).toEqual({});
  });
});
