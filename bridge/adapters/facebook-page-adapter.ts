import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { NormalizedEvent } from '../../schemas/event.js';
import { ManagedAdapter, type AdapterContext } from './adapter.js';
import { WindowsDpapiCredentialProtector, type CredentialProtector } from '../services/broadcast-connection-vault-service.js';
import { advanceFacebookMilestone, facebookMilestoneEvent, type FacebookHighWater, type FacebookMetric } from './facebook-milestones.js';

const alertSettingsSchema = z.object({ enabled: z.boolean().default(false), followers: z.boolean().default(true), pageLikes: z.boolean().default(false), interval: z.number().int().min(1).max(10000).default(10), onlyWhileLive: z.boolean().default(true) }).strict();
const defaultAlertSettings = { enabled: false, followers: true, pageLikes: false, interval: 10, onlyWhileLive: true };

const settingsSchema = z.object({
  version: z.literal(1), enabled: z.boolean(),
  pageId: z.string().regex(/^\d{1,100}$/), pageName: z.string().max(256),
  apiVersion: z.string().regex(/^v\d{2}\.0$/),
  protectedToken: z.string().min(1).max(32768),
  alerts: alertSettingsSchema.default(defaultAlertSettings),
  outputEnabled: z.boolean().default(false),
}).strict();
type Settings = z.infer<typeof settingsSchema>;
const commentSchema = z.object({
  id: z.string().min(1).max(160), message: z.string().max(20000).optional(),
  created_time: z.string().max(100).optional(),
  from: z.object({ id: z.string().max(160).optional(), name: z.string().max(256).optional() }).optional(),
});

export class FacebookConnectionError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

/** Read-only, experimental Page comments input. Never emits synthetic follows, Stars, or rewards. */
export class FacebookPageAdapter extends ManagedAdapter {
  private settings: Settings | undefined;
  private token = '';
  private context: AdapterContext | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request: AbortController | undefined;
  private pending: Promise<void> | undefined;
  private mutating = false;
  private liveVideoId = '';
  private nextVideoDiscoveryAt = 0;
  private nextMilestoneAt = 0;
  private seen = new Set<string>();
  private initialized = false;
  private received = 0;
  private nextDelayMs = 5000;
  private readonly settingsPath: string;
  private readonly cursorPath: string;
  private readonly milestonePath: string;
  private highWater: FacebookHighWater = {};
  private milestoneBaselinePending = true;
  private milestonesReceived = 0;
  private alertError: string | undefined;

  public constructor(dataRoot: string, private readonly protector: CredentialProtector = new WindowsDpapiCredentialProtector(), private readonly fetcher: typeof fetch = fetch) {
    super('facebook', { enabled: true, inputEnabled: true, outputEnabled: false, adapter: 'facebook-page', capabilities: ['chatInput'], reconnect: { enabled: true, initialDelayMs: 5000, maxDelayMs: 60000, maxAttempts: 0 } });
    this.settingsPath = join(dataRoot, 'secrets', 'facebook-page.json');
    this.cursorPath = join(dataRoot, 'state', 'facebook-comments.json');
    this.milestonePath = join(dataRoot, 'state', 'facebook-milestones.json');
  }

  public override status() {
    return { ...super.status(), configured: this.settings !== undefined, enabled: this.settings?.enabled ?? false,
      pageId: this.settings?.pageId, pageName: this.settings?.pageName, apiVersion: this.settings?.apiVersion ?? 'v25.0',
      hasCredential: this.token.length > 0, liveVideoId: this.liveVideoId || undefined, received: this.received,
      outputEnabled: this.settings?.outputEnabled ?? false, alerts: this.settings?.alerts ?? defaultAlertSettings, milestonesReceived: this.milestonesReceived, alertError: this.alertError,
      alertCapabilities: { followerMilestones: 'read-total', pageLikeMilestones: 'read-total', namedFollows: 'not-integrated', stars: 'not-integrated', subscriptions: 'not-integrated' },
      verification: 'unverified', capabilities: ['chatInput', 'channelUpdates', 'engagement'] as const,
      limitations: ['Read-only comments and optional aggregate follower/Page-like milestones.', 'Named follows, Stars, subscriptions, and rewards have no verified integration; scheduled Page comments are opt-in.', 'Existing comments and milestone totals are baselined, not replayed.', 'Reads the latest 100 comments every five seconds; higher-volume broadcasts need pagination before production use.'],
    };
  }

