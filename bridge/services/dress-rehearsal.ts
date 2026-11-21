import { randomUUID } from 'node:crypto';

/**
 * Dress rehearsal: one off-air run that tries what a stream uses and says, item by item, what worked.
 *
 * It only acts on this PC and the creator's own streaming app: overlay pages get the same template previews the
 * Wizard's Preview buttons send (each page answers when it drew one), Random Clip Player plays one clip and reports
 * back, Critter Catch plays a miss and a catch, screen effects are checked in the streaming app, and (only when the
 * creator ticks it) the scene roles are switched to and back. Nothing goes to chat or any platform, nothing starts
 * streaming, recording or a raid, and no points, rewards or counters change. It refuses to start while a platform is
 * live or the streaming app streams or records, and stops by itself if that changes during the run.
 *
 * Every item comes from what the creator has switched on (a blank setup gets a short list), and every text is one of
 * the fixed sentences in DRESS_REHEARSAL_TEXT so the Wizard can show it in the creator's language.
 */

export type DressRehearsalStatus = 'pass' | 'fail' | 'warn' | 'look' | 'skip';
export type DressRehearsalArea = 'app' | 'go-live' | 'check' | 'scenes' | 'effects' | 'overlays' | 'critters' | 'clips';

export interface DressRehearsalItem {
  readonly id: string;
  readonly area: DressRehearsalArea;
  readonly title: string;
  status: DressRehearsalStatus;
  detail: string;
  fix?: string;
  /** The Wizard page that fixes it (data-setup-target). */
  target?: string;
}

export interface DressRehearsalRun {
  readonly runId: string;
  readonly startedAt: string;
  finishedAt?: string;
  state: 'running' | 'finished' | 'stopped';
  readonly app?: string;
  readonly switchScenes: boolean;
  /** What runs now, for the progress line. */
  current?: string;
  readonly items: DressRehearsalItem[];
  summary?: Readonly<{ pass: number; fail: number; warn: number; look: number; skip: number }>;
  stopReason?: string;
}

export interface DressRehearsalAddOn {
  readonly moduleId: string;
  readonly name: string;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly permissions: readonly string[];
}

export interface OverlayRehearsalReport {
  readonly moduleId: string;
  readonly rehearsalId: string;
  readonly phase: 'shown' | 'check';
  readonly host: 'obs' | 'browser';
  readonly visible: boolean;
  readonly scene?: string;
  readonly check?: string;
  readonly ok?: boolean;
  readonly detail?: string;
}

export interface MediaLifecycleReport { readonly playbackId: string; readonly phase: string; readonly error?: string }

export interface DressRehearsalDependencies {
  readonly isLive: () => boolean;
  /** The creator's streaming app; app undefined when none is picked or saved. */
  readonly streamingApp: () => Promise<Readonly<{ app?: string; connected: readonly string[]; operations: Readonly<Record<string, readonly string[]>> }>>;
  /** Streaming or recording right now (undefined when no app is saved). */
  readonly streamingAppBusy: () => Promise<Readonly<{ busy: boolean }> | undefined>;
  /** The read-only pre-stream check (Streamer.bot, actions, scenes, overlays, imports). */
  readonly preStreamCheck: () => Promise<Readonly<Record<string, unknown>>>;
  readonly sceneRoles: () => Promise<Readonly<Record<string, unknown>> | undefined>;
  readonly sceneNames: (app: string) => readonly string[];
  readonly currentScene: (app: string) => string | undefined;
  readonly switchScene: (sceneName: string) => Promise<void>;
  /** Installed, switched-on extensions. */
  readonly addOns: () => Promise<readonly DressRehearsalAddOn[]>;
  readonly checkEffects: (effects: readonly Readonly<{ name: string; source: string; filter: string }>[]) => Promise<Readonly<{ connected: boolean; effects: readonly Readonly<{ name: string; status: string; detail?: string }>[] }>>;
  readonly communityName: () => Promise<string>;
  readonly buildAddOnPreview: (addOn: DressRehearsalAddOn, mode: string, community: string) => Readonly<Record<string, unknown>>;
  readonly addOnPreviewTopic: (moduleId: string, mode: string) => string;
  readonly publishAddOn: (moduleId: string, topic: string, payload: Readonly<Record<string, unknown>>) => Promise<void>;
  /** Test alerts and an Emote Wall burst (pages without an answer channel). */
  readonly publishAlertsAndEffects: () => Promise<number> | number;
  readonly overlaySeen: () => Readonly<Record<string, number>>;
  readonly onOverlayReport: (listener: (report: OverlayRehearsalReport) => void) => () => void;
  readonly onMediaLifecycle: (moduleId: string, listener: (report: MediaLifecycleReport) => void) => () => void;
  readonly controlAction: (moduleId: string, action: string) => Promise<unknown>;
  /** SprigCast's Stream doctor, read only; undefined when the app has no such check. */
  readonly streamDoctor?: () => Promise<Readonly<Record<string, unknown>> | undefined>;
  readonly saveLast?: (run: DressRehearsalRun) => Promise<void>;
  readonly loadLast?: () => Promise<DressRehearsalRun | undefined>;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
}

