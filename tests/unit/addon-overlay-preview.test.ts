import { describe, expect, it } from 'vitest';
import { buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';

describe('hosted add-on overlay previews', () => {
  it('uses Viewer Spotlight appearance and selected fake public fields without production viewer data', () => {
    const preview = buildAddOnOverlayPreview({
      moduleId: 'thsv.viewer-spotlight', name: 'Viewer Spotlight',
      settings: { showPlatformBadge: false, showPoints: true, showLevel: false, showLatestAchievement: false, showObservedSessions: true, showObservedMessages: true, showObservedCommands: false, showEngagementScore: true, showSeasonRank: true, durationSeconds: 14, displayMode: 'fade-carousel', backgroundMode: 'solid', backgroundColor: '#102030', backgroundOpacity: 0.7, accentColor: '#abcdef', textColor: '#fedcba', fontFamily: 'serif' },
    });
    expect(preview).toEqual({
      title: 'Preview Viewer', text: '2,450 points • 14 observed sessions • 328 observed messages • 512 engagement score • #3 of 24 this month', durationMs: 14_000, preview: true,
      presentationMode: 'fade-carousel',
      style: { backgroundMode: 'solid', backgroundColor: '#102030', backgroundOpacity: 0.7, accentColor: '#abcdef', textColor: '#fedcba', fontFamily: 'serif' },
    });
    expect(JSON.stringify(preview)).not.toMatch(/viewer-one|userId|avatar|chat text/iu);
  });

  it('fails closed to bounded Viewer Spotlight preview styles and preserves generic add-on previews', () => {
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.viewer-spotlight', name: 'Viewer Spotlight', settings: { durationSeconds: 999, backgroundMode: 'url(javascript:bad)', backgroundColor: 'red', backgroundOpacity: 5, accentColor: '#nothex', textColor: null, fontFamily: 'remote-font' } })).toMatchObject({
      title: 'Preview Viewer • Twitch', durationMs: 60_000,
      style: { backgroundMode: 'glass', backgroundColor: '#140d1f', backgroundOpacity: 1, accentColor: '#7ff5cc', textColor: '#ffffff', fontFamily: 'broadcast' },
    });
    expect(buildAddOnOverlayPreview({ moduleId: 'sample.status', name: 'Status', settings: {} })).toEqual({ title: 'Status', text: 'Overlay connection and scoped publication are working.', durationMs: 5_000, preview: true });
  });

  it('uses a realistic bounded Village Roll Call leaderboard preview', () => {
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.village-roll-call', name: 'Village Roll Call', settings: { cardSeconds: 30 } })).toEqual({
      title: 'VILLAGE ROLL CALL • PREVIEW',
      text: '1. Example Villager (7) • 2. CozySloth (5) • 3. Early Bird (4)',
      durationMs: 30_000,
      preview: true,
    });
  });

  it('builds a bounded server-authoritative Prize Wheel preview', () => {
    expect(buildAddOnOverlayPreview({
      moduleId: 'thsv.prize-wheel', name: 'Prize Wheel',
      settings: { options: ['Tea', 'Coffee', 'Water'], spinSeconds: 7, winnerCardSeconds: 5, wheelTitle: 'Pick a drink', backgroundColor: '#102030', wheelColors: ['#112233', 'bad'], textColor: '#ffffff', accentColor: '#ffd166', winnerColor: '#7ff5cc' },
    })).toMatchObject({
      title: 'Pick a drink', options: ['Tea', 'Coffee', 'Water'], winnerIndex: 1, winner: 'Coffee',
      spinDurationMs: 7_000, winnerDurationMs: 5_000, preview: true,
      style: { backgroundColor: '#102030', wheelColors: ['#112233'], textColor: '#ffffff', accentColor: '#ffd166', winnerColor: '#7ff5cc' },
    });
  });

  it('builds a responsive Village Draw winner preview without entrant data', () => {
    expect(buildAddOnOverlayPreview({
      moduleId: 'thsv.village-draw', name: 'Village Draw',
      settings: { giveawayName: 'Cozy Draw', prizeItem: 'Game Key', cardSeconds: 15, backgroundColor: '#102030', winnerColor: '#abcdef', textColor: '#fedcba', fontFamily: 'serif', prizeImageUrl: 'javascript:bad' },
    })).toEqual({
      title: 'WINNER • Example Villager', text: 'Game Key • Cozy Draw', imageUrl: '', durationMs: 15_000, preview: true,
      style: { backgroundMode: 'glass', backgroundColor: '#102030', backgroundOpacity: 0.94, accentColor: '#abcdef', textColor: '#fedcba', fontFamily: 'serif', fontSize: 34 },
    });
  });
});
