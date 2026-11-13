// The free and Pro split: which parts of StreamBridge need a Pro licence once the paid release starts.
//
// This file is only the list. Nothing here turns a feature off: while PLAN_ENFORCED is false (the whole beta)
// the Wizard shows a "Pro" label and every feature keeps working for everyone. Rules agreed for the day it is
// switched on: a change of plan applies at the next start and never in the middle of a stream, a licence that
// cannot be re-checked keeps working for the offline grace period, locked features stay visible, and nothing a
// creator saved is deleted when a licence ends.

/** False for the whole 4.x beta. Turning this on is a 5.0 decision and needs the store to be live first. */
export const PLAN_ENFORCED = false;

/** How many streaming platforms the free plan connects at once. Pro connects all of them. */
export const FREE_PLATFORM_LIMIT = 2;

/**
 * Extensions that belong to Pro. Everything not listed is free, so a new extension is free until it is added
 * here. Channel point redemptions (Fan Crown, First Five, Reward Timers), safety and accessibility (Chat Guard, Accessibility Captions, Stream Break & End Guard, Hydration
 * Station) and the scene and chat basics are free on purpose and must stay out of this list.
 */
export const PRO_MODULE_IDS: readonly string[] = [
  'thsv.category-pilot',
  'thsv.chat-play-pack',
  'thsv.clip-courier',
  'thsv.clip-library-cache',
  'thsv.community-analytics',
  'thsv.discord-chat-archive',
  'thsv.end-credits',
  'thsv.face-filters',
  'thsv.free-game-check',
  'thsv.prize-wheel',
  'thsv.random-clip-player',
  'thsv.scoreboard',
  'thsv.stream-bingo',
  'thsv.streamer-punishments',
  'thsv.subathon-timer',
  'thsv.viewer-lobby',
  'thsv.viewer-spotlight',
  'thsv.village-draw',
  'thsv.village-jukebox',
  'thsv.village-roll-call',
  'thsv.voice-relay',
];

/** Never Pro, whatever the list above says: a creator must always be able to keep chat safe and accessible. */
export const ALWAYS_FREE_MODULE_IDS: readonly string[] = [
  'thsv.accessibility-captions',
  'thsv.chat-guard',
  'thsv.stream-session-guard',
  'thsv.village-hydration-station',
  'thsv.viewer-foundation',
];

export interface LicencePlan {
  /** The plan this PC is on. During the beta a PC without a licence is still 'free'; nothing is locked. */
  readonly tier: 'free' | 'pro';
  /** True only when the limits below are really applied. False for the whole beta. */
  readonly enforced: boolean;
  /** Platforms the free plan connects at once. */
  readonly freePlatformLimit: number;
  /** Module ids of the Pro extensions, so the Wizard can label them. */
  readonly proModuleIds: readonly string[];
}

export function isProModule(moduleId: string): boolean {
  return PRO_MODULE_IDS.includes(moduleId) && !ALWAYS_FREE_MODULE_IDS.includes(moduleId);
}

export function licencePlan(licensed: boolean, enforced: boolean = PLAN_ENFORCED): LicencePlan {
  return { tier: licensed ? 'pro' : 'free', enforced, freePlatformLimit: FREE_PLATFORM_LIMIT, proModuleIds: PRO_MODULE_IDS.filter(isProModule) };
}

/** True when this module may run. Always true while the plan is not enforced. */
export function moduleAllowed(plan: LicencePlan, moduleId: string): boolean {
  return !plan.enforced || plan.tier === 'pro' || !plan.proModuleIds.includes(moduleId);
}

/** How many platforms this plan may connect at once; undefined means no limit. */
export function platformLimit(plan: LicencePlan): number | undefined {
  return plan.enforced && plan.tier === 'free' ? plan.freePlatformLimit : undefined;
}

/** The platforms a creator streams on. Donation and alert sources (Streamlabs, Ko-fi, StreamElements) never count towards the limit. */
export const STREAMING_PLATFORM_IDS: readonly string[] = ['twitch', 'youtube', 'kick', 'tiktok', 'facebook'];

export interface PlanAtStart {
  /** The plan that was in force when StreamBridge started. It stays in force until the next start, so nothing changes during a stream. */
  readonly tier: LicencePlan['tier'];
  readonly enforced: boolean;
  /** Streaming platforms that were turned on in the settings but left off at this start because the free plan connects fewer. */
  readonly withheldPlatforms: readonly string[];
  /** Pro extensions that were turned on in the settings but not started at this start. */
  readonly withheldModules: readonly string[];
}

/**
 * Splits the streaming platforms that are turned on into the ones this plan connects and the ones it leaves off.
 * The first ones in the order given are kept, so the caller decides the order (the settings file order today).
 * Platforms that are not streaming platforms are always kept.
 */
export function platformsForPlan(plan: LicencePlan, enabledPlatformIds: readonly string[]): { readonly allowed: readonly string[]; readonly withheld: readonly string[] } {
  const limit = platformLimit(plan);
  if (limit === undefined) return { allowed: [...enabledPlatformIds], withheld: [] };
  const allowed: string[] = [];
  const withheld: string[] = [];
  let streaming = 0;
  for (const id of enabledPlatformIds) {
    if (!STREAMING_PLATFORM_IDS.includes(id)) { allowed.push(id); continue; }
    if (streaming < limit) { allowed.push(id); streaming += 1; } else withheld.push(id);
  }
  return { allowed, withheld };
}

/**
 * Returns the settings as this plan runs them: the same object when nothing is limited, otherwise a copy in which
 * the withheld streaming platforms are switched off. The settings file itself is never changed, so a creator who
 * buys Pro gets every platform back at the next start without setting anything up again.
 */
export function settingsForPlan<Config extends { readonly platforms: Readonly<Record<string, { readonly enabled: boolean }>> }>(plan: LicencePlan, config: Config): { readonly config: Config; readonly withheldPlatforms: readonly string[] } {
  const enabled = Object.entries(config.platforms).filter(([, platform]) => platform.enabled).map(([id]) => id);
  const { withheld } = platformsForPlan(plan, enabled);
  if (withheld.length === 0) return { config, withheldPlatforms: [] };
  const platforms = Object.fromEntries(Object.entries(config.platforms).map(([id, platform]) => [id, withheld.includes(id) ? { ...platform, enabled: false } : platform]));
  return { config: { ...config, platforms }, withheldPlatforms: withheld };
}
