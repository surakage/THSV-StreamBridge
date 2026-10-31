import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { NormalizedEvent } from '../../schemas/event.js';
import { buildNormalizedEvent } from '../adapters/normalization.js';
import type { RunningModuleSnapshot } from '../core/module-registry.js';
import { CONSOLE_PLATFORMS, consoleTitleKey, type ConsolePlatform, type ConsolePlatformStatus } from './console-presence.js';

// The Stream info pop-out applies a title and categories right away through Creator Controls'
// existing Provider Controller path. It hands Creator Controls one control event that only this
// service can produce (its source adapter is never used by Streamer.bot relays or simulations),
// then waits for the controller's per-platform result.

export const CREATOR_CONTROLS_MODULE_ID = 'thsv.creator-controls';
export const CATEGORY_PILOT_MODULE_ID = 'thsv.category-pilot';
export const STREAM_INFO_SOURCE_ADAPTER = 'stream-info-page';
export const CONSOLE_PRESENCE_SOURCE_ADAPTER = 'console-presence';
export const CONSOLE_DETECTED_EVENT = 'addon.thsv.category-pilot.console-detected';
const CONTROL_EVENT = 'addon.thsv.creator-controls.control';
const RESULT_EVENT = 'addon.thsv.creator-controls.result';
const PROVIDER_CONTROLLER_ACTION_ID = '183afef4-fc53-4337-859f-c9fe6d1961e1';
const PROFILE_IDS = ['profile-1', 'profile-2', 'profile-3'] as const;
const PLATFORMS = ['twitch', 'youtube', 'kick'] as const;
const RESULT_TIMEOUT_MS = 30_000;
const MAXIMUM_TRACKED_REQUESTS = 20;

export class StreamInfoError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

const applySchema = z.object({
  profileId: z.enum(PROFILE_IDS),
  platforms: z.array(z.enum(PLATFORMS)).min(1, 'Tick at least one platform.').max(3),
  title: z.string().max(400),
  twitchCategoryId: z.string().max(40),
  youtubeCategoryName: z.string().max(400),
  kickCategoryName: z.string().max(400),
}).strict();

export interface StreamInfoProfile {
  readonly id: typeof PROFILE_IDS[number];
  readonly name: string;
  readonly enabled: boolean;
  readonly platforms: readonly string[];
  readonly title: string;
  readonly twitchCategoryId: string;
  readonly youtubeCategoryName: string;
  readonly kickCategoryName: string;
}

export interface ConsoleGameMapping { readonly console: 'any' | ConsolePlatform; readonly titleName: string; readonly profileId: string }

export interface StreamInfoServiceDependencies {
  readonly runningModule: (moduleId: string) => RunningModuleSnapshot | undefined;
  readonly streamerBotConnected: () => boolean;
  readonly ingest: (event: NormalizedEvent) => Promise<unknown>;
  readonly consoleStatus?: () => Readonly<Record<ConsolePlatform, ConsolePlatformStatus>>;
  readonly now?: () => number;
}

interface TrackedRequest { readonly profileId: string; readonly platforms: readonly string[]; readonly startedAt: number; result?: { readonly success: boolean; readonly results: readonly { readonly platform: string; readonly success: boolean }[] } }

function clean(value: unknown, maximum: number): string {
  return typeof value === 'string' ? Array.from(value.replace(/[\p{Cc}]+/gu, ' ').replace(/\s+/gu, ' ').trim()).slice(0, maximum).join('') : '';
}

export function profilesFromSettings(settings: Readonly<Record<string, unknown>>): readonly StreamInfoProfile[] {
  return PROFILE_IDS.map((id, index) => {
    const prefix = `profile${String(index + 1)}`;
    const platforms = settings[`${prefix}Platforms`];
    return {
      id,
      name: clean(settings[`${prefix}Name`], 80) || `Profile ${String(index + 1)}`,
      enabled: settings[`${prefix}Enabled`] === true,
      platforms: Array.isArray(platforms) ? platforms.filter((value): value is string => typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value)) : [],
      title: clean(settings[`${prefix}Title`], 100),
      twitchCategoryId: clean(settings[`${prefix}TwitchCategoryId`], 20),
      youtubeCategoryName: clean(settings[`${prefix}YoutubeCategoryName`], 100),
      kickCategoryName: clean(settings[`${prefix}KickCategoryName`], 100),
    };
  });
}

