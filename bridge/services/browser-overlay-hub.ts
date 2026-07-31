import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { BrowserOverlayConfig } from '../../schemas/config.js';
import { BROWSER_OVERLAY_CONTRACT_VERSION, projectBrowserOverlayEvents } from '../core/browser-overlay.js';
import type { Logger } from './logger.js';
import type { AddOnOverlayLifecycleV2 } from '../contracts/v2/addon-capability.js';

const MODULE_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;
const PLAYBACK_ID = /^[A-Za-z0-9._:-]{1,100}$/u;
const RENDERER_ID = /^[A-Za-z0-9._:-]{1,100}$/u;
const LIFECYCLE_PHASES = new Set<AddOnOverlayLifecycleV2['phase']>(['loading', 'started', 'heartbeat', 'ended', 'stopped', 'failed', 'timeout']);
const DEFAULT_MEDIA_REPLAY_TTL_MS = 600_000;
const MIN_MEDIA_REPLAY_TTL_MS = 120_000;
const MAX_MEDIA_REPLAY_TTL_MS = 7_200_000;
const MEDIA_START_RETRY_MS = 2_000;

interface ActiveMediaMessage {
  readonly playbackId: string;
  readonly message: string;
  readonly expiresAt: number;
}

export class BrowserOverlayHub {
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });
  private attachedServer: Server | undefined;
  private published = 0;
  private addOnPublished = 0;
  private addOnLifecycleReports = 0;
  private readonly lifecycleListeners = new Map<string, Set<(event: AddOnOverlayLifecycleV2) => void>>();
  private readonly activePlaybackIds = new Map<string, Map<string, number>>();
  private readonly activeMediaMessages = new Map<string, Map<string, ActiveMediaMessage>>();
  private readonly startedPlaybackIds = new Map<string, Set<string>>();
  private readonly playbackOwners = new Map<string, Map<string, string>>();
  private readonly mediaStartRetryTimer: NodeJS.Timeout;
  private readonly upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (request.url !== '/overlay/events' || !isLoopback(request.socket.remoteAddress) || !isTrustedOverlayOrigin(request)) { socket.destroy(); return; }
    this.sockets.handleUpgrade(request, socket, head, (client) => this.sockets.emit('connection', client, request));
  };

  public constructor(private readonly logger: Logger, private readonly config: BrowserOverlayConfig) {
    this.sockets.on('connection', (socket) => {
      socket.send(JSON.stringify({ contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION, kind: 'hub.ready', emittedAt: new Date().toISOString() }));
      this.replayActiveMedia(socket);
      this.logger.info('Browser overlay client connected', { clients: this.sockets.clients.size });
      socket.on('close', () => this.logger.info('Browser overlay client disconnected', { clients: this.sockets.clients.size }));
      socket.on('message', (data) => this.receiveClientMessage(rawDataText(data)));
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
    if (!this.config.enabled || (!this.config.showSimulated && event.metadata.simulated) || (!this.config.showBots && event.eventType === 'chat.message' && event.user?.actorType === 'bot')) return;
    if (event.eventType === 'chat.message' && ignoredChatActor(event, this.config.chat.ignoredNames)) return;
    const overlayEvents = projectBrowserOverlayEvents(event, this.config);
    for (const overlayEvent of overlayEvents) {
      const message = JSON.stringify(overlayEvent);
      for (const socket of this.sockets.clients) if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
    if (overlayEvents.length > 0) this.published += 1;
  }

  public publishPreview(event: NormalizedEvent, override: BrowserOverlayConfig): number {
    const previewEvent: NormalizedEvent = { ...event, metadata: { ...event.metadata, simulated: true, bridgeSequence: event.metadata.bridgeSequence ?? Number.MAX_SAFE_INTEGER } };
    const overlayEvents = projectBrowserOverlayEvents(previewEvent, { ...override, showSimulated: true, chat: { ...override.chat, events: { ...override.chat.events, enabled: false } } });
    for (const overlayEvent of overlayEvents) {
      const message = JSON.stringify(overlayEvent);
      for (const socket of this.sockets.clients) if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
    if (overlayEvents.length > 0) this.published += 1;
    return overlayEvents.length;
  }

  public publishAddOn(moduleId: string, topic: string, payload: Readonly<Record<string, unknown>>): void {
    if (!this.config.enabled) throw new Error('Browser overlays are disabled.');
    let playbackId: string | undefined;
    if (topic === `${moduleId}.media.play`) {
      playbackId = payload['playbackId'] as string | undefined;
      if (typeof playbackId !== 'string' || !PLAYBACK_ID.test(playbackId)) throw new Error('Add-on media playback requires a valid playbackId.');
      const now = Date.now();
      const active = this.activePlaybackIds.get(moduleId) ?? new Map<string, number>();
      this.pruneActiveMedia(now);
      if (active.size >= 50 && !active.has(playbackId)) throw new Error('Add-on media playback has too many unresolved lifecycle IDs.');
      active.set(playbackId, now); this.activePlaybackIds.set(moduleId, active);
      this.startedPlaybackIds.get(moduleId)?.delete(playbackId);
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
    if (playbackId !== undefined) {
      const messages = this.activeMediaMessages.get(moduleId) ?? new Map<string, ActiveMediaMessage>();
      messages.set(playbackId, { playbackId, message, expiresAt: Date.now() + mediaReplayTtl(payload['durationMs']) });
      this.activeMediaMessages.set(moduleId, messages);
    }
    for (const socket of this.sockets.clients) if (socket.readyState === WebSocket.OPEN) socket.send(message);
    this.addOnPublished += 1;
  }

  public subscribeAddOnLifecycle(moduleId: string, listener: (event: AddOnOverlayLifecycleV2) => void): () => void {
    if (!MODULE_ID.test(moduleId)) throw new Error('Invalid add-on module ID for overlay lifecycle subscription.');
    const listeners = this.lifecycleListeners.get(moduleId) ?? new Set<(event: AddOnOverlayLifecycleV2) => void>();
    listeners.add(listener); this.lifecycleListeners.set(moduleId, listeners);
    return () => { listeners.delete(listener); if (listeners.size === 0) this.lifecycleListeners.delete(moduleId); };
  }

  public status(): Readonly<Record<string, unknown>> { return { enabled: this.config.enabled, clients: this.sockets.clients.size, published: this.published, addOnPublished: this.addOnPublished, addOnLifecycleReports: this.addOnLifecycleReports, lifecycleSubscribers: [...this.lifecycleListeners.values()].reduce((total, listeners) => total + listeners.size, 0) }; }
  public clientConfig(): BrowserOverlayConfig { return { ...this.config }; }

  public stop(): void {
    clearInterval(this.mediaStartRetryTimer);
    if (this.attachedServer !== undefined) this.attachedServer.off('upgrade', this.upgrade);
    this.attachedServer = undefined;
    for (const socket of this.sockets.clients) socket.close(1001, 'Bridge stopping');
    this.sockets.close();
    this.lifecycleListeners.clear();
    this.activePlaybackIds.clear();
    this.activeMediaMessages.clear();
    this.startedPlaybackIds.clear();
    this.playbackOwners.clear();
  }

  private replayActiveMedia(socket: WebSocket): void {
    this.pruneActiveMedia(Date.now());
    for (const messages of this.activeMediaMessages.values()) {
      for (const active of messages.values()) socket.send(active.message);
    }
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

  private receiveClientMessage(raw: string): void {
    if (raw.length > 8_192) return;
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (value['contractVersion'] !== 'thsv-addon-overlay-v1' || value['kind'] !== 'addon.lifecycle') return;
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
      }
    } catch { /* Ignore malformed browser-source reports. */ }
  }
}

function mediaReplayTtl(durationMs: unknown): number {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return DEFAULT_MEDIA_REPLAY_TTL_MS;
  return Math.min(MAX_MEDIA_REPLAY_TTL_MS, Math.max(MIN_MEDIA_REPLAY_TTL_MS, Math.ceil(durationMs) + 120_000));
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
