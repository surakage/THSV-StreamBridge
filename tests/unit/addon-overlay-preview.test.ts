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
});
