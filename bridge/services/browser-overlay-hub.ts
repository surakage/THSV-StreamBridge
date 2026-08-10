import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { BrowserOverlayConfig } from '../../schemas/config.js';
import { BROWSER_OVERLAY_CONTRACT_VERSION, projectBrowserOverlayEvents } from '../core/browser-overlay.js';
import type { Logger } from './logger.js';
import type { AddOnOverlayLifecycleV2, AddOnOverlayPresentationLaneV2, AddOnOverlayPublishOptionsV2 } from '../contracts/v2/addon-capability.js';

const MODULE_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;
const PLAYBACK_ID = /^[A-Za-z0-9._:-]{1,100}$/u;
const RENDERER_ID = /^[A-Za-z0-9._:-]{1,100}$/u;
const LIFECYCLE_PHASES = new Set<AddOnOverlayLifecycleV2['phase']>(['loading', 'started', 'heartbeat', 'ended', 'stopped', 'failed', 'timeout']);
const DEFAULT_MEDIA_REPLAY_TTL_MS = 600_000;
const MIN_MEDIA_REPLAY_TTL_MS = 120_000;
const MAX_MEDIA_REPLAY_TTL_MS = 7_200_000;
const MEDIA_START_RETRY_MS = 2_000;
const MAXIMUM_PRESENTATION_DURATION_MS = 600_000;

interface ActiveMediaMessage {
  readonly playbackId: string;
  readonly message: string;
  readonly expiresAt: number;
}

