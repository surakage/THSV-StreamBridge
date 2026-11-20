import type { NormalizedEvent } from '../../schemas/event.js';
import type { BrowserOverlayHub } from './browser-overlay-hub.js';

/**
 * Overlay test sequence: fires a list of test events on the overlay pages, one at a time with a fixed gap,
 * and records when each one was sent. It is meant for checking a layout in OBS or SprigCast (for example a
 * scene-by-scene test) without an audience.
 *
 * Every step only draws on (or plays from) the overlay pages through the local overlay hub: the same template
 * previews the Wizard's Preview buttons use. Nothing goes to chat, no points, ads, raids, shoutouts, leaderboards,
 * counters or giveaways change, and no outside service is called. It refuses to start while a platform is live.
 */

export type OverlayTestEffect = 'explosion' | 'rain' | 'fireworks';

export interface OverlayTestAddOn {
  readonly moduleId: string;
  readonly name: string;
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface OverlayTestSequenceDependencies {
  readonly hub: Pick<BrowserOverlayHub, 'publishPreview' | 'publishAddOn' | 'publishEmoteWallTrigger' | 'clearAlertPreview' | 'clearChatPreviews' | 'clientConfig'>;
  /** Installed, enabled extensions that may publish to overlays. */
  readonly overlayAddOns: () => Promise<readonly OverlayTestAddOn[]>;
  readonly communityName: () => Promise<string>;
  readonly isLive: () => boolean;
  /** Returns a simulated alert event, or undefined when the platform has no such alert type. */
  readonly buildAlert: (platform: string, alertType: string) => NormalizedEvent | undefined;
  readonly alertTypes: () => readonly (readonly [string, string])[];
  /** A simulated chat message from one platform. */
  readonly buildChat: (platform: string) => NormalizedEvent;
  readonly buildAddOnPreview: (addOn: OverlayTestAddOn, mode: string, community: string) => Readonly<Record<string, unknown>>;
  readonly addOnPreviewTopic: (moduleId: string) => string;
  readonly captions?: { preview(input?: unknown): unknown; clear(reason?: string): unknown };
  readonly now?: () => number;
  readonly setTimer?: (callback: () => void, delayMs: number) => () => void;
}

export interface OverlayTestStepResult {
  readonly index: number;
  readonly step: string;
  readonly label: string;
  readonly page: string;
  readonly sound: boolean;
  readonly plannedAt: string;
  firedAt?: string;
  hiddenAt?: string;
  ok?: boolean;
  error?: string;
}

export interface OverlayTestRun {
  readonly runId: string;
  readonly label: string;
  readonly gapMs: number;
  readonly holdMs: number;
  readonly startedAt: string;
  readonly endsAt: string;
  state: 'running' | 'finished' | 'stopped';
  readonly steps: OverlayTestStepResult[];
}

export class OverlayTestSequenceError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

interface ResolvedStep {
  readonly step: string;
  readonly label: string;
  readonly page: string;
  readonly sound: boolean;
  readonly fire: () => Promise<void> | void;
  /** Takes the test event off the page again; self-expiring events have none. */
  readonly hide?: () => Promise<void> | void;
}

export const OVERLAY_TEST_LIMITS = Object.freeze({ maxSteps: 60, minGapMs: 2_000, maxGapMs: 60_000, defaultGapMs: 8_000, minHoldMs: 1_000 });
const EFFECTS: readonly OverlayTestEffect[] = ['explosion', 'rain', 'fireworks'];
const STEP_PATTERN = /^[a-z][a-z0-9:._-]{0,120}$/u;
const ADD_ON_PAGES: Readonly<Record<string, string>> = {
  'thsv.random-clip-player': '/overlay/clips', 'thsv.starting-soon-countdown': '/overlay/countdown', 'thsv.ad-break-companion': '/overlay/ad-break',
  'thsv.subathon-timer': '/overlay/subathon', 'thsv.automated-shoutouts': '/overlay/shoutouts',
};

export class OverlayTestSequence {
  private run: OverlayTestRun | undefined;
  private cancels: Array<() => void> = [];
  private hides: Array<() => Promise<void> | void> = [];
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => () => void;

  public constructor(private readonly dependencies: OverlayTestSequenceDependencies) {
    this.now = dependencies.now ?? (() => Date.now());
    this.setTimer = dependencies.setTimer ?? ((callback, delayMs) => { const timer = setTimeout(callback, delayMs); timer.unref(); return () => clearTimeout(timer); });
  }