  public async start(context: AdapterContext): Promise<void> {
    this.context = context;
    try {
      if ((await stat(this.settingsPath)).size > 65536) throw new Error('Oversized settings');
      this.settings = settingsSchema.parse(JSON.parse(await readFile(this.settingsPath, 'utf8')));
      this.token = await this.protector.unprotect(this.settings.protectedToken);
      if (!this.token) throw new Error('Empty token');
      this.highWater = {};
      try {
        if ((await stat(this.milestonePath)).size <= 4096) {
          const stored: unknown = JSON.parse(await readFile(this.milestonePath, 'utf8'));
          const parsed = z.object({ pageId: z.string(), highWater: z.object({ followers: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(), 'page-likes': z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional() }).strict() }).safeParse(stored);
          if (parsed.success && parsed.data.pageId === this.settings.pageId) this.highWater = Object.fromEntries(Object.entries(parsed.data.highWater).filter(([,value]) => value !== undefined));
        }
      } catch { /* Missing prior milestone state is safely baselined on the first sample. */ }
      this.milestoneBaselinePending = true;
    } catch (error) {
      this.state = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'disabled' : 'error';
      if (this.state === 'error') this.lastError = 'Facebook connection could not be loaded. Reconnect this Page on this computer.';
      return;
    }
    this.state = this.settings.enabled ? 'connecting' : 'disabled';
    if (this.settings.enabled) this.schedule(0);
  }

  public async stop(): Promise<void> {
    this.context = undefined;
    this.nextVideoDiscoveryAt = 0; this.nextMilestoneAt = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.request?.abort();
    await this.pending;
    this.state = 'stopped';
  }

  public async configure(input: unknown): Promise<ReturnType<FacebookPageAdapter['status']>> {
    if (this.mutating) throw new FacebookConnectionError(409, 'A Facebook connection change is already in progress.');
    const request = z.object({ pageId: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
      apiVersion: z.string().regex(/^v\d{2}\.0$/).default('v25.0'),
      token: z.string().trim().min(20).max(16384).regex(/^\S+$/), enabled: z.boolean().default(false),
    }).strict().safeParse(input);
    if (!request.success) throw new FacebookConnectionError(400, 'Enter a Page ID or username, Graph API version, and valid Page access token.');
    this.mutating = true;
    try {
      const page = await this.graph(request.data.pageId, { fields: 'id,name' }, request.data.token, request.data.apiVersion);
      if (typeof page['id'] !== 'string' || !/^\d{1,100}$/.test(page['id']) || typeof page['name'] !== 'string') throw new FacebookConnectionError(400, 'The Page lookup did not return a valid Page identity.');
      const tokenOwner = await this.graph('me', { fields: 'id' }, request.data.token, request.data.apiVersion);
      if (tokenOwner['id'] !== page['id']) throw new FacebookConnectionError(400, 'Use a Page access token belonging to the selected Page, rather than a user or another Page token.');
      // Confirm permission to read this Page's broadcasts before saving credentials.
      await this.graph(`${page['id']}/live_videos`, { fields: 'id,status', limit: '1' }, request.data.token, request.data.apiVersion);
      const samePage = this.settings?.pageId === page['id'];
      const settings: Settings = { version: 1, enabled: request.data.enabled, pageId: page['id'], pageName: page['name'].slice(0,256), apiVersion: request.data.apiVersion, protectedToken: await this.protector.protect(request.data.token), alerts: this.settings?.pageId === page['id'] ? this.settings.alerts : defaultAlertSettings, outputEnabled: this.settings?.pageId === page['id'] ? this.settings.outputEnabled : false };
      const context = this.context;
      await this.stop();
      try { await this.save(this.settingsPath, settings); }
      catch { if (context) await this.start(context); throw new FacebookConnectionError(500, 'Facebook settings could not be saved.'); }
      this.settings = settings; this.token = request.data.token; this.context = context;
      this.liveVideoId = ''; this.seen.clear(); this.initialized = false; this.lastError = undefined;
      this.milestoneBaselinePending = true; if (!samePage) this.highWater = {}; this.alertError = undefined;
      this.state = settings.enabled ? 'connecting' : 'disabled';
      if (settings.enabled && context) this.schedule(0);
      return this.status();
    } finally { this.mutating = false; }
  }