interface QueuedPresentation {
  readonly owner: string;
  readonly topic: string;
  readonly lane: 'foreground';
  readonly queuedAt: number;
  readonly durationMs: number;
  readonly playbackId?: string;
  readonly dispatch: () => void;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

export class BrowserOverlayHub {
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });
  private attachedServer: Server | undefined;
  private published = 0;
  private addOnPublished = 0;
  private addOnLifecycleReports = 0;
  private readonly lifecycleListeners = new Map<string, Set<(event: AddOnOverlayLifecycleV2) => void>>();
  private readonly addOnSubscriptions = new Map<WebSocket, Map<string, Set<string>>>();
  private readonly activePlaybackIds = new Map<string, Map<string, number>>();
  private readonly activeMediaMessages = new Map<string, Map<string, ActiveMediaMessage>>();
  private readonly startedPlaybackIds = new Map<string, Set<string>>();
  private readonly playbackOwners = new Map<string, Map<string, string>>();
  private readonly retainedLabelMessages = new Map<string, string>();
  private readonly presentationQueue: QueuedPresentation[] = [];
  private readonly livePlatforms = new Set<string>();
  private activePresentation: QueuedPresentation | undefined;
  private presentationTimer: NodeJS.Timeout | undefined;
  private readonly mediaStartRetryTimer: NodeJS.Timeout;
  private readonly upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (request.url !== '/overlay/events' || !isLoopback(request.socket.remoteAddress) || !isTrustedOverlayOrigin(request)) { socket.destroy(); return; }
    this.sockets.handleUpgrade(request, socket, head, (client) => this.sockets.emit('connection', client, request));
  };

  public constructor(private readonly logger: Logger, private readonly config: BrowserOverlayConfig) {
    this.sockets.on('connection', (socket) => {
      this.addOnSubscriptions.set(socket, new Map());
      socket.send(JSON.stringify({ contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION, kind: 'hub.ready', emittedAt: new Date().toISOString() }));
      this.replayActiveMedia(socket);
      this.replayRetainedLabels(socket);
      this.logger.info('Browser overlay client connected', { clients: this.sockets.clients.size });
      socket.on('close', () => { this.addOnSubscriptions.delete(socket); this.logger.info('Browser overlay client disconnected', { clients: this.sockets.clients.size }); });
      socket.on('message', (data) => this.receiveClientMessage(rawDataText(data), socket));
    });
    this.mediaStartRetryTimer = setInterval(() => this.replayUnstartedMedia(), MEDIA_START_RETRY_MS);
    this.mediaStartRetryTimer.unref();
  }

  public attach(server: Server): void {
    if (this.attachedServer === server) return;
    if (this.attachedServer !== undefined) throw new Error('Browser overlay hub is already attached');
    this.attachedServer = server;
    server.on('upgrade', this.upgrade);
  }

  public publish(event: NormalizedEvent): void {
    if (!event.metadata.simulated && event.eventType === 'stream.online') this.livePlatforms.add(event.platform);
    else if (!event.metadata.simulated && event.eventType === 'stream.offline') {
      this.livePlatforms.delete(event.platform);
      if (this.livePlatforms.size === 0) this.resetSurfaces('stream-offline');
    }
    if (!this.config.enabled || (!this.config.showSimulated && event.metadata.simulated) || (!this.config.showBots && event.eventType === 'chat.message' && event.user?.actorType === 'bot')) return;
    if (event.eventType === 'chat.message' && ignoredChatActor(event, this.config.chat.ignoredNames)) return;
    const overlayEvents = projectBrowserOverlayEvents(event, this.config);
    for (const overlayEvent of overlayEvents) {
      const message = JSON.stringify(overlayEvent);
      if (overlayEvent.kind === 'alert.show') {
        void this.enqueuePresentation('core.alerts', 'alert.show', overlayEvent.payload.display.durationMs, () => this.broadcast(message)).catch((error: unknown) => this.logger.warn('Overlay alert presentation was dropped', { error }));
      } else this.broadcast(message);
    }
    if (overlayEvents.length > 0) this.published += 1;
  }

  public publishPreview(event: NormalizedEvent, override: BrowserOverlayConfig): number {
    const previewEvent: NormalizedEvent = { ...event, metadata: { ...event.metadata, simulated: true, bridgeSequence: event.metadata.bridgeSequence ?? Number.MAX_SAFE_INTEGER } };
    const overlayEvents = projectBrowserOverlayEvents(previewEvent, { ...override, showSimulated: true, chat: { ...override.chat, events: { ...override.chat.events, enabled: false } } });
    for (const overlayEvent of overlayEvents) {
      const message = JSON.stringify(overlayEvent);
      this.broadcast(message);
    }
    if (overlayEvents.length > 0) this.published += 1;
    return overlayEvents.length;
  }

  public publishAddOn(moduleId: string, topic: string, payload: Readonly<Record<string, unknown>>, options?: AddOnOverlayPublishOptionsV2): Promise<void> {
    if (!this.config.enabled) throw new Error('Browser overlays are disabled.');
    let playbackId: string | undefined;
    if (topic === `${moduleId}.media.play`) {
      playbackId = payload['playbackId'] as string | undefined;
      if (typeof playbackId !== 'string' || !PLAYBACK_ID.test(playbackId)) throw new Error('Add-on media playback requires a valid playbackId.');
    } else if (topic === `${moduleId}.media.stop`) {
      this.activePlaybackIds.delete(moduleId);
      this.activeMediaMessages.delete(moduleId);
      this.startedPlaybackIds.delete(moduleId);
      this.playbackOwners.delete(moduleId);
    }
    const message = JSON.stringify({
      contractVersion: 'thsv-addon-overlay-v1',
      kind: 'addon.publish',
      moduleId,
      topic,
      emittedAt: new Date().toISOString(),
      payload,
    });
    const dispatch = (): void => {
      if (playbackId !== undefined) {
        const now = Date.now(); const active = this.activePlaybackIds.get(moduleId) ?? new Map<string, number>();
        this.pruneActiveMedia(now);
        if (active.size >= 50 && !active.has(playbackId)) throw new Error('Add-on media playback has too many unresolved lifecycle IDs.');
        active.set(playbackId, now); this.activePlaybackIds.set(moduleId, active); this.startedPlaybackIds.get(moduleId)?.delete(playbackId);
        const messages = this.activeMediaMessages.get(moduleId) ?? new Map<string, ActiveMediaMessage>();
        messages.set(playbackId, { playbackId, message, expiresAt: now + mediaReplayTtl(payload['durationMs']) }); this.activeMediaMessages.set(moduleId, messages);
      }
      if (topic === `${moduleId}.labels.update`) {
        if (!this.retainedLabelMessages.has(moduleId) && this.retainedLabelMessages.size >= 200) throw new Error('Too many add-on label snapshots are retained.');
        this.retainedLabelMessages.set(moduleId, message);
      }
      this.broadcast(message); this.addOnPublished += 1;
    };
    if (isPresentationStopTopic(moduleId, topic)) { this.cancelPresentations(moduleId); dispatch(); return Promise.resolve(); }
    const lane = presentationLane(moduleId, topic, payload, options?.lane);
    if (lane !== 'foreground') { dispatch(); return Promise.resolve(); }
    // A module event handler owns a short-lived capability grant. Holding this promise until
    // every earlier card finishes can outlive that grant and make later settlement/state work
    // fail even though the presentation was accepted correctly. Resolve on bounded queue
    // acceptance; dispatch failures are host-owned and remain visible in the bridge log.
    const presentation = this.enqueuePresentation(moduleId, topic, presentationDuration(topic, payload, this.config.alertDurationMs), dispatch, playbackId);
    void presentation.catch((error: unknown) => this.logger.warn('Queued add-on overlay presentation failed', { moduleId, topic, error }));
    return Promise.resolve();
  }

  public subscribeAddOnLifecycle(moduleId: string, listener: (event: AddOnOverlayLifecycleV2) => void): () => void {
    if (!MODULE_ID.test(moduleId)) throw new Error('Invalid add-on module ID for overlay lifecycle subscription.');
    const listeners = this.lifecycleListeners.get(moduleId) ?? new Set<(event: AddOnOverlayLifecycleV2) => void>();
    listeners.add(listener); this.lifecycleListeners.set(moduleId, listeners);
    return () => { listeners.delete(listener); if (listeners.size === 0) this.lifecycleListeners.delete(moduleId); };
  }

  public status(): Readonly<Record<string, unknown>> {
    const addOnClients: Record<string, number> = {};
    for (const subscriptions of this.addOnSubscriptions.values()) {
      for (const [moduleId, renderers] of subscriptions) addOnClients[moduleId] = (addOnClients[moduleId] ?? 0) + renderers.size;
    }
    return { enabled: this.config.enabled, clients: this.sockets.clients.size, addOnClients, published: this.published, addOnPublished: this.addOnPublished, addOnLifecycleReports: this.addOnLifecycleReports, retainedLabelSnapshots: this.retainedLabelMessages.size, livePlatforms: [...this.livePlatforms], lifecycleSubscribers: [...this.lifecycleListeners.values()].reduce((total, listeners) => total + listeners.size, 0), presentationQueue: { active: this.activePresentation === undefined ? null : { owner: this.activePresentation.owner, topic: this.activePresentation.topic, lane: this.activePresentation.lane, durationMs: this.activePresentation.durationMs, queuedAt: new Date(this.activePresentation.queuedAt).toISOString() }, queued: this.presentationQueue.map((entry) => ({ owner: entry.owner, topic: entry.topic, lane: entry.lane, durationMs: entry.durationMs, queuedAt: new Date(entry.queuedAt).toISOString() })), gapMs: this.config.overlayGapMs } };
  }
  public clientConfig(): BrowserOverlayConfig { return { ...this.config }; }

  public stop(): void {
    clearInterval(this.mediaStartRetryTimer);
    if (this.attachedServer !== undefined) this.attachedServer.off('upgrade', this.upgrade);
    this.attachedServer = undefined;
    for (const socket of this.sockets.clients) socket.close(1001, 'Bridge stopping');
    this.sockets.close();
    this.lifecycleListeners.clear();
    this.addOnSubscriptions.clear();
    this.activePlaybackIds.clear();
    this.activeMediaMessages.clear();
    this.startedPlaybackIds.clear();
    this.playbackOwners.clear();
    this.retainedLabelMessages.clear();
    this.livePlatforms.clear();
    if (this.presentationTimer !== undefined) clearTimeout(this.presentationTimer);
    this.presentationTimer = undefined; this.activePresentation = undefined;
    for (const entry of this.presentationQueue.splice(0)) entry.reject(new Error('Overlay presentation queue stopped.'));
  }

  private broadcast(message: string): void {
    for (const socket of this.sockets.clients) if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }

  private resetSurfaces(reason: 'stream-offline'): void {
    this.activePlaybackIds.clear();
    this.activeMediaMessages.clear();
    this.startedPlaybackIds.clear();
    this.playbackOwners.clear();
    this.retainedLabelMessages.clear();
    if (this.presentationTimer !== undefined) clearTimeout(this.presentationTimer);
    this.presentationTimer = undefined;
    this.activePresentation = undefined;
    for (const entry of this.presentationQueue.splice(0)) entry.reject(new Error(`Overlay presentation queue reset: ${reason}.`));
    this.broadcast(JSON.stringify({ contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION, kind: 'overlay.reset', reason, emittedAt: new Date().toISOString() }));
    this.logger.info('Browser overlay surfaces reset', { reason });
  }

  private enqueuePresentation(owner: string, topic: string, durationMs: number, dispatch: () => void, playbackId?: string): Promise<void> {
    if (this.presentationQueue.length >= this.config.maxAlertQueue) throw new Error('The shared overlay presentation queue is full.');
    return new Promise<void>((resolve, reject) => {
      this.presentationQueue.push({ owner, topic, lane: 'foreground', queuedAt: Date.now(), durationMs: Math.max(1_000, Math.min(MAXIMUM_PRESENTATION_DURATION_MS, Math.ceil(durationMs))), ...(playbackId === undefined ? {} : { playbackId }), dispatch, resolve, reject });
      this.drainPresentationQueue();
    });
  }

  private drainPresentationQueue(): void {
    if (this.activePresentation !== undefined || this.presentationTimer !== undefined) return;
    const next = this.presentationQueue.shift(); if (next === undefined) return;
    this.activePresentation = next;
    try { next.dispatch(); next.resolve(); }
    catch (error) { next.reject(error instanceof Error ? error : new Error(String(error))); this.activePresentation = undefined; this.drainPresentationQueue(); return; }
    this.presentationTimer = setTimeout(() => this.finishActivePresentation(), next.durationMs);
    this.presentationTimer.unref();
  }

  private finishActivePresentation(): void {
    if (this.presentationTimer !== undefined) clearTimeout(this.presentationTimer);
    this.presentationTimer = undefined; this.activePresentation = undefined;
    this.presentationTimer = setTimeout(() => { this.presentationTimer = undefined; this.drainPresentationQueue(); }, this.config.overlayGapMs);
    this.presentationTimer.unref();
  }

  private cancelPresentations(owner: string): void {
    for (let index = this.presentationQueue.length - 1; index >= 0; index -= 1) {
      const entry = this.presentationQueue[index]; if (entry?.owner !== owner) continue;
      this.presentationQueue.splice(index, 1); entry.reject(new Error(`Overlay presentation for ${owner} was cancelled.`));
    }
    if (this.activePresentation?.owner === owner) this.finishActivePresentation();
  }

  private replayActiveMedia(socket: WebSocket): void {
    this.pruneActiveMedia(Date.now());
    for (const messages of this.activeMediaMessages.values()) {
      for (const active of messages.values()) socket.send(active.message);
    }
  }

  private replayRetainedLabels(socket: WebSocket): void {
    for (const message of this.retainedLabelMessages.values()) socket.send(message);
  }

  private replayUnstartedMedia(): void {
    this.pruneActiveMedia(Date.now());
    for (const [moduleId, messages] of this.activeMediaMessages) {
      const started = this.startedPlaybackIds.get(moduleId);
      for (const active of messages.values()) {
        if (started?.has(active.playbackId)) continue;
        for (const socket of this.sockets.clients) if (socket.readyState === WebSocket.OPEN) socket.send(active.message);
      }
    }
  }

  private pruneActiveMedia(now: number): void {
    for (const [moduleId, messages] of this.activeMediaMessages) {
      const active = this.activePlaybackIds.get(moduleId);
      for (const [playbackId, media] of messages) {
        if (media.expiresAt > now) continue;
        messages.delete(playbackId);
        active?.delete(playbackId);
      }
      if (messages.size === 0) this.activeMediaMessages.delete(moduleId);
      if (active?.size === 0) this.activePlaybackIds.delete(moduleId);
      const started = this.startedPlaybackIds.get(moduleId);
      for (const playbackId of started ?? []) if (!messages.has(playbackId)) started?.delete(playbackId);
      if (started?.size === 0) this.startedPlaybackIds.delete(moduleId);
      const owners = this.playbackOwners.get(moduleId);
      for (const playbackId of owners?.keys() ?? []) if (!messages.has(playbackId)) owners?.delete(playbackId);
      if (owners?.size === 0) this.playbackOwners.delete(moduleId);
    }
  }

  private receiveClientMessage(raw: string, socket?: WebSocket): void {
    if (raw.length > 8_192) return;
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (value['contractVersion'] !== 'thsv-addon-overlay-v1') return;
      if ((value['kind'] === 'addon.subscribe' || value['kind'] === 'addon.unsubscribe') && socket !== undefined) {
        const moduleId = value['moduleId']; const rendererId = value['rendererId'];
        if (typeof moduleId !== 'string' || !MODULE_ID.test(moduleId) || typeof rendererId !== 'string' || !RENDERER_ID.test(rendererId)) return;
        const subscriptions = this.addOnSubscriptions.get(socket) ?? new Map<string, Set<string>>();
        const renderers = subscriptions.get(moduleId) ?? new Set<string>();
        if (value['kind'] === 'addon.subscribe') {
          if (renderers.size >= 100) return;
          renderers.add(rendererId); subscriptions.set(moduleId, renderers); this.addOnSubscriptions.set(socket, subscriptions);
        } else {
          renderers.delete(rendererId);
          if (renderers.size === 0) subscriptions.delete(moduleId);
        }
        return;
      }
      if (value['kind'] !== 'addon.lifecycle') return;
      const moduleId = value['moduleId']; const playbackId = value['playbackId']; const phase = value['phase'];
      if (typeof moduleId !== 'string' || !MODULE_ID.test(moduleId) || typeof playbackId !== 'string' || !PLAYBACK_ID.test(playbackId) || !isLifecyclePhase(phase)) return;
      const suppliedRendererId = value['rendererId'];
      if (suppliedRendererId !== undefined && (typeof suppliedRendererId !== 'string' || !RENDERER_ID.test(suppliedRendererId))) return;
      const rendererId = typeof suppliedRendererId === 'string' ? suppliedRendererId : 'legacy-renderer';
      const active = this.activePlaybackIds.get(moduleId);
      if (active === undefined || !active.has(playbackId)) return;
      const owners = this.playbackOwners.get(moduleId) ?? new Map<string, string>();
      const owner = owners.get(playbackId);
      if (phase === 'started' || phase === 'heartbeat') {
        if (owner !== undefined && owner !== rendererId) return;
        owners.set(playbackId, rendererId);
        this.playbackOwners.set(moduleId, owners);
      } else if (phase === 'ended' || phase === 'stopped' || phase === 'failed' || phase === 'timeout') {
        // An OBS source on a hidden scene can fail or time out while the visible source is still
        // playing. Ignore all terminal reports until a renderer has claimed ownership by
        // actually starting, then accept completion only from that same renderer.
        if (owner === undefined || owner !== rendererId) return;
      }
      const numeric = (name: string): number | undefined => { const candidate = value[name]; return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 && candidate <= 86_400 ? candidate : undefined; };
      const currentTime = numeric('currentTime'); const duration = numeric('duration'); const error = typeof value['error'] === 'string' ? value['error'].slice(0, 300) : undefined;
      const event: AddOnOverlayLifecycleV2 = { playbackId, phase, occurredAt: new Date().toISOString(), ...(currentTime === undefined ? {} : { currentTime }), ...(duration === undefined ? {} : { duration }), ...(error === undefined ? {} : { error }) };
      if (phase === 'started' || phase === 'heartbeat') {
        const started = this.startedPlaybackIds.get(moduleId) ?? new Set<string>();
        started.add(playbackId);
        this.startedPlaybackIds.set(moduleId, started);
      }
      this.addOnLifecycleReports += 1;
      for (const listener of this.lifecycleListeners.get(moduleId) ?? []) { try { listener(event); } catch (listenerError) { this.logger.warn('Add-on overlay lifecycle listener failed', { moduleId, playbackId, phase, error: listenerError }); } }
      if (phase === 'ended' || phase === 'stopped' || phase === 'failed' || phase === 'timeout') {
        active.delete(playbackId);
        const messages = this.activeMediaMessages.get(moduleId);
        messages?.delete(playbackId);
        this.startedPlaybackIds.get(moduleId)?.delete(playbackId);
        owners.delete(playbackId);
        if (messages?.size === 0) this.activeMediaMessages.delete(moduleId);
        if (this.startedPlaybackIds.get(moduleId)?.size === 0) this.startedPlaybackIds.delete(moduleId);
        if (owners.size === 0) this.playbackOwners.delete(moduleId);
        if (active.size === 0) this.activePlaybackIds.delete(moduleId);
        if (this.activePresentation?.owner === moduleId && this.activePresentation.playbackId === playbackId) this.finishActivePresentation();
      }
    } catch { /* Ignore malformed browser-source reports. */ }
  }
}

