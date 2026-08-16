export interface MainFeatureFamily {
  readonly id: 'broadcast-director' | 'clip-engine' | 'community-rewards' | 'community-messaging' | 'community-insights' | 'community-play' | 'voice-language';
  readonly name: string;
  readonly description: string;
  readonly managementMode: 'bridge-managed-components';
  readonly modules: readonly string[];
  readonly relatedModules: readonly string[];
}

export const MAIN_FEATURE_FAMILIES: readonly MainFeatureFamily[] = Object.freeze([
  Object.freeze({
    id: 'broadcast-director',
    name: 'Broadcast Director',
    description: 'One stream lifecycle from Starting Soon through ads, raid, and every broadcast output stopping.',
    managementMode: 'bridge-managed-components',
    modules: Object.freeze(['thsv.live-beacon', 'thsv.starting-soon-countdown', 'thsv.scene-actions', 'thsv.ad-break-companion', 'thsv.raid-scout']),
    relatedModules: Object.freeze([]),
  }),
  Object.freeze({
    id: 'clip-engine',
    name: 'Clip Engine',
    description: 'One shared Twitch library, download cache, media owner, rotation history, and playback surface.',
    managementMode: 'bridge-managed-components',
    modules: Object.freeze(['thsv.clip-library-cache', 'thsv.random-clip-player', 'thsv.clip-courier']),
    relatedModules: Object.freeze(['thsv.raid-scout']),
  }),
  Object.freeze({
    id: 'community-rewards',
    name: 'Community Rewards',
    description: 'Separate reward experiences using the same redemption, refund, identity, and overlay-queue foundations.',
    managementMode: 'bridge-managed-components',
    modules: Object.freeze(['thsv.first-five', 'thsv.fan-crown', 'thsv.viewer-spotlight', 'thsv.village-roll-call', 'thsv.village-hydration-station']),
    relatedModules: Object.freeze([]),
  }),
  Object.freeze({
    id: 'community-messaging',
    name: 'Community Messaging',
    description: 'Shared normalized chat, bot exclusions, moderation filtering, formatting, and delivery boundaries.',
    managementMode: 'bridge-managed-components',
    modules: Object.freeze(['thsv.automated-shoutouts', 'thsv.discord-chat-archive', 'thsv.chat-guard', 'thsv.quote-vault']),
    relatedModules: Object.freeze([]),
  }),
  Object.freeze({
    id: 'community-insights',
    name: 'Community Insights',
    description: 'Private follower reconciliation and cross-platform community trends in one local, identity-safe reporting surface.',
    managementMode: 'bridge-managed-components',
    modules: Object.freeze(['thsv.follower-pulse', 'thsv.community-analytics']),
    relatedModules: Object.freeze([]),
  }),
  Object.freeze({
    id: 'community-play',
    name: 'Community Play',
    description: 'Counters, chat games, and lightweight community commands managed as one interactive stream toolkit.',
    managementMode: 'bridge-managed-components',
    modules: Object.freeze(['thsv.custom-counter', 'thsv.chat-play-pack', 'thsv.village-fun-commands']),
    relatedModules: Object.freeze([]),
  }),
  Object.freeze({
    id: 'voice-language',
    name: 'Voice & Language',
    description: 'Bounded viewer speech and privacy-gated translation through one accessible communication surface.',
    managementMode: 'bridge-managed-components',
    modules: Object.freeze(['thsv.voice-relay', 'thsv.user-translate']),
    relatedModules: Object.freeze([]),
  }),
]);

export const MAIN_FEATURE_PRESENTATION_POLICY = Object.freeze({
  contractVersion: '1.0.0',
  foregroundQueue: Object.freeze([
    'thsv.automated-shoutouts',
    'thsv.fan-crown',
    'thsv.first-five',
    'thsv.raid-scout',
    'thsv.viewer-spotlight',
    'thsv.village-hydration-station',
    'thsv.village-roll-call',
  ]),
  mediaLane: Object.freeze(['thsv.raid-scout', 'thsv.random-clip-player']),
  timerLane: Object.freeze(['thsv.ad-break-companion', 'thsv.starting-soon-countdown']),
  backgroundOnly: Object.freeze(['thsv.chat-guard', 'thsv.discord-chat-archive', 'thsv.quote-vault', 'thsv.follower-pulse', 'thsv.community-analytics', 'thsv.user-translate', 'thsv.village-fun-commands']),
  behavior: Object.freeze({
    foreground: 'Serialized with a bounded gap so transient cards do not overlap.',
    media: 'Dispatched independently and tracked by playback lifecycle.',
    timer: 'Dispatched independently and never occupies a foreground slot.',
    background: 'Does not occupy an overlay presentation slot.',
  }),
});

export function mainFeatureModuleIds(id: MainFeatureFamily['id'], includeRelated = false): readonly string[] {
  const family = MAIN_FEATURE_FAMILIES.find((candidate) => candidate.id === id);
  if (family === undefined) return Object.freeze([]);
  return includeRelated ? Object.freeze([...family.modules, ...family.relatedModules]) : family.modules;
}