export class DressRehearsalError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

/** Every sentence a rehearsal can show. {0}, {1} are names (an app, a scene, an extension) or numbers. */
export const DRESS_REHEARSAL_TEXT = Object.freeze({
  refuseLive: 'Run the dress rehearsal before or after your stream, not while you are live.',
  refuseBusy: 'Your streaming app is streaming or recording. Stop it first, then run the dress rehearsal.',
  refuseRunning: 'A dress rehearsal is already running.',
  stoppedLive: 'Stopped: a platform went live or your streaming app started streaming or recording.',
  stoppedByYou: 'Stopped before the end.',
  appTitle: 'Streaming app',
  appNone: 'No streaming app is picked or saved yet.',
  appNoneFix: 'Pick your streaming app at the top of Start here and add it under Scene connections.',
  appConnected: '{0} is connected.',
  appNotConnected: '{0} is not connected right now.',
  appNotConnectedFix: 'Open {0}, wait until StreamBridge shows it connected, then run the rehearsal again.',
  goLiveTitle: 'Go Live in {0}',
  doctorUnavailable: 'This SprigCast build cannot tell StreamBridge what its Stream doctor would say. StreamBridge asks twice and then uses Go live anyway, so a Stream doctor warning no longer stops Go Live.',
  doctorClear: 'The Stream doctor has nothing that would hold Go Live.',
  doctorHold: 'The Stream doctor would hold Go Live from a Stream Deck key: {0}',
  doctorHoldFix: 'StreamBridge goes live anyway after asking twice. Fix it in SprigCast if you want a clean start.',
  doctorStop: 'Go Live would not start: {0}',
  doctorStopFix: 'Fix this in SprigCast before you go live.',
  doctorFailed: 'Could not ask the Stream doctor: {0}',
  checkTitle: 'Pre-stream check',
  checkReady: 'Streamer.bot, your actions, scenes and overlays are ready.',
  checkFailed: 'The pre-stream check could not run: {0}',
  checkIssueTitle: 'Pre-stream check: {0}',
  scenesTitle: 'Scene roles',
  scenesNone: 'No scene roles are set, so Stream Deck keys and extensions that change scenes have nothing to switch to.',
  scenesNoneFix: 'Set them under Extensions > Scene roles if your keys or extensions change scenes.',
  sceneTitle: 'Scene: {0}',
  sceneMissing: 'There is no scene named {0} in {1}.',
  sceneMissingFix: 'Pick an existing scene for this role under Extensions > Scene roles, or rename the scene.',
  sceneFound: 'Found in {0}. Tick "Switch through my scenes" to also try switching to it.',
  sceneSwitched: 'Switched to it and {0} showed it.',
  sceneNotSwitched: '{0} did not show this scene after StreamBridge asked for it.',
  sceneSwitchFailed: 'Switching failed: {0}',
  sceneSwitchFix: 'Check the scene connection to {0} under Scene connections.',
  sceneBackTitle: 'Back to the scene you were on',
  sceneBack: 'Back on {0}.',
  sceneBackFailed: 'Could not switch back to {0}. Switch back yourself.',
  effectsTitle: 'Screen effect: {0}',
  effectReady: 'Ready in {0}.',
  effectNeedsSetup: 'Needs setup in {0}: {1}',
  effectNeedsSetupFix: 'Open Streamer Punishments, press Check, then Set it up for me or follow the how-to.',
  effectNotAvailable: '{0} cannot do this effect.',
  effectNotAvailableFix: 'Remove it from Streamer Punishments, or use an effect your app can do.',
  effectUnchecked: 'Not checked: {0}',
  overlayShown: 'The page in {0} showed the test.',
  overlayShownHidden: 'The page in {0} got the test, but its scene is not showing right now.',
  overlayBrowserOnly: 'Only a browser tab showed the test, not {0}.',
  overlayBrowserOnlyFix: 'Add the page to {0}: Overlays > copy the link, then add it as a web page source.',
  overlayClosed: 'No page answered. The page has been in {0} before, so it is probably closed right now (its scene is not showing, or it is paused to save power).',
  overlayClosedFix: 'Show the scene with this page and run the rehearsal again to be sure.',
  overlayMissing: 'No page answered. This overlay has never been added to {0}.',
  overlayMissingFix: 'Add its page to {0} under Overlays, or switch the extension off if you do not use it.',
  overlayFailed: 'Could not send the test: {0}',
  alertsTitle: 'Test alerts and Emote Wall',
  alertsSent: '{0} test alerts and an Emote Wall burst were sent. Watch that they look right.',
  crittersTitle: 'Critter Catch on screen',
  crittersShown: 'The critter broke free of a Jar, kept its colours, and was caught.',
  crittersColours: 'The critter looked different after breaking free of the Jar: {0}',
  crittersColoursFix: 'Update StreamBridge, then run the rehearsal again.',
  crittersNoCheck: 'The page showed the critter but did not report back after the Jar. Watch that it keeps its colours.',
  crittersRewardTitle: 'Critter Catch: Twitch Jars',
  crittersRewardsOnly: 'Twitch viewers can only throw with Jar rewards, and those switch on only while a critter visits Twitch. When one stream goes to several platforms, Twitch viewers see every critter but can catch only a few.',
  crittersRewardsOnlyFix: 'Set "Where critters visit" to "Every platform at once", or tick Twitch under "Where typing !catch throws a Jar".',
  crittersNoRewards: 'Twitch viewers cannot throw a Jar: typing !catch is off for Twitch and no Jar rewards are listed.',
  crittersNoRewardsFix: 'Add your Jar reward IDs under Critter Catch > Jars, or tick Twitch under "Where typing !catch throws a Jar".',
  crittersSettingsOk: 'Every platform it works on can throw a Jar.',
  clipsTitle: 'Random Clip Player',
  clipPlayed: 'A clip started playing and the page reported it.',
  clipFailed: 'The clip did not play: {0}',
  clipFailedFix: 'Open Random Clip Player and check your clip list, or press Start clips in the Control Panel to try again.',
  clipNoAnswer: 'No clip page reported a clip within {0} seconds.',
  clipNoAnswerFix: 'Make sure the Clips page is in a scene in {0}, then press Start clips in the Control Panel.',
  clipStartFailed: 'Start clips did not work: {0}',
});