function mediaReplayTtl(durationMs: unknown): number {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return DEFAULT_MEDIA_REPLAY_TTL_MS;
  return Math.min(MAX_MEDIA_REPLAY_TTL_MS, Math.max(MIN_MEDIA_REPLAY_TTL_MS, Math.ceil(durationMs) + 120_000));
}

function presentationLane(moduleId: string, topic: string, payload: Readonly<Record<string, unknown>>, requested?: AddOnOverlayPresentationLaneV2): AddOnOverlayPresentationLaneV2 {
  if (payload['preview'] === true || payload['templatePreview'] === true) return 'preview';
  if (requested !== undefined) return requested;
  // Backward-compatible classification for third-party packages built before explicit lanes.
  if (moduleId === 'thsv.accessibility-captions') return 'independent';
  if (topic.endsWith('.media.play') || topic.endsWith('.media.stop')) return 'media';
  if (topic.endsWith('.timer.update') || topic.endsWith('.timer.hide')) return 'timer';
  if (topic.endsWith('.labels.update') || topic.endsWith('.counter.update') || topic.endsWith('.poll.update') || topic.endsWith('.queue.update')) return 'persistent';
  if (topic.endsWith('.card.show') || topic.endsWith('.result.show') || topic.endsWith('.wheel.spin') || topic.endsWith('.hydration.update')) return 'foreground';
  return 'independent';
}

