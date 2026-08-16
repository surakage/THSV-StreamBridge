import { describe, expect, it } from 'vitest';
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
    expect(mainFeatureModuleIds('community-insights')).toEqual(['thsv.follower-pulse', 'thsv.community-analytics']);
    expect(mainFeatureModuleIds('community-play')).toEqual(['thsv.custom-counter', 'thsv.chat-play-pack', 'thsv.village-fun-commands']);
    expect(mainFeatureModuleIds('voice-language')).toEqual(['thsv.voice-relay', 'thsv.user-translate']);
    for (const family of MAIN_FEATURE_FAMILIES) {
      expect(family.managementMode).toBe('bridge-managed-components');
      expect(family.modules.length).toBeGreaterThan(0);
    }
  });

  it('keeps timer and media surfaces independent from the foreground card queue', () => {
    expect(MAIN_FEATURE_PRESENTATION_POLICY.contractVersion).toBe('1.0.0');
    expect(MAIN_FEATURE_PRESENTATION_POLICY.timerLane).toEqual(expect.arrayContaining(['thsv.ad-break-companion', 'thsv.starting-soon-countdown']));
    expect(MAIN_FEATURE_PRESENTATION_POLICY.mediaLane).toEqual(expect.arrayContaining(['thsv.raid-scout', 'thsv.random-clip-player']));
    expect(MAIN_FEATURE_PRESENTATION_POLICY.foregroundQueue).not.toContain('thsv.ad-break-companion');
    expect(MAIN_FEATURE_PRESENTATION_POLICY.backgroundOnly).toEqual(expect.arrayContaining(['thsv.chat-guard', 'thsv.discord-chat-archive', 'thsv.quote-vault']));
  });
});