const AREA_TARGET: Readonly<Partial<Record<DressRehearsalArea, string>>> = { app: 'overview', check: 'diagnostics', scenes: 'addons', effects: 'addons', overlays: 'overlay-widgets', critters: 'addons', clips: 'addons' };
const SCENE_ROLES = ['starting', 'live', 'chatting', 'break', 'ending'] as const;
const CHECK_AREAS: Readonly<Record<string, string>> = {
  core: 'Streamer.bot', scenes: 'scenes', actions: 'Streamer.bot actions', overlays: 'overlays', 'timed-actions': 'timed actions', 'obs-environment': 'OBS',
  'overlay-links': 'overlay links', 'streamerbot-import': 'Streamer.bot imports', speakerbot: 'Speaker.bot', obs: 'OBS', sprigcast: 'SprigCast', meld: 'Meld Studio', streamlabs: 'Streamlabs Desktop',
};
const APP_NAMES: Readonly<Record<string, string>> = { obs: 'OBS', sprigcast: 'SprigCast', meld: 'Meld Studio', streamlabs: 'Streamlabs Desktop' };
/** Pages handled by their own rehearsal item (or with nothing to draw). */
const OWN_ITEMS = new Set(['thsv.critter-catch', 'thsv.random-clip-player']);
const OVERLAY_ANSWER_MS = 3_500;
const OVERLAY_HOLD_MS = 2_500;
const CLIP_WAIT_MS = 30_000;

export function fill(template: string, ...parts: readonly (string | number)[]): string {
  return template.replace(/\{(\d)\}/gu, (_, index: string) => String(parts[Number(index)] ?? ''));
}

export class DressRehearsal {
  private run: DressRehearsalRun | undefined;
  private stopRequested = false;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  public constructor(private readonly dependencies: DressRehearsalDependencies) {
    this.sleep = dependencies.sleep ?? (async (milliseconds) => { await new Promise((resolve) => { setTimeout(resolve, milliseconds).unref(); }); });
    this.now = dependencies.now ?? (() => Date.now());
  }

  public async status(): Promise<Readonly<Record<string, unknown>>> {
    if (this.run !== undefined) return { running: this.run.state === 'running', run: this.run };
    const last = await this.dependencies.loadLast?.().catch(() => undefined);
    return last === undefined ? { running: false } : { running: false, run: last };
  }

  public async stop(): Promise<void> { if (this.run?.state === 'running') this.stopRequested = true; }

  /** Starts a run in the background and returns it at once; poll status() for the items. */
  public async start(input: unknown): Promise<DressRehearsalRun> {
    const record = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    if (record['action'] === 'stop') { await this.stop(); return this.run ?? emptyRun(this.now()); }
    if (this.run?.state === 'running') throw new DressRehearsalError(409, DRESS_REHEARSAL_TEXT.refuseRunning);
    if (this.dependencies.isLive()) throw new DressRehearsalError(409, DRESS_REHEARSAL_TEXT.refuseLive);
    if ((await this.dependencies.streamingAppBusy().catch(() => undefined))?.busy === true) throw new DressRehearsalError(409, DRESS_REHEARSAL_TEXT.refuseBusy);
    const choice: Awaited<ReturnType<DressRehearsalDependencies['streamingApp']>> = await this.dependencies.streamingApp().catch(() => ({ connected: [], operations: {} }));
    const run: DressRehearsalRun = {
      runId: `rehearsal-${randomUUID()}`, startedAt: new Date(this.now()).toISOString(), state: 'running',
      ...(choice.app === undefined ? {} : { app: choice.app }), switchScenes: record['switchScenes'] === true, items: [],
    };
    this.run = run; this.stopRequested = false;
    void this.execute(run, choice).catch(() => undefined);
    return run;
  }