function isPresentationStopTopic(moduleId: string, topic: string): boolean {
  return topic === `${moduleId}.card.hide` || topic === `${moduleId}.result.hide` || topic === `${moduleId}.media.stop` || topic === `${moduleId}.wheel.stop` || topic === `${moduleId}.hydration.hide`;
}

function presentationDuration(topic: string, payload: Readonly<Record<string, unknown>>, fallback: number): number {
  if (topic.endsWith('.wheel.spin')) return boundedDuration(payload['spinDurationMs'], 1_000, 120_000, fallback) + boundedDuration(payload['winnerDurationMs'], 1_000, 60_000, fallback);
  return boundedDuration(payload['durationMs'], 1_000, MAXIMUM_PRESENTATION_DURATION_MS, fallback);
}

function boundedDuration(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.ceil(value))) : fallback;
}

function isLifecyclePhase(value: unknown): value is AddOnOverlayLifecycleV2['phase'] {
  return typeof value === 'string' && LIFECYCLE_PHASES.has(value as AddOnOverlayLifecycleV2['phase']);
}

function rawDataText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

function ignoredChatActor(event: NormalizedEvent, ignoredNames: readonly string[]): boolean {
  if (event.user === undefined || ignoredNames.length === 0) return false;
  const ignored = new Set(ignoredNames.map((name) => name.trim().toLocaleLowerCase('en-US')));
  return [event.user.name, event.user.displayName].some((name) => typeof name === 'string' && ignored.has(name.trim().toLocaleLowerCase('en-US')));
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isTrustedOverlayOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true; // Non-browser test/diagnostic clients have no ambient-origin attack.
  if (request.headers.host === undefined) return false;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol)
      && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
      && url.host === request.headers.host
      && url.username.length === 0
      && url.password.length === 0;
  } catch { return false; }
}
