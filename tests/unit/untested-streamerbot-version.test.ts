import { describe, expect, it } from 'vitest';
import { untestedStreamerBotVersion } from '../../bridge/services/wizard-service.js';

describe('untested Streamer.bot version notice', () => {
  it('turns the trigger-registry rehearsal failure into a plain readiness issue', () => {
    const rehearsal = { ready: false, steps: [{ id: 'bridge', ready: true }, { id: 'streamerbot-triggers', ready: false, detail: 'Streamer.bot 1.1.0-alpha.17 is not covered by the tested trigger registries (1.0.7, 1.1.0-alpha.15). No trigger repair will be offered.' }] };
    const [issue] = untestedStreamerBotVersion(rehearsal);
    expect(issue).toMatchObject({ area: 'streamerbot-version' });
    expect(String(issue?.['fix'])).toContain('Streamer.bot updated to 1.1.0-alpha.17');
  });

  it('stays quiet when the version is supported or the rehearsal is unavailable', () => {
    expect(untestedStreamerBotVersion({ ready: true, steps: [{ id: 'streamerbot-triggers', ready: true, detail: 'All supported trigger contracts are installed once and enabled.' }] })).toEqual([]);
    expect(untestedStreamerBotVersion({ available: false, ready: false, steps: [] })).toEqual([]);
  });
});