  /** Every step this PC can fire right now, with the page it shows on and whether it plays a sound. */
  public async catalog(): Promise<Readonly<Record<string, unknown>>> {
    const config = this.dependencies.hub.clientConfig();
    const addOns = await this.dependencies.overlayAddOns();
    const steps = [
      ...this.dependencies.alertTypes().map(([platform, alertType]) => ({ step: `alert:${platform}:${alertType}`, label: `Test ${platform} ${alertType} alert`, page: '/overlay/alerts', sound: true, selfHides: true })),
      { step: 'chat', label: 'Sample chat line from every platform', page: '/overlay/chat', sound: false, selfHides: false },
      ...(this.dependencies.captions === undefined ? [] : [{ step: 'captions', label: 'Sample live caption', page: '/overlay/captions', sound: false, selfHides: true }]),
      ...EFFECTS.map((effect) => ({ step: `emote-wall:${effect}`, label: `Emote Wall ${effect}`, page: '/overlay/emote-wall', sound: false, selfHides: true })),
      ...addOns.map((addOn) => ({ step: `addon:${addOn.moduleId}`, label: `${addOn.name} template preview`, page: addOnPage(addOn.moduleId), sound: false, selfHides: false })),
      ...addOns.filter((addOn) => addOn.moduleId === 'thsv.ad-break-companion').map((addOn) => ({ step: `addon:${addOn.moduleId}:active`, label: `${addOn.name} template preview (ad break running)`, page: addOnPage(addOn.moduleId), sound: false, selfHides: false })),
    ];
    return {
      simulated: true, live: this.dependencies.isLive(), alertDurationMs: config.alertDurationMs,
      limits: OVERLAY_TEST_LIMITS, steps,
      note: 'Each step reaches every open copy of its overlay page (horizontal and vertical alike). Alerts play the saved alert sound. Nothing is sent to chat or to any platform.',
    };
  }

  public status(): Readonly<Record<string, unknown>> {
    return this.run === undefined ? { running: false } : { running: this.run.state === 'running', run: this.run };
  }

  public async start(input: unknown): Promise<OverlayTestRun> {
    const record = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : undefined;
    if (record === undefined) throw new OverlayTestSequenceError(400, 'Send {"steps": [...], "gapMs": 8000}.');
    if (record['action'] === 'stop') { await this.stop(); return this.run ?? emptyRun(this.now()); }
    if (this.dependencies.isLive()) throw new OverlayTestSequenceError(409, 'Run overlay tests before or after your stream, not while you are live.');
    if (this.run?.state === 'running') throw new OverlayTestSequenceError(409, 'A test sequence is already running. Stop it first with {"action":"stop"}.');
    const rawSteps = record['steps'];
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) throw new OverlayTestSequenceError(400, 'steps must be a non-empty list, for example ["alert:twitch:follow","addon:thsv.local-clock"].');
    if (rawSteps.length > OVERLAY_TEST_LIMITS.maxSteps) throw new OverlayTestSequenceError(400, `A sequence can have at most ${String(OVERLAY_TEST_LIMITS.maxSteps)} steps.`);
    const gapMs = boundedInteger(record['gapMs'], OVERLAY_TEST_LIMITS.minGapMs, OVERLAY_TEST_LIMITS.maxGapMs, OVERLAY_TEST_LIMITS.defaultGapMs);
    const holdMs = boundedInteger(record['holdMs'], OVERLAY_TEST_LIMITS.minHoldMs, gapMs - 500, gapMs - 1_000);
    const label = typeof record['label'] === 'string' ? Array.from(record['label'].trim()).slice(0, 80).join('') : '';
    const addOns = await this.dependencies.overlayAddOns();
    const community = await this.dependencies.communityName();
    const resolved = rawSteps.map((raw) => this.resolve(raw, addOns, community));
    const startedAt = this.now(); const runId = `test-${startedAt.toString(36)}`;
    const run: OverlayTestRun = {
      runId, label, gapMs, holdMs, startedAt: new Date(startedAt).toISOString(), endsAt: new Date(startedAt + resolved.length * gapMs).toISOString(), state: 'running',
      steps: resolved.map((step, index) => ({ index, step: step.step, label: step.label, page: step.page, sound: step.sound, plannedAt: new Date(startedAt + index * gapMs).toISOString() })),
    };
    this.run = run; this.cancels = []; this.hides = [];
    resolved.forEach((step, index) => {
      this.cancels.push(this.setTimer(() => { void this.fire(run, index, step); }, index * gapMs));
    });
    this.cancels.push(this.setTimer(() => { if (this.run === run && run.state === 'running') run.state = 'finished'; }, resolved.length * gapMs));
    return run;
  }

  public async stop(): Promise<void> {
    for (const cancel of this.cancels.splice(0)) cancel();
    for (const hide of this.hides.splice(0)) { try { await hide(); } catch { /* Best effort: the page clears on its own next preview. */ } }
    if (this.run?.state === 'running') this.run.state = 'stopped';
  }

