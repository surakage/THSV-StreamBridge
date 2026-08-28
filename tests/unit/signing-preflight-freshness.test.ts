import { describe, expect, it } from 'vitest';
import { checkSigningPreflightFreshness } from '../../scripts/check-signing-preflight-freshness.mjs';

describe('monthly signing preflight freshness', () => {
  const now = Date.parse('2026-08-28T12:00:00.000Z');

  it('accepts the newest successful protected preflight inside the evidence window', async () => {
    const fetcher = async () => Response.json({ workflow_runs: [{ conclusion: 'success', updated_at: '2026-08-20T12:00:00.000Z', html_url: 'https://github.test/run/1' }] });
    await expect(checkSigningPreflightFreshness({ repository: 'surakage/THSV-StreamBridge', fetcher, now })).resolves.toMatchObject({ fresh: true, result: 'success', ageDays: 8, latestRunUrl: 'https://github.test/run/1' });
  });

  it('requires creator attention when the latest successful preflight is stale or missing', async () => {
    const stale = async () => Response.json({ workflow_runs: [{ conclusion: 'success', updated_at: '2026-06-01T12:00:00.000Z', html_url: 'https://github.test/run/2' }] });
    const missing = async () => Response.json({ workflow_runs: [{ conclusion: 'failure', updated_at: '2026-08-27T12:00:00.000Z' }] });
    await expect(checkSigningPreflightFreshness({ repository: 'surakage/THSV-StreamBridge', fetcher: stale, now })).resolves.toMatchObject({ fresh: false, result: 'failure' });
    await expect(checkSigningPreflightFreshness({ repository: 'surakage/THSV-StreamBridge', fetcher: missing, now })).resolves.toMatchObject({ fresh: false, result: 'failure', ageDays: undefined });
  });
});