  private async execute(run: DressRehearsalRun, choice: Awaited<ReturnType<DressRehearsalDependencies['streamingApp']>>): Promise<void> {
    const steps: Array<readonly [string, () => Promise<void>]> = [
      ['app', async () => { this.appItem(run, choice); }],
      ['go-live', async () => { await this.goLiveItem(run, choice.app); }],
      ['check', async () => { await this.checkItems(run); }],
      ['scenes', async () => { await this.sceneItems(run, choice); }],
      ['effects', async () => { await this.effectItems(run, choice.app); }],
      ['overlays', async () => { await this.overlayItems(run, choice.app); }],
      ['critters', async () => { await this.critterItems(run, choice.app); }],
      ['clips', async () => { await this.clipItems(run, choice.app); }],
    ];
    try {
      for (const [name, step] of steps) {
        if (await this.shouldStop(run)) break;
        run.current = name;
        await step();
      }
    } finally {
      delete run.current;
      if (run.state === 'running') run.state = 'finished';
      run.finishedAt = new Date(this.now()).toISOString();
      run.summary = summarize(run.items);
      await this.dependencies.saveLast?.(run).catch(() => undefined);
    }
  }

  private async shouldStop(run: DressRehearsalRun): Promise<boolean> {
    if (run.state !== 'running') return true;
    if (this.stopRequested) { run.state = 'stopped'; run.stopReason = DRESS_REHEARSAL_TEXT.stoppedByYou; return true; }
    const busy = this.dependencies.isLive() || (await this.dependencies.streamingAppBusy().catch(() => undefined))?.busy === true;
    if (busy) { run.state = 'stopped'; run.stopReason = DRESS_REHEARSAL_TEXT.stoppedLive; return true; }
    return false;
  }

  private add(run: DressRehearsalRun, item: Omit<DressRehearsalItem, 'target'> & { target?: string }): DressRehearsalItem {
    const target = item.target ?? (item.status === 'fail' || item.status === 'warn' ? AREA_TARGET[item.area] : undefined);
    const full: DressRehearsalItem = { ...item, ...(target === undefined ? {} : { target }) };
    run.items.push(full);
    return full;
  }

  private appItem(run: DressRehearsalRun, choice: Awaited<ReturnType<DressRehearsalDependencies['streamingApp']>>): void {
    const T = DRESS_REHEARSAL_TEXT;
    if (choice.app === undefined) { this.add(run, { id: 'app', area: 'app', title: T.appTitle, status: 'fail', detail: T.appNone, fix: T.appNoneFix }); return; }
    const name = appName(choice.app);
    if (choice.connected.includes(choice.app)) this.add(run, { id: 'app', area: 'app', title: T.appTitle, status: 'pass', detail: fill(T.appConnected, name) });
    else this.add(run, { id: 'app', area: 'app', title: T.appTitle, status: 'fail', detail: fill(T.appNotConnected, name), fix: fill(T.appNotConnectedFix, name) });
  }

  /** SprigCast's Stream doctor can hold a go-live sent from another app (a Stream Deck key); ask it what it would say. */
  private async goLiveItem(run: DressRehearsalRun, app: string | undefined): Promise<void> {
    if (app !== 'sprigcast' || this.dependencies.streamDoctor === undefined) return;
    const T = DRESS_REHEARSAL_TEXT; const title = fill(T.goLiveTitle, appName(app));
    let report: Readonly<Record<string, unknown>> | undefined;
    try { report = await this.dependencies.streamDoctor(); }
    catch (error) { this.add(run, { id: 'go-live', area: 'go-live', title, status: 'warn', detail: fill(T.doctorFailed, message(error)) }); return; }
    if (report === undefined) { this.add(run, { id: 'go-live', area: 'go-live', title, status: 'skip', detail: T.doctorUnavailable }); return; }
    const problems = doctorProblems(report);
    const stops = problems.filter((problem) => problem.blocking);
    const holds = problems.filter((problem) => !problem.blocking && problem.serious);
    if (stops.length > 0) this.add(run, { id: 'go-live', area: 'go-live', title, status: 'fail', detail: fill(T.doctorStop, stops.map((problem) => problem.text).join(' · ')), fix: T.doctorStopFix });
    else if (holds.length > 0) this.add(run, { id: 'go-live', area: 'go-live', title, status: 'warn', detail: fill(T.doctorHold, holds.map((problem) => problem.text).join(' · ')), fix: T.doctorHoldFix });
    else this.add(run, { id: 'go-live', area: 'go-live', title, status: 'pass', detail: T.doctorClear });
  }

