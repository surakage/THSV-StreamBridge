import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { archiveTrackerRollover, readMonthlyTrackerReports, summarizeTracker } from '../../bridge/services/monthly-tracker-reports.js';
describe('monthly tracker archives', () => {
  it('archives ranked participation before reset, combines trackers and strips private identities and pending arguments', async () => {
    const root = await mkdtemp(join(tmpdir(),'thsv-recap-'));
    try {
      const old = { leaderboardMonth: '2026-09', leaderboard: [{ userId: 'private-id', displayName: 'Village Winner', points: 5, placements: [1,0,0,0,0] }], pending: { accessToken: 'do-not-copy' } };
      expect(await archiveTrackerRollover(root,'thsv.first-five', old, { leaderboardMonth: '2026-10', leaderboard: [] })).toBe(true);
      await archiveTrackerRollover(root,'thsv.village-roll-call', { month:'2026-09', entries:[{ displayName:'Village Winner',count:12 }] }, {month:'2026-10'});
      const reports = await readMonthlyTrackerReports(root);
      expect(reports[0]?.['trackers']).toHaveLength(2);
      expect(JSON.stringify(reports)).not.toContain('private-id'); expect(JSON.stringify(reports)).not.toContain('do-not-copy');
      expect(await archiveTrackerRollover(root,'thsv.first-five',old,old)).toBe(false);
      expect(await archiveTrackerRollover(root,'../../outside',old,{leaderboardMonth:'2026-10'})).toBe(false);
    } finally { await rm(root,{recursive:true,force:true}); }
  });
  it('totals only monthly participation, rather than resetting lifetime balances or analytics', () => {
    expect(summarizeTracker('thsv.community-analytics',{ season:{ viewers:{ a:{messages:5,commands:2,sessions:1},b:{messages:3,sessions:1} } },viewers:{a:{points:999}} })).toEqual({participants:2,messages:8,commands:2,attendance:2});
  });
});