  private async fire(run: OverlayTestRun, index: number, step: ResolvedStep): Promise<void> {
    const result = run.steps[index];
    if (result === undefined || this.run !== run || run.state !== 'running') return;
    if (this.dependencies.isLive()) { result.ok = false; result.error = 'Skipped: a platform went live.'; await this.stop(); return; }
    try {
      await step.fire();
      result.firedAt = new Date(this.now()).toISOString(); result.ok = true;
      if (step.hide !== undefined) {
        const hide = step.hide; this.hides.push(hide);
        this.cancels.push(this.setTimer(() => {
          void Promise.resolve().then(hide).then(() => { result.hiddenAt = new Date(this.now()).toISOString(); this.hides = this.hides.filter((item) => item !== hide); }).catch(() => undefined);
        }, run.holdMs));
      }
    } catch (error) {
      result.ok = false; result.error = error instanceof Error ? error.message.slice(0, 200) : 'Step failed';
    }
  }

  private resolve(raw: unknown, addOns: readonly OverlayTestAddOn[], community: string): ResolvedStep {
    if (typeof raw !== 'string' || !STEP_PATTERN.test(raw)) throw new OverlayTestSequenceError(400, 'Each step must be a short name such as "alert:twitch:follow", "chat", "captions", "emote-wall:fireworks" or "addon:thsv.local-clock".');
    const hub = this.dependencies.hub;
    const [kind, first = '', second = ''] = raw.split(':');
    if (kind === 'alert') {
      const event = this.dependencies.buildAlert(first, second);
      if (event === undefined) throw new OverlayTestSequenceError(400, `Unknown alert "${raw}". Use GET /wizard/api/test-sequence/catalog for the list.`);
      return { step: raw, label: `Test ${first} ${second} alert`, page: '/overlay/alerts', sound: true, fire: () => { hub.publishPreview(event, hub.clientConfig(), false); } };
    }
    if (kind === 'chat' && first === '') {
      return {
        step: raw, label: 'Sample chat line', page: '/overlay/chat', sound: false,
        fire: () => { hub.clearChatPreviews(); for (const platform of ['twitch', 'youtube', 'kick', 'tiktok', 'facebook']) hub.publishPreview(this.dependencies.buildChat(platform), hub.clientConfig(), true); },
        hide: () => { hub.clearChatPreviews(); },
      };
    }
    if (kind === 'captions' && first === '') {
      const captions = this.dependencies.captions;
      if (captions === undefined) throw new OverlayTestSequenceError(400, 'Live captions are not available on this PC.');
      return { step: raw, label: 'Sample live caption', page: '/overlay/captions', sound: false, fire: () => { captions.preview({}); } };
    }
    if (kind === 'emote-wall' && (EFFECTS as readonly string[]).includes(first)) {
      const effect = first as OverlayTestEffect;
      return { step: raw, label: `Emote Wall ${effect}`, page: '/overlay/emote-wall', sound: false, fire: () => { hub.publishEmoteWallTrigger({ platform: 'twitch', category: 'follow', simulated: true, test: effect }); } };
    }
    if (kind === 'addon') {
      const moduleId = first; const mode = second;
      const addOn = addOns.find((candidate) => candidate.moduleId === moduleId);
      if (addOn === undefined) throw new OverlayTestSequenceError(400, `"${moduleId}" is not an installed, switched-on extension with an overlay.`);
      const topic = this.dependencies.addOnPreviewTopic(moduleId);
      const payload: Readonly<Record<string, unknown>> = { ...this.dependencies.buildAddOnPreview(addOn, mode, community), templatePreview: true };
      const media = topic === `${moduleId}.media.play`;
      return {
        step: raw, label: `${addOn.name} template preview${mode ? ` (${mode})` : ''}`, page: addOnPage(moduleId), sound: false,
        fire: () => hub.publishAddOn(moduleId, topic, payload),
        hide: async () => {
          if (media) await hub.publishAddOn(moduleId, `${moduleId}.media.stop`, { playbackId: payload['playbackId'], reason: 'test-finished' });
          await hub.publishAddOn(moduleId, `${moduleId}.preview.hide`, { force: true });
        },
      };
    }
    throw new OverlayTestSequenceError(400, `Unknown step "${raw}". Use GET /wizard/api/test-sequence/catalog for the list.`);
  }
}

function addOnPage(moduleId: string): string { return ADD_ON_PAGES[moduleId] ?? `/overlay/addons/${moduleId}`; }

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.max(minimum, Math.min(Math.max(minimum, maximum), number));
}

function emptyRun(now: number): OverlayTestRun {
  return { runId: 'none', label: '', gapMs: 0, holdMs: 0, startedAt: new Date(now).toISOString(), endsAt: new Date(now).toISOString(), state: 'stopped', steps: [] };
}