  private async checkItems(run: DressRehearsalRun): Promise<void> {
    const T = DRESS_REHEARSAL_TEXT;
    let report: Readonly<Record<string, unknown>>;
    try { report = await this.dependencies.preStreamCheck(); }
    catch (error) { this.add(run, { id: 'check', area: 'check', title: T.checkTitle, status: 'fail', detail: fill(T.checkFailed, message(error)) }); return; }
    const summary = isRecord(report['readinessSummary']) ? report['readinessSummary'] : {};
    const issues = (Array.isArray(summary['issues']) ? summary['issues'] : []).filter(isRecord);
    if (issues.length === 0) { this.add(run, { id: 'check', area: 'check', title: T.checkTitle, status: 'pass', detail: T.checkReady }); return; }
    const coreReady = summary['coreReady'] !== false;
    issues.slice(0, 12).forEach((issue, index) => {
      const area = typeof issue['area'] === 'string' ? issue['area'] : 'check';
      const informational = ['app-update', 'streamerbot-version', 'streamerbot-import'].includes(area) || typeof issue['kind'] === 'string' && /notice|info/u.test(issue['kind']);
      this.add(run, {
        id: `check-${String(index)}`, area: 'check', title: fill(T.checkIssueTitle, CHECK_AREAS[area] ?? area),
        status: area === 'core' && !coreReady ? 'fail' : informational ? 'warn' : 'fail',
        detail: typeof issue['fix'] === 'string' ? issue['fix'].slice(0, 400) : '',
      });
    });
  }

  private async sceneItems(run: DressRehearsalRun, choice: Awaited<ReturnType<DressRehearsalDependencies['streamingApp']>>): Promise<void> {
    const T = DRESS_REHEARSAL_TEXT; const app = choice.app;
    if (app === undefined) return;
    const roles = await this.dependencies.sceneRoles().catch(() => undefined) ?? {};
    const names = [...new Set(SCENE_ROLES.map((role) => roles[role]).filter((value): value is string => typeof value === 'string' && value.trim() !== '').map((value) => value.trim()))];
    if (names.length === 0) { this.add(run, { id: 'scenes', area: 'scenes', title: T.scenesTitle, status: 'skip', detail: T.scenesNone, fix: T.scenesNoneFix }); return; }
    const label = appName(app);
    const known = new Set(this.dependencies.sceneNames(app));
    const connected = choice.connected.includes(app);
    const canSwitch = run.switchScenes && connected && (choice.operations[app] ?? []).includes('switch-scene');
    const original = this.dependencies.currentScene(app);
    let switched = false;
    for (const name of names) {
      if (await this.shouldStop(run)) break;
      const id = `scene-${name}`; const title = fill(T.sceneTitle, name);
      if (known.size > 0 && !known.has(name)) { this.add(run, { id, area: 'scenes', title, status: 'fail', detail: fill(T.sceneMissing, name, label), fix: T.sceneMissingFix }); continue; }
      if (!canSwitch) { this.add(run, { id, area: 'scenes', title, status: known.has(name) ? 'pass' : 'skip', detail: fill(T.sceneFound, label) }); continue; }
      run.current = `scenes:${name}`;
      try {
        await this.dependencies.switchScene(name); switched = true;
        const shown = await this.waitFor(() => this.dependencies.currentScene(app) === name, 5_000);
        this.add(run, shown
          ? { id, area: 'scenes', title, status: 'pass', detail: fill(T.sceneSwitched, label) }
          : { id, area: 'scenes', title, status: 'fail', detail: fill(T.sceneNotSwitched, label), fix: fill(T.sceneSwitchFix, label) });
        await this.sleep(1_500);
      } catch (error) {
        this.add(run, { id, area: 'scenes', title, status: 'fail', detail: fill(T.sceneSwitchFailed, message(error)), fix: fill(T.sceneSwitchFix, label) });
      }
    }
    if (!switched || original === undefined) return;
    try {
      await this.dependencies.switchScene(original);
      const back = await this.waitFor(() => this.dependencies.currentScene(app) === original, 5_000);
      this.add(run, { id: 'scene-back', area: 'scenes', title: T.sceneBackTitle, status: back ? 'pass' : 'warn', detail: fill(back ? T.sceneBack : T.sceneBackFailed, original) });
    } catch { this.add(run, { id: 'scene-back', area: 'scenes', title: T.sceneBackTitle, status: 'warn', detail: fill(T.sceneBackFailed, original) }); }
  }

