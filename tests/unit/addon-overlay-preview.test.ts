import { describe, expect, it } from 'vitest';
import { buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';

describe('hosted add-on overlay previews', () => {
  it('builds the exact Village Hydration Station fill template', () => {
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.village-hydration-station', name: 'Village Hydration Station', settings: { goalOunces: 80, reminderIntervalMinutes: 30, containerStyle: 'glass', waterColor: '#123456' } })).toMatchObject({
      moduleId: 'thsv.village-hydration-station', cardKind: 'hydration-station', visible: true,
      totalOunces: 40, goalOunces: 80, percentage: 50, reminderIntervalMinutes: 30,
      live: true, preview: true, templatePreview: true,
      style: { containerStyle: 'glass', waterColor: '#123456' },
    });
  });

  it('builds a persistent compact Ad Break timer preview instead of a generic card', () => {
    expect(buildAddOnOverlayPreview({
      moduleId: 'thsv.ad-break-companion', name: 'Ad Break Companion',
      settings: { upcomingLabel: 'BREAK SOON', upcomingMessage: 'Stretch with the village', overlayBackgroundMode: 'solid', overlayBackgroundColor: '#102030', overlayBackgroundOpacity: .75, overlayAccentColor: '#abcdef', overlayTextColor: '#fedcba' },
    })).toMatchObject({
      moduleId: 'thsv.ad-break-companion', variant: 'ad-break', phase: 'scheduled', label: 'BREAK SOON',
      remainingSeconds: 60, maximumSeconds: 60, remainingText: '01:00', running: true, badgeText: 'UPCOMING',
      lastReason: 'Stretch with the village', preview: true,
      style: { backgroundMode: 'solid', backgroundColor: '#102030', backgroundOpacity: .75, accentColor: '#abcdef', textColor: '#fedcba' },
    });
  });

  it('builds a dedicated bounded Automated Shoutouts creator card', () => {
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.automated-shoutouts', name: 'Automated Shoutouts', settings: {} })).toMatchObject({
      cardKind: 'shoutout-spotlight', trigger: 'manual', presentation: 'creator', platform: 'twitch', durationMs: 60_000, preview: true,
      creator: { displayName: 'Example Twitch Streamer', userName: 'example_twitch_streamer', category: 'Just Chatting', channelUrl: 'https://twitch.com/example_twitch_streamer', avatarUrl: '', viewers: 0 },
    });
  });

  it('keeps verified streamer cards Twitch-only and uses viewer cards on every platform', () => {
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.automated-shoutouts', name: 'Automated Shoutouts', settings: {} }, 'creator-twitch')).toMatchObject({
      cardKind: 'shoutout-spotlight', presentation: 'creator', platform: 'twitch', trigger: 'manual', durationMs: 60_000,
    });
    for (const platform of ['twitch', 'youtube', 'kick', 'tiktok']) {
      expect(buildAddOnOverlayPreview({ moduleId: 'thsv.automated-shoutouts', name: 'Automated Shoutouts', settings: {} }, `viewer-${platform}`)).toMatchObject({
        cardKind: 'shoutout-spotlight', presentation: 'welcome', platform, trigger: 'first-chat', durationMs: 60_000,
      });
    }
    for (const platform of ['youtube', 'kick', 'tiktok']) {
      expect(buildAddOnOverlayPreview({ moduleId: 'thsv.automated-shoutouts', name: 'Automated Shoutouts', settings: {} }, `creator-${platform}`)).toMatchObject({
        cardKind: 'shoutout-spotlight', presentation: 'welcome', platform, trigger: 'first-chat', durationMs: 60_000,
      });
    }
  });

  it('uses Viewer Spotlight appearance and selected fake public fields without production viewer data', () => {
    const preview = buildAddOnOverlayPreview({
      moduleId: 'thsv.viewer-spotlight', name: 'Viewer Spotlight',
      settings: { showPlatformBadge: false, showPoints: true, showLevel: false, showLatestAchievement: false, showObservedSessions: true, showObservedMessages: true, showObservedCommands: false, showEngagementScore: true, showSeasonRank: true, durationSeconds: 14, displayMode: 'fade-carousel', backgroundMode: 'solid', backgroundColor: '#102030', backgroundOpacity: 0.7, accentColor: '#abcdef', textColor: '#fedcba', fontFamily: 'serif' },
    });
    expect(preview).toEqual({
      cardKind: 'viewer-spotlight',
      title: 'Preview Viewer', text: '2,450 points • 14 observed sessions • 328 observed messages • 512 engagement score • #3 of 24 this month', durationMs: 14_000, preview: true,
      front: { displayName: 'Preview Viewer', platformLabel: '', viewerType: 'Streamer', category: 'Just Chatting', followStatus: 'following' },
      stats: [
        { label: 'Village Points', value: '2,450' }, { label: 'Sessions', value: '14' },
        { label: 'Messages', value: '328' }, { label: 'Engagement', value: '512' },
        { label: 'Monthly Rank', value: '#3 of 24' },
      ],
      flipToStats: true,
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
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.village-roll-call', name: 'Village Roll Call', settings: { cardSeconds: 30 } })).toMatchObject({
      cardKind: 'village-roll-call', mode: 'preview', headline: 'Village Roll Call',
      monthLabel: 'CURRENT SEASON', durationMs: 30_000, preview: true,
      leaders: [
        { rank: 1, displayName: 'Example Villager', count: 31 },
        { rank: 2, displayName: 'CozySloth', count: 29 },
        { rank: 3, displayName: 'Early Bird', count: 27 },
        { rank: 4, displayName: 'Night Owl', count: 24 },
        { rank: 5, displayName: 'Village Wanderer', count: 21 },
      ],
    });
  });

  it('builds a compact translucent live Village Poll preview', () => {
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.village-polls', name: 'Village Polls', settings: { layout: 'compact', backgroundOpacity: 0.55, showPlatformBreakdown: true } })).toMatchObject({
      cardKind: 'village-polls', state: 'open', totalVotes: 42, preview: true,
      style: { layout: 'compact', backgroundOpacity: 0.55, showPlatformBreakdown: true },
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
      settings: { giveawayName: 'Cozy Draw', prizeItem: 'Game Key', cardSeconds: 15, drawAnimationSeconds: 3, ticketLayout: 'compact', backgroundColor: '#102030', backgroundOpacity: 0.6, winnerColor: '#abcdef', textColor: '#fedcba', fontFamily: 'serif', prizeImageUrl: 'javascript:bad' },
    })).toMatchObject({
      cardKind: 'village-draw', phase: 'winner', giveawayName: 'Cozy Draw', prizeName: 'Game Key', imageUrl: '', durationMs: 15_000, drawAnimationMs: 3_000, preview: true,
      winner: { displayName: 'Example Villager With A Long Name', platform: 'twitch' }, entrantCount: 42, ticketCount: 84,
      style: { backgroundMode: 'glass', layout: 'compact', backgroundColor: '#102030', backgroundOpacity: 0.6, accentColor: '#abcdef', textColor: '#fedcba', fontFamily: 'serif' },
    });
  });

  it('builds a Viewer Lobby queue preview on the queue contract', () => {
    const preview = buildAddOnOverlayPreview({ moduleId: 'thsv.viewer-lobby', name: 'Viewer Lobby', settings: { backgroundMode: 'solid', backgroundColor: '#102030', backgroundOpacity: 0.8, accentColor: '#abcdef', textColor: '#fedcba', fontFamily: 'mono', fontSize: 40 } });
    expect(preview).toMatchObject({ status: 'open', count: 4, selectedEntryId: 'preview-selected', preview: true, style: { backgroundMode: 'solid', backgroundColor: '#102030', backgroundOpacity: 0.8, accentColor: '#abcdef', textColor: '#fedcba', fontFamily: 'mono', fontSize: 40 } });
    expect((preview.entries as unknown[])).toHaveLength(4);
    expect(JSON.stringify(preview)).not.toContain(':id:');
  });

  it('uses the production renderer contracts for every formerly generic visual preview', () => {
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.starting-soon-countdown', name: 'Countdown', settings: { durationMinutes: 12, overlayLabel: 'BEGINNING SOON' } })).toMatchObject({ moduleId: 'thsv.starting-soon-countdown', label: 'BEGINNING SOON', remainingSeconds: 720, templatePreview: true });
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.subathon-timer', name: 'Subathon', settings: { startingMinutes: 90 } })).toMatchObject({ moduleId: 'thsv.subathon-timer', remainingSeconds: 5_400, templatePreview: true });
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.custom-counter', name: 'Counter', settings: { defaultCounterName: 'Deaths', layout: 'vertical' } })).toMatchObject({ name: 'Deaths', value: 42, visible: true, templatePreview: true, style: { layout: 'vertical' } });
    for (const moduleId of ['thsv.random-clip-player', 'thsv.village-jukebox']) expect(buildAddOnOverlayPreview({ moduleId, name: 'Media', settings: {} })).toMatchObject({ templatePreview: true, playbackId: `template-${moduleId}` });
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.accessibility-captions', name: 'Captions', settings: { fontSize: 48 } })).toMatchObject({ templatePreview: true, style: { fontSize: 48 } });
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.voice-relay', name: 'Voice', settings: { overlayFontSize: 44 } })).toMatchObject({ templatePreview: true, presentationMode: 'typewriter', style: { fontSize: 44 } });
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.category-pilot', name: 'Category Pilot', settings: {} })).toMatchObject({ templatePreview: true, title: 'Category Pilot suggestion' });
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.raid-scout', name: 'Raid Scout', settings: { overlayBackgroundColor: '#123456' } })).toMatchObject({ templatePreview: true, title: 'RAID SUGGESTION', style: { backgroundColor: '#123456' } });
  });
});