export function consoleMappingsFromSettings(settings: Readonly<Record<string, unknown>>): readonly ConsoleGameMapping[] {
  const mappings: ConsoleGameMapping[] = [];
  for (let number = 1; number <= 5; number += 1) {
    const titleName = clean(settings[`console${String(number)}TitleName`], 100);
    const profileId = clean(settings[`console${String(number)}Profile`], 20);
    const platform = settings[`console${String(number)}Platform`];
    const consoleId = platform === 'xbox' || platform === 'playstation' ? platform : 'any';
    if (settings[`console${String(number)}Enabled`] === true && titleName !== '' && (PROFILE_IDS as readonly string[]).includes(profileId)) mappings.push({ console: consoleId, titleName, profileId });
  }
  return mappings;
}

export function matchConsoleGame(mappings: readonly ConsoleGameMapping[], platform: ConsolePlatform, titleName: string): ConsoleGameMapping | undefined {
  const key = consoleTitleKey(titleName);
  if (key === '') return undefined;
  return mappings.find((mapping) => (mapping.console === 'any' || mapping.console === platform) && consoleTitleKey(mapping.titleName) === key);
}

export class StreamInfoService {
  private readonly requests = new Map<string, TrackedRequest>();

  public constructor(private readonly dependencies: StreamInfoServiceDependencies) {}

  private now(): number { return this.dependencies.now?.() ?? Date.now(); }

  public status(): Readonly<Record<string, unknown>> {
    const creator = this.dependencies.runningModule(CREATOR_CONTROLS_MODULE_ID);
    const pilot = this.dependencies.runningModule(CATEGORY_PILOT_MODULE_ID);
    const creatorRunning = creator?.status === 'healthy';
    const creatorOn = creatorRunning && creator.settings['enabled'] === true;
    const pilotOn = pilot?.status === 'healthy' && pilot.settings['enabled'] === true;
    const consoleStatus = this.dependencies.consoleStatus?.();
    const mappings = pilotOn ? consoleMappingsFromSettings(pilot.settings) : [];
    const consoles = consoleStatus === undefined ? undefined : Object.fromEntries(CONSOLE_PLATFORMS.map((platform) => {
      const entry = consoleStatus[platform];
      const match = entry.titleName === '' ? undefined : matchConsoleGame(mappings, platform, entry.titleName);
      return [platform, { ...entry, enabled: pilotOn && entry.enabled, ...(match === undefined ? {} : { profileId: match.profileId }) }];
    }));
    return {
      streamerBotConnected: this.dependencies.streamerBotConnected(),
      creatorControls: {
        installed: creator !== undefined,
        running: creatorRunning,
        enabled: creatorOn,
        controllerApproved: creator?.approvedActionIds.map((id) => id.toLowerCase()).includes(PROVIDER_CONTROLLER_ACTION_ID) === true,
        profiles: creatorOn ? profilesFromSettings(creator.settings) : [],
      },
      categoryPilot: { installed: pilot !== undefined, enabled: pilotOn, consoleGames: mappings, ...(consoles === undefined ? {} : { consoles }) },
    };
  }

  public async apply(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const checked = applySchema.safeParse(input);
    if (!checked.success) throw new StreamInfoError(400, checked.error.issues[0]?.message === 'Tick at least one platform.' ? 'Tick at least one platform.' : 'Choose a profile and fill in the title and categories.');
    const parsed = checked.data;
    if (!this.dependencies.streamerBotConnected()) throw new StreamInfoError(409, 'Streamer.bot is not connected. Start Streamer.bot, then try again.');
    const creator = this.dependencies.runningModule(CREATOR_CONTROLS_MODULE_ID);
    if (creator === undefined) throw new StreamInfoError(409, 'Creator Controls is not installed.');
    if (creator.status !== 'healthy' || creator.settings['enabled'] !== true) throw new StreamInfoError(409, 'Creator Controls is off. Turn it on in the Wizard, save, then restart StreamBridge.');
    if (!creator.approvedActionIds.map((id) => id.toLowerCase()).includes(PROVIDER_CONTROLLER_ACTION_ID)) throw new StreamInfoError(409, 'Approve the Creator Controls Provider Controller in the Wizard first.');
    const profile = profilesFromSettings(creator.settings).find((candidate) => candidate.id === parsed.profileId);
    if (profile === undefined || !profile.enabled) throw new StreamInfoError(409, 'This profile is turned off in the Wizard.');
    const title = clean(parsed.title, 100);
    const twitchCategoryId = clean(parsed.twitchCategoryId, 20);
    if (!/^[0-9]*$/u.test(twitchCategoryId)) throw new StreamInfoError(400, 'The Twitch category ID must be digits only.');
    const youtubeCategoryName = clean(parsed.youtubeCategoryName, 100);
    const kickCategoryName = clean(parsed.kickCategoryName, 100);
    if (title === '' && twitchCategoryId === '' && youtubeCategoryName === '' && kickCategoryName === '') throw new StreamInfoError(400, 'Type a title or at least one category.');
    const platforms = [...new Set(parsed.platforms)];
    const requestId = `stream-info-${randomUUID()}`;
    this.prune();
    this.requests.set(requestId, { profileId: parsed.profileId, platforms, startedAt: this.now() });
    try {
      await this.dependencies.ingest(buildNormalizedEvent({
        eventType: CONTROL_EVENT, platform: 'system', adapter: STREAM_INFO_SOURCE_ADAPTER, sourceEventName: 'Stream info pop-out', sourceEventId: requestId,
        channel: { name: 'system' },
        payload: { profileId: parsed.profileId, platforms, title, twitchCategoryId, youtubeCategoryName, kickCategoryName },
      }));
    } catch (error) { this.requests.delete(requestId); throw error; }
    return { requestId, profileId: parsed.profileId, platforms };
  }