  public async setEnabled(input: unknown): Promise<ReturnType<FacebookPageAdapter['status']>> {
    if (this.mutating) throw new FacebookConnectionError(409, 'A Facebook connection change is already in progress.');
    const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(input);
    if (!parsed.success || !this.settings) throw new FacebookConnectionError(400, 'Save and test a Facebook Page connection first.');
    this.mutating = true;
    try {
      const context = this.context;
      const settings = { ...this.settings, enabled: parsed.data.enabled };
      await this.save(this.settingsPath, settings);
      await this.stop(); this.context = context; this.settings = settings;
      this.state = settings.enabled ? 'connecting' : 'disabled';
      this.lastError = undefined;
      // Seed the first batch after re-enabling to avoid offline comment replay.
      this.initialized = false;
      this.milestoneBaselinePending = true;
      if (settings.enabled && context) this.schedule(0);
      return this.status();
    } finally { this.mutating = false; }
  }

  public async setAlerts(input: unknown): Promise<ReturnType<FacebookPageAdapter['status']>> {
    if (!this.settings) throw new FacebookConnectionError(400, 'Save a Facebook Page connection first.');
    if (this.mutating) throw new FacebookConnectionError(409, 'A Facebook connection change is already in progress.');
    const parsed = alertSettingsSchema.safeParse(input);
    if (!parsed.success) throw new FacebookConnectionError(400, 'Choose milestone options and an interval from 1 to 10000.');
    if (parsed.data.enabled && !parsed.data.followers && !parsed.data.pageLikes) throw new FacebookConnectionError(400, 'Choose at least one milestone metric.');
    this.mutating = true;
    const context = this.context;
    try {
      await this.stop();
      const settings = { ...this.settings, alerts: parsed.data };
      await this.save(this.settingsPath, settings); this.settings = settings;
      this.milestoneBaselinePending = true; this.alertError = undefined;
    } catch { throw new FacebookConnectionError(500, 'Facebook alert settings could not be saved.'); } finally {
      this.context = context; this.state = this.settings.enabled ? 'connecting' : 'disabled';
      if (this.settings.enabled && context) this.schedule(0);
      this.mutating = false;
    }
    return this.status();
  }

  public async setOutput(input: unknown): Promise<ReturnType<FacebookPageAdapter['status']>> {
    const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(input);
    if (!parsed.success || !this.settings) throw new FacebookConnectionError(400, 'Save a Facebook connection first.');
    if (this.mutating) throw new FacebookConnectionError(409, 'A Facebook connection change is already in progress.');
    this.mutating = true;
    try { const settings = { ...this.settings, outputEnabled: parsed.data.enabled }; await this.save(this.settingsPath, settings); this.settings = settings; return this.status(); }
    finally { this.mutating = false; }
  }

  public async postTimedComment(message: string): Promise<void> {
    if (!this.settings?.enabled || !this.settings.outputEnabled || this.mutating) throw new FacebookConnectionError(400, 'Enable Facebook collection and timed comment output first.');
    if (!message.trim() || Array.from(message).length > 500) throw new FacebookConnectionError(400, 'Facebook timed comments must contain 1–500 characters.');
    const videos = await this.graph(this.settings.pageId + '/live_videos', { fields: 'id,status,video{id}', limit: '25' });
    const live = records(videos['data']).filter(video => video['status'] === 'LIVE' && typeof video['id'] === 'string');
    if (live.length !== 1) throw new FacebookConnectionError(409, 'Timed comments require exactly one active Page broadcast.');
    // LiveVideo is the broadcast control object. Publishing comments requires
    // its associated Video object, whose ID can differ from the LiveVideo ID.
    const video = live[0]?.['video'];
    const videoId = video && typeof video === 'object' && !Array.isArray(video) ? (video as Record<string, unknown>)['id'] : undefined;
    if (typeof videoId !== 'string' || !/^\d{1,100}$/.test(videoId)) throw new FacebookConnectionError(409, 'The active Facebook broadcast has no verified associated video. No comment was published.');
    const result = await this.graph(videoId + '/comments', {}, this.token, this.settings.apiVersion, message.trim());
    if (typeof result['id'] !== 'string') throw new FacebookConnectionError(502, 'Facebook did not confirm the published comment. It will not be retried automatically.');
  }