  private async effectItems(run: DressRehearsalRun, app: string | undefined): Promise<void> {
    const T = DRESS_REHEARSAL_TEXT;
    const punishments = (await this.dependencies.addOns()).find((addOn) => addOn.moduleId === 'thsv.streamer-punishments');
    const rows = Array.isArray(punishments?.settings['effects']) ? punishments.settings['effects'] : [];
    const lines = rows.filter((row): row is string => typeof row === 'string').map((row) => { const [name = '', source = '', filter = ''] = row.split('|').map((part) => part.trim()); return { name, source, filter }; }).filter((line) => line.name !== '').slice(0, 15);
    if (lines.length === 0 || app === undefined) return;
    const label = appName(app);
    let result: Awaited<ReturnType<DressRehearsalDependencies['checkEffects']>>;
    try { result = await this.dependencies.checkEffects(lines); }
    catch (error) { for (const line of lines) this.add(run, { id: `effect-${line.name}`, area: 'effects', title: fill(T.effectsTitle, line.name), status: 'warn', detail: fill(T.effectUnchecked, message(error)) }); return; }
    for (const effect of result.effects) {
      const id = `effect-${effect.name}`; const title = fill(T.effectsTitle, effect.name); const detail = effect.detail ?? '';
      if (effect.status === 'ready') this.add(run, { id, area: 'effects', title, status: 'pass', detail: fill(T.effectReady, label) });
      else if (effect.status === 'needs-setup') this.add(run, { id, area: 'effects', title, status: 'fail', detail: fill(T.effectNeedsSetup, label, detail), fix: T.effectNeedsSetupFix });
      else if (effect.status === 'not-available') this.add(run, { id, area: 'effects', title, status: 'warn', detail: fill(T.effectNotAvailable, label), fix: T.effectNotAvailableFix });
      else this.add(run, { id, area: 'effects', title, status: 'warn', detail: fill(T.effectUnchecked, detail) });
    }
  }

  private async overlayItems(run: DressRehearsalRun, app: string | undefined): Promise<void> {
    const T = DRESS_REHEARSAL_TEXT; const label = app === undefined ? 'your streaming app' : appName(app);
    const alerts = await this.dependencies.publishAlertsAndEffects();
    if (alerts > 0) this.add(run, { id: 'alerts', area: 'overlays', title: T.alertsTitle, status: 'look', detail: fill(T.alertsSent, alerts) });
    await this.sleep(OVERLAY_HOLD_MS);
    const addOns = (await this.dependencies.addOns()).filter((addOn) => addOn.permissions.includes('overlay.publish') && !OWN_ITEMS.has(addOn.moduleId));
    const community = await this.dependencies.communityName().catch(() => '');
    for (const addOn of addOns) {
      if (await this.shouldStop(run)) return;
      run.current = `overlays:${addOn.moduleId}`;
      const rehearsalId = `${run.runId.slice(-12)}-${addOn.moduleId.replace(/[^a-z0-9-]/gu, '-')}`.slice(0, 100);
      const reports: OverlayRehearsalReport[] = [];
      const unsubscribe = this.dependencies.onOverlayReport((report) => { if (report.rehearsalId === rehearsalId && report.moduleId === addOn.moduleId) reports.push(report); });
      const topic = this.dependencies.addOnPreviewTopic(addOn.moduleId, '');
      const payload: Readonly<Record<string, unknown>> = { ...this.dependencies.buildAddOnPreview(addOn, '', community), templatePreview: true, rehearsalId };
      try {
        try { await this.dependencies.publishAddOn(addOn.moduleId, topic, payload); }
        catch (error) { this.add(run, { id: `overlay-${addOn.moduleId}`, area: 'overlays', title: addOn.name, status: 'warn', detail: fill(T.overlayFailed, message(error)) }); continue; }
        await this.waitFor(() => reports.some((report) => report.host === 'obs' && report.visible), OVERLAY_ANSWER_MS);
        this.add(run, this.overlayVerdict(addOn, reports, label));
        await this.sleep(OVERLAY_HOLD_MS);
      } finally {
        unsubscribe();
        if (topic === `${addOn.moduleId}.media.play`) await this.dependencies.publishAddOn(addOn.moduleId, `${addOn.moduleId}.media.stop`, { playbackId: payload['playbackId'], reason: 'test-finished' }).catch(() => undefined);
        await this.dependencies.publishAddOn(addOn.moduleId, `${addOn.moduleId}.preview.hide`, { force: true }).catch(() => undefined);
      }
    }
  }

  private overlayVerdict(addOn: DressRehearsalAddOn, reports: readonly OverlayRehearsalReport[], label: string): DressRehearsalItem {
    const T = DRESS_REHEARSAL_TEXT; const id = `overlay-${addOn.moduleId}`; const title = addOn.name;
    const inApp = reports.filter((report) => report.host === 'obs');
    if (inApp.some((report) => report.visible)) return { id, area: 'overlays', title, status: 'pass', detail: fill(T.overlayShown, label) };
    if (inApp.length > 0) return { id, area: 'overlays', title, status: 'pass', detail: fill(T.overlayShownHidden, label) };
    if (reports.length > 0) return { id, area: 'overlays', title, status: 'warn', detail: fill(T.overlayBrowserOnly, label), fix: fill(T.overlayBrowserOnlyFix, label), target: 'overlay-widgets' };
    const seen = this.dependencies.overlaySeen();
    if (typeof seen[`obs:${addOn.moduleId}`] === 'number') return { id, area: 'overlays', title, status: 'warn', detail: fill(T.overlayClosed, label), fix: T.overlayClosedFix, target: 'overlay-widgets' };
    return { id, area: 'overlays', title, status: 'fail', detail: fill(T.overlayMissing, label), fix: fill(T.overlayMissingFix, label), target: 'overlay-widgets' };
  }

