import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { MAIN_FEATURE_FAMILIES, MAIN_FEATURE_PRESENTATION_POLICY, mainFeatureModuleIds } from '../../bridge/core/main-feature-registry.js';

describe('main feature registry', () => {
  it('owns every primary component once while allowing explicit cross-feature relationships', () => {
    expect(MAIN_FEATURE_FAMILIES.map((family) => family.id)).toEqual([
      'broadcast-director', 'clip-engine', 'community-rewards', 'community-messaging',
      'community-insights', 'community-play', 'voice-language',
    ]);
    const primary = MAIN_FEATURE_FAMILIES.flatMap((family) => family.modules);
    expect(new Set(primary).size).toBe(primary.length);
    expect(mainFeatureModuleIds('clip-engine', true)).toContain('thsv.raid-scout');
    expect(mainFeatureModuleIds('clip-engine')).not.toContain('thsv.raid-scout');
    expect(mainFeatureModuleIds('community-insights')).toEqual(['thsv.follower-pulse', 'thsv.goal-bars', 'thsv.scoreboard', 'thsv.lurk-tracker', 'thsv.stream-labels']);
    expect(mainFeatureModuleIds('community-insights', true)).toContain('thsv.community-analytics');
    expect(mainFeatureModuleIds('community-play')).toEqual(['thsv.custom-counter', 'thsv.chat-play-pack', 'thsv.village-fun-commands', 'thsv.face-filters', 'thsv.streamer-punishments', 'thsv.magic-eight-ball', 'thsv.village-polls', 'thsv.polls-predictions', 'thsv.village-draw', 'thsv.prize-wheel', 'thsv.village-jukebox', 'thsv.viewer-lobby']);
    expect(mainFeatureModuleIds('voice-language')).toEqual(['thsv.voice-relay', 'thsv.user-translate', 'thsv.accessibility-captions']);
    for (const family of MAIN_FEATURE_FAMILIES) {
      expect(family.managementMode).toBe('bridge-managed-components');
      expect(family.modules.length).toBeGreaterThan(0);
    }
  });

  it('keeps timer and media surfaces independent from the foreground card queue', () => {
    expect(MAIN_FEATURE_PRESENTATION_POLICY.contractVersion).toBe('1.0.0');
    expect(MAIN_FEATURE_PRESENTATION_POLICY.timerLane).toEqual(expect.arrayContaining(['thsv.ad-break-companion', 'thsv.starting-soon-countdown', 'thsv.stream-session-guard']));
    expect(MAIN_FEATURE_PRESENTATION_POLICY.mediaLane).toEqual(expect.arrayContaining(['thsv.raid-scout', 'thsv.random-clip-player']));
    expect(MAIN_FEATURE_PRESENTATION_POLICY.foregroundQueue).not.toContain('thsv.ad-break-companion');
    expect(MAIN_FEATURE_PRESENTATION_POLICY.backgroundOnly).toEqual(expect.arrayContaining(['thsv.chat-guard', 'thsv.discord-chat-archive', 'thsv.quote-vault']));
  });

  it('maps every grouped component to a package that can be bundled with a fresh installation', async () => {
    for (const moduleId of MAIN_FEATURE_FAMILIES.flatMap((family) => family.modules)) {
      const folders = ['accessibility-captions', 'ad-break-companion', 'automated-shoutouts', 'category-pilot', 'creator-controls', 'end-credits', 'free-game-check', 'lurk-tracker', 'polls-predictions', 'prize-wheel', 'stream-labels', 'subathon-timer', 'viewer-lobby', 'village-draw', 'village-jukebox', 'village-polls', 'chat-guard', 'chat-play-pack', 'chatter-greeting', 'clip-courier', 'clip-library-cache', 'custom-counter', 'discord-chat-archive', 'face-filters', 'fan-crown', 'first-five', 'goal-bars', 'follower-pulse', 'live-beacon', 'magic-eight-ball', 'quote-vault', 'raid-scout', 'scoreboard', 'random-clip-player', 'scene-actions', 'scene-gates', 'starting-soon-countdown', 'stream-session-guard', 'streamer-punishments', 'user-translate', 'viewer-spotlight', 'village-fun-commands', 'village-hydration-station', 'village-roll-call', 'voice-relay'];
      const matches = [];
      for (const folder of folders) {
        const descriptor = JSON.parse(await readFile(`addons/${folder}/module-package.json`, 'utf8')) as { manifest: { moduleId: string } };
        if (descriptor.manifest.moduleId === moduleId) matches.push(folder);
      }
      expect(matches, `${moduleId} must map to exactly one bundled extension package`).toHaveLength(1);
    }
  });
});