  public result(requestId: string): Readonly<Record<string, unknown>> {
    const tracked = this.requests.get(requestId);
    if (tracked === undefined) throw new StreamInfoError(404, 'This update is no longer tracked. Check the platforms directly.');
    if (tracked.result !== undefined) return { requestId, state: 'done', success: tracked.result.success, platforms: tracked.platforms, results: tracked.result.results };
    if (this.now() - tracked.startedAt > RESULT_TIMEOUT_MS) return { requestId, state: 'timeout', platforms: tracked.platforms, results: [] };
    return { requestId, state: 'pending', platforms: tracked.platforms, results: [] };
  }

  /** Receives every accepted bridge event; keeps only Provider Controller results for this page. */
  public observe(event: NormalizedEvent): void {
    if (event.eventType !== RESULT_EVENT || event.metadata.simulated) return;
    const requestId = clean(event.payload['requestId'], 100);
    const tracked = this.requests.get(requestId);
    if (tracked === undefined || tracked.result !== undefined || clean(event.payload['profileId'], 20) !== tracked.profileId) return;
    const raw = Array.isArray(event.payload['results']) ? event.payload['results'] : [];
    const results = raw.flatMap((item) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
      const platform = (item as Record<string, unknown>)['platform'];
      return typeof platform === 'string' && (PLATFORMS as readonly string[]).includes(platform) ? [{ platform, success: (item as Record<string, unknown>)['success'] === true }] : [];
    }).slice(0, 3);
    tracked.result = { success: event.payload['success'] === true && results.length > 0 && results.every((item) => item.success), results };
  }

  private prune(): void {
    const cutoff = this.now() - 5 * 60_000;
    for (const [id, tracked] of this.requests) if (tracked.startedAt < cutoff) this.requests.delete(id);
    while (this.requests.size >= MAXIMUM_TRACKED_REQUESTS) { const oldest = this.requests.keys().next().value; if (oldest === undefined) break; this.requests.delete(oldest); }
  }
}

/** Category Pilot's running console-check settings, or undefined when it is not running. */
export function consolePresenceSettings(snapshot: RunningModuleSnapshot | undefined): { enabled: boolean; requireLive: boolean; intervalSeconds: number; xbox: boolean; playstation: boolean } | undefined {
  if (snapshot === undefined || snapshot.status !== 'healthy') return undefined;
  const settings = snapshot.settings;
  const interval = settings['intervalSeconds'];
  return {
    enabled: settings['enabled'] === true,
    requireLive: settings['requireLive'] !== false,
    intervalSeconds: typeof interval === 'number' && Number.isInteger(interval) ? Math.min(300, Math.max(10, interval)) : 20,
    xbox: settings['xboxEnabled'] === true,
    playstation: settings['playstationEnabled'] === true,
  };
}

export function consoleDetectedEvent(platform: ConsolePlatform, titleName: string): NormalizedEvent {
  return buildNormalizedEvent({
    eventType: CONSOLE_DETECTED_EVENT, platform: 'system', adapter: CONSOLE_PRESENCE_SOURCE_ADAPTER, sourceEventName: 'Console game check',
    sourceEventId: `console-presence-${platform}-${randomUUID()}`, channel: { name: 'system' }, payload: { console: platform, titleName },
  });
}