  private async critterItems(run: DressRehearsalRun, app: string | undefined): Promise<void> {
    const T = DRESS_REHEARSAL_TEXT;
    const addOn = (await this.dependencies.addOns()).find((candidate) => candidate.moduleId === 'thsv.critter-catch');
    if (addOn === undefined) return;
    this.critterSettings(run, addOn);
    if (await this.shouldStop(run)) return;
    const label = app === undefined ? 'your streaming app' : appName(app);
    const moduleId = addOn.moduleId; const topic = `${moduleId}.critters.update`;
    const rehearsalId = `${run.runId.slice(-12)}-critters`;
    const reports: OverlayRehearsalReport[] = [];
    const unsubscribe = this.dependencies.onOverlayReport((report) => { if (report.rehearsalId === rehearsalId && report.moduleId === moduleId) reports.push(report); });
    run.current = 'critters:visit';
    const base = { ...this.dependencies.buildAddOnPreview(addOn, '', await this.dependencies.communityName().catch(() => '')), templatePreview: true, rehearsalId, spawnId: rehearsalId };
    const miss = { id: `${rehearsalId}-miss`, jar: 'honey', keeper: 'Dress rehearsal', ok: false, wobbles: 2 };
    const catchThrow = { id: `${rehearsalId}-catch`, jar: 'moon', keeper: 'Dress rehearsal', ok: true, wobbles: 3 };
    try {
      await this.dependencies.publishAddOn(moduleId, topic, { ...base, status: 'wild', throws: [] });
      await this.waitFor(() => reports.some((report) => report.phase === 'shown'), OVERLAY_ANSWER_MS);
      if (!reports.some((report) => report.phase === 'shown')) {
        const verdict = this.overlayVerdict(addOn, reports, label);
        this.add(run, { ...verdict, id: 'critters-screen', area: 'critters', title: T.crittersTitle });
        return;
      }
      run.current = 'critters:miss';
      await this.dependencies.publishAddOn(moduleId, topic, { ...base, status: 'wild', throws: [miss] });
      await this.waitFor(() => reports.some((report) => report.phase === 'check' && report.check === 'critter-colours'), 9_000);
      const check = reports.find((report) => report.phase === 'check' && report.check === 'critter-colours');
      run.current = 'critters:catch';
      await this.dependencies.publishAddOn(moduleId, topic, { ...base, status: 'caught', throws: [miss, catchThrow] });
      await this.sleep(5_000);
      if (check === undefined) this.add(run, { id: 'critters-screen', area: 'critters', title: T.crittersTitle, status: 'look', detail: T.crittersNoCheck });
      else if (check.ok === true) this.add(run, { id: 'critters-screen', area: 'critters', title: T.crittersTitle, status: 'pass', detail: T.crittersShown });
      else this.add(run, { id: 'critters-screen', area: 'critters', title: T.crittersTitle, status: 'fail', detail: fill(T.crittersColours, check.detail ?? ''), fix: T.crittersColoursFix });
    } catch (error) {
      this.add(run, { id: 'critters-screen', area: 'critters', title: T.crittersTitle, status: 'warn', detail: fill(T.overlayFailed, message(error)) });
    } finally {
      unsubscribe();
      await this.dependencies.publishAddOn(moduleId, `${moduleId}.critters.hide`, { templatePreview: true }).catch(() => undefined);
      await this.dependencies.publishAddOn(moduleId, `${moduleId}.preview.hide`, { force: true }).catch(() => undefined);
    }
  }