  public async testAlerts(): Promise<Record<string, unknown>> {
    if (!this.settings || !this.token) throw new FacebookConnectionError(400, 'Save a Facebook Page connection first.');
    const results: Record<string, unknown> = {};
    for (const [metric,field] of [['followers','followers_count'],['pageLikes','fan_count']] as const) {
      try { const page = await this.graph(this.settings.pageId, { fields: `id,${field}` }); results[metric] = { available: Number.isSafeInteger(page[field]), kind: 'aggregate-total' }; }
      catch (error) { results[metric] = { available: false, error: error instanceof FacebookConnectionError ? error.message : 'Count access could not be verified.' }; }
    }
    return { metrics: results, message: 'Read-only milestone access test completed. No alert was emitted.', namedFollows: false, stars: false, subscriptions: false };
  }

  /** Safe read-only connection test: no comment is published and no command is invoked. */
  public async test(): Promise<Record<string, unknown>> {
    if (!this.settings || !this.token) throw new FacebookConnectionError(400, 'Save a Facebook Page connection first.');
    const page = await this.graph(this.settings.pageId, { fields: 'id,name' });
    const videos = await this.graph(`${this.settings.pageId}/live_videos`, { fields: 'id,status,video{id}', limit: '25' });
    const live = records(videos['data']).find((video) => video['status'] === 'LIVE' && typeof video['id'] === 'string');
    if (live) await this.graph(`${String(live['id'])}/comments`, { fields: 'id,message,created_time,from', order: 'reverse_chronological', limit: '1' });
    const video = live?.['video'];
    const postingVideoId = video && typeof video === 'object' && !Array.isArray(video) ? (video as Record<string, unknown>)['id'] : undefined;
    return { pageVerified: page['id'] === this.settings.pageId, liveVideoFound: !!live, commentsVerified: !!live,
      ...(typeof postingVideoId === 'string' && /^\d{1,100}$/.test(postingVideoId) ? { timedCommentsVideoId: postingVideoId } : {}),
      message: live ? 'Live comments read succeeded. No comments were published by this test.' : 'Page and broadcast access succeeded. Go live to verify comment access.' };
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      this.pending = this.poll().finally(() => { this.pending = undefined; if (this.context && this.settings?.enabled && this.state !== 'error') this.schedule(this.nextDelayMs); });
    }, delay);
    this.timer.unref();
  }

  private async poll(): Promise<void> {
    const context = this.context;
    if (!context || !this.settings) return;
    this.request = new AbortController();
    try {
      const now = Date.now();
      // Keep chat responsive without repeatedly fetching the same video list and follower totals.
      let live: Record<string, unknown> | undefined = this.liveVideoId ? { id: this.liveVideoId, status: 'LIVE' } : undefined;
      if (!live || now >= this.nextVideoDiscoveryAt) {
        const videos = await this.graph(this.settings.pageId + '/live_videos', { fields: 'id,status,title,video{id}', limit: '25' });
        live = records(videos['data']).find((video) => video['status'] === 'LIVE' && typeof video['id'] === 'string');
        this.nextVideoDiscoveryAt = now + 30_000;
      }
      if ((live && this.liveVideoId !== live['id']) || (!live && this.liveVideoId)) {
        const video = live?.['video'];
        const videoId = video && typeof video === 'object' && !Array.isArray(video) ? (video as Record<string, unknown>)['id'] : undefined;
        await context.emit({ schemaVersion: '1.0.0', eventId: 'facebook-stream-' + randomUUID(), eventType: live ? 'stream.online' : 'stream.offline', platform: 'facebook', source: { adapter: 'facebook-page', eventName: 'Facebook.BroadcastStatus' }, receivedAt: new Date().toISOString(), channel: { id: this.settings.pageId, name: this.settings.pageName }, payload: {
          streamId: live ? String(live['id']) : this.liveVideoId,
          ...(typeof live?.['title'] === 'string' ? { title: live['title'] } : {}),
          ...(typeof videoId === 'string' && /^\d{1,100}$/.test(videoId) ? { videoId, streamUrl: `https://www.facebook.com/watch/?v=${videoId}` } : {}),
        }, metadata: { simulated: false, unverifiedFields: [] } });
      }
      if (this.settings.alerts.enabled && (!this.settings.alerts.onlyWhileLive || live)) {
        if (now >= this.nextMilestoneAt) {
          this.nextMilestoneAt = now + 60_000;
          await this.observeMilestones(context);
        }
      } else this.milestoneBaselinePending = true;
      if (!live) { this.liveVideoId = ''; this.initialized = false; this.state = 'connected'; this.lastError = undefined; this.reconnectAttempts = 0; this.nextDelayMs = 15000; return; }
      const id = String(live['id']);
      if (this.liveVideoId !== id) {
        this.liveVideoId = id; this.initialized = false; this.seen.clear();
      }
      const batch = await this.graph(`${id}/comments`, { fields: 'id,message,created_time,from', order: 'reverse_chronological', limit: '100' });
      // Never follow provider-supplied URLs: cursors and credentials remain on graph.facebook.com.
      const comments = records(batch['data']).map((value) => commentSchema.safeParse(value)).filter((value) => value.success).map((value) => value.data);
      for (const comment of [...comments].reverse()) {
        if (this.seen.has(comment.id)) continue;
        if (this.initialized && comment.message?.trim()) {
          await context.emit(normalizeFacebookComment(comment, this.settings.pageId, this.settings.pageName, id));
          this.received++; this.lastEventAt = new Date().toISOString();
        }
        this.seen.add(comment.id);
      }
      this.initialized = true;
      this.seen = new Set([...this.seen].slice(-5000));
      await this.save(this.cursorPath, { version: 1, videoId: id, commentIds: [...this.seen] });
      this.state = 'connected'; this.lastError = undefined; this.reconnectAttempts = 0; this.nextDelayMs = 5000;
    } catch (error) {
      if (this.request.signal.aborted) return;
      const message = error instanceof FacebookConnectionError ? error.message : 'Facebook comment polling failed. It will retry automatically.';
      this.lastError = message;
      this.nextVideoDiscoveryAt = 0;
      this.state = error instanceof FacebookConnectionError && error.statusCode === 401 ? 'error' : 'degraded';
      this.nextDelayMs = Math.min(60000, 5000 * 2 ** Math.min(++this.reconnectAttempts, 4));
      context.logger.warn('Facebook Page input needs attention', { adapter: this.name, detail: message });
    } finally { this.request = undefined; }
  }

  private async observeMilestones(context: AdapterContext): Promise<void> {
    if (!this.settings) return;
    const metrics: Array<[FacebookMetric,string]> = [];
    if (this.settings.alerts.followers) metrics.push(['followers','followers_count']);
    if (this.settings.alerts.pageLikes) metrics.push(['page-likes','fan_count']);
    try {
      const page = await this.graph(this.settings.pageId, { fields: ['id',...metrics.map(([,field])=>field)].join(',') });
      for (const [metric,field] of metrics) {
        const count = page[field];
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new FacebookConnectionError(502, 'Facebook did not return the requested milestone total.');
        const next = advanceFacebookMilestone(this.highWater[metric],count,this.settings.alerts.interval,this.milestoneBaselinePending);
        if (next.milestone !== undefined) {
          await context.emit(facebookMilestoneEvent(this.settings.pageId,this.settings.pageName,metric,next.milestone));
          this.milestonesReceived++;
        }
        this.highWater[metric] = next.highWater;
      }
      await this.save(this.milestonePath, { pageId: this.settings.pageId, highWater: this.highWater });
      this.milestoneBaselinePending = false; this.alertError = undefined;
    } catch (error) {
      if (this.request?.signal.aborted) return;
      this.alertError = error instanceof FacebookConnectionError ? error.message : 'Facebook milestone processing failed.';
      context.logger.warn('Facebook milestone input needs attention', { detail: this.alertError });
      // Count permission failures must not interrupt independently authorized chat.
    }
  }

  private async graph(path: string, query: Record<string, string>, token = this.token, apiVersion = this.settings?.apiVersion ?? 'v25.0', message?: string): Promise<Record<string, unknown>> {
    if (!/^[a-zA-Z0-9._-]+(?:\/(?:live_videos|comments))?$/.test(path)) throw new FacebookConnectionError(400, 'Invalid Facebook resource.');
    const url = new URL(`https://graph.facebook.com/${apiVersion}/${path}`);
    for (const [key,value] of Object.entries(query)) url.searchParams.set(key,value);
    const signal = this.request ? AbortSignal.any([this.request.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000);
    let response: Response;
    try { response = await this.fetcher(url, { headers: { authorization: `Bearer ${token}` }, signal, redirect: 'error', ...(message === undefined ? {} : { method: 'POST', body: new URLSearchParams({ message }) }) }); }
    catch { throw new FacebookConnectionError(502, 'Facebook could not be reached. Check your connection and API version.'); }
    if (Number(response.headers.get('content-length') ?? 0) > 1048576) throw new FacebookConnectionError(502, 'Facebook returned an oversized response.');
    const reader = response.body?.getReader();
    if (!reader) throw new FacebookConnectionError(502, 'Facebook returned an empty response.');
    const chunks: Uint8Array[] = []; let bytes = 0;
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 1048576) { await reader.cancel(); throw new FacebookConnectionError(502, 'Facebook returned an oversized response.'); } chunks.push(chunk.value); }
    let body: Record<string, unknown>;
    try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); body = value as Record<string, unknown>; }
    catch { throw new FacebookConnectionError(502, 'Facebook returned an invalid response.'); }
    if (!response.ok || body['error']) {
      const providerError = body['error'] as Record<string, unknown> | undefined;
      const code = providerError?.['code'];
      const subcode = providerError?.['error_subcode'];
      const diagnostic = [Number.isSafeInteger(code) ? 'Graph code ' + String(code) : '', Number.isSafeInteger(subcode) ? 'subcode ' + String(subcode) : ''].filter(Boolean).join(', ');
      const resource = path.endsWith('/comments') ? 'video comments' : path.endsWith('/live_videos') ? 'Page broadcasts' : 'Page details';
      if (code === 190) throw new FacebookConnectionError(401, 'Facebook authorization expired or was revoked. Reconnect the Page.');
      if (code === 10 || code === 200 || code === 283) throw new FacebookConnectionError(401, 'Facebook Page permissions are missing. Reauthorize with the required Page permissions.');
      throw new FacebookConnectionError(502, `Facebook ${resource} request failed (HTTP ${String(response.status)}${diagnostic ? "; " + diagnostic : ""}). Check Page access and API version.`);
    }
    return body;
  }

  private async save(path: string, value: unknown): Promise<void> {
    await mkdir(join(path, '..'), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value,null,2), { mode: 0o600 });
    await rename(temporary,path);
  }
}

function records(value: unknown): Record<string,unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string,unknown> => item !== null && typeof item === 'object' && !Array.isArray(item)) : []; }

export function normalizeFacebookComment(input: unknown, pageId: string, pageName: string, videoId: string): NormalizedEvent {
  const comment = commentSchema.parse(input);
  const message = comment.message?.trim().slice(0,2000);
  if (!message) throw new Error('Facebook comment has no text.');
  const displayName = comment.from?.name?.trim() || 'Facebook Viewer';
  return { schemaVersion: '1.0.0', eventId: `facebook-comment-${pageId}-${comment.id}`, eventType: 'chat.message', platform: 'facebook',
    source: { adapter: 'facebook-page', eventId: comment.id, eventName: 'Facebook.LiveComment' }, receivedAt: new Date().toISOString(),
    channel: { id: pageId, name: pageName },
    user: { ...(comment.from?.id ? { id: comment.from.id } : {}), name: displayName, displayName, actorType: comment.from?.id === pageId ? 'bot' : 'human', roles: [] },
    payload: { message, videoId, ...(comment.from?.id === pageId ? { fromConnectedAccount: true } : {}) },
    metadata: { simulated: false, unverifiedFields: comment.from?.id ? [] : ['user.id'] },
  };
}