  /** The 4.1.153 case: Twitch Jars that switch on only during a Twitch visit, on one stream sent to several platforms. */
  private critterSettings(run: DressRehearsalRun, addOn: DressRehearsalAddOn): void {
    const T = DRESS_REHEARSAL_TEXT; const settings = addOn.settings;
    const list = (key: string, fallback: readonly string[]): readonly string[] => (Array.isArray(settings[key]) ? (settings[key] as unknown[]).filter((value): value is string => typeof value === 'string') : fallback);
    const everywhere = ['twitch', 'youtube', 'kick', 'tiktok', 'facebook'];
    const platforms = list('platforms', everywhere); const commandPlatforms = list('commandPlatforms', everywhere);
    const rewards = list('rewardThrows', []);
    if (!platforms.includes('twitch')) return;
    const id = 'critters-twitch'; const title = T.crittersRewardTitle;
    if (commandPlatforms.includes('twitch')) { this.add(run, { id, area: 'critters', title, status: 'pass', detail: T.crittersSettingsOk }); return; }
    if (rewards.length === 0) { this.add(run, { id, area: 'critters', title, status: 'fail', detail: T.crittersNoRewards, fix: T.crittersNoRewardsFix }); return; }
    const oneAtATime = (settings['visitMode'] ?? 'active-platform') === 'active-platform';
    const toggles = settings['toggleRewards'] !== false;
    if (oneAtATime && toggles && platforms.length > 1) this.add(run, { id, area: 'critters', title, status: 'warn', detail: T.crittersRewardsOnly, fix: T.crittersRewardsOnlyFix });
    else this.add(run, { id, area: 'critters', title, status: 'pass', detail: T.crittersSettingsOk });
  }

  private async clipItems(run: DressRehearsalRun, app: string | undefined): Promise<void> {
    const T = DRESS_REHEARSAL_TEXT; const moduleId = 'thsv.random-clip-player';
    if (!(await this.dependencies.addOns()).some((addOn) => addOn.moduleId === moduleId)) return;
    const label = app === undefined ? 'your streaming app' : appName(app);
    run.current = 'clips';
    let outcome: MediaLifecycleReport | undefined;
    const unsubscribe = this.dependencies.onMediaLifecycle(moduleId, (report) => { if (outcome === undefined && ['started', 'heartbeat', 'failed', 'timeout'].includes(report.phase)) outcome = report; });
    try {
      try { await this.dependencies.controlAction(moduleId, 'start'); }
      catch (error) { this.add(run, { id: 'clips', area: 'clips', title: T.clipsTitle, status: 'fail', detail: fill(T.clipStartFailed, message(error)), fix: T.clipFailedFix }); return; }
      await this.waitFor(() => outcome !== undefined || this.dependencies.isLive(), CLIP_WAIT_MS);
      const result = outcome;
      if (result === undefined) this.add(run, { id: 'clips', area: 'clips', title: T.clipsTitle, status: 'fail', detail: fill(T.clipNoAnswer, CLIP_WAIT_MS / 1_000), fix: fill(T.clipNoAnswerFix, label) });
      else if (result.phase === 'started' || result.phase === 'heartbeat') { this.add(run, { id: 'clips', area: 'clips', title: T.clipsTitle, status: 'pass', detail: T.clipPlayed }); await this.sleep(4_000); }
      else this.add(run, { id: 'clips', area: 'clips', title: T.clipsTitle, status: 'fail', detail: fill(T.clipFailed, result.error ?? result.phase), fix: T.clipFailedFix });
    } finally {
      unsubscribe();
      await this.dependencies.controlAction(moduleId, 'stop').catch(() => undefined);
    }
  }

  private async waitFor(condition: () => boolean, milliseconds: number): Promise<boolean> {
    const deadline = this.now() + milliseconds;
    while (!condition()) {
      if (this.now() >= deadline) return false;
      await this.sleep(250);
    }
    return true;
  }
}

export function appName(app: string): string { return APP_NAMES[app] ?? app; }

interface DoctorProblem { readonly text: string; readonly serious: boolean; readonly blocking: boolean }

/** Reads SprigCast's stream.doctor answer: problems (or checks) with a severity, text, and whether it blocks a start. */
export function doctorProblems(report: Readonly<Record<string, unknown>>): readonly DoctorProblem[] {
  const raw = Array.isArray(report['problems']) ? report['problems'] : Array.isArray(report['checks']) ? report['checks'] : Array.isArray(report['warnings']) ? report['warnings'] : [];
  return raw.filter(isRecord).flatMap((problem) => {
    const text = typeof problem['text'] === 'string' ? problem['text'] : typeof problem['message'] === 'string' ? problem['message'] : '';
    if (text.trim() === '' || problem['ok'] === true) return [];
    const severity = typeof problem['severity'] === 'string' ? problem['severity'].toLowerCase() : '';
    const blocking = problem['blocking'] === true || problem['blocks'] === true || severity === 'blocking' || severity === 'fatal';
    return [{ text: Array.from(text.trim()).slice(0, 160).join(''), serious: blocking || ['serious', 'error', 'critical', 'high'].includes(severity), blocking }];
  });
}

function summarize(items: readonly DressRehearsalItem[]): NonNullable<DressRehearsalRun['summary']> {
  const count = (status: DressRehearsalStatus): number => items.filter((item) => item.status === status).length;
  return { pass: count('pass'), fail: count('fail'), warn: count('warn'), look: count('look'), skip: count('skip') };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function message(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 240); }
function emptyRun(now: number): DressRehearsalRun { return { runId: 'none', startedAt: new Date(now).toISOString(), state: 'stopped', switchScenes: false, items: [] }; }
