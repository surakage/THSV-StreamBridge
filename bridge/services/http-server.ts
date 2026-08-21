import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { BridgeConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { ALERT_PLATFORM_VALUES, PLATFORM_ALERT_TYPES, alertPresentationSchema } from '../../schemas/config.js';
import { buildNormalizedEvent } from '../adapters/normalization.js';
import type { IngestResult } from '../core/bridge.js';
import { InvalidEventError, PayloadTooLargeError } from '../core/bridge.js';
import { OutputCapacityError, OutputUnavailableError } from '../core/delivery-manager.js';
import { UnknownTimedActionError } from '../adapters/timed-actions-adapter.js';
import type { Logger } from './logger.js';
import { MutableRequestGuard, RequestGuardError } from './request-guard.js';
import type { BrowserOverlayHub } from './browser-overlay-hub.js';
import { WizardConfigurationError, WizardTransactionError } from './wizard-service.js';
import type { WizardService } from './wizard-service.js';
import { AddOnWizardError } from './addon-wizard-service.js';
import type { ChatGuardAdminRequestV1, ChatGuardAdminResultV1, CommunityAnalyticsAdminRequestV1, CommunityAnalyticsAdminResultV1, FollowerPulseAdminRequestV1, FollowerPulseAdminResultV1, QuoteVaultAdminRequestV1, QuoteVaultAdminResultV1, ViewerFoundationAdminRequestV1, ViewerFoundationAdminResultV1, ViewerSpotlightAdminRequestV1, ViewerSpotlightAdminResultV1, VillageDrawAdminRequestV1, VillageDrawAdminResultV1 } from '../contracts/v2/addon-capability.js';
import { readCachedClip } from './clip-media-cache.js';
import type { CommandDirectoryService } from './command-directory.js';
import type { OutboundMessageDelivery, OutboundMessageRequest, OutboundPlatform } from '../core/outbound-message-router.js';
import { MAIN_FEATURE_FAMILIES } from '../core/main-feature-registry.js';
import { prepareSupportBundle, type SupportBundleResult, type SupportBundlePreview } from './support-bundle-service.js';
import { LiveAcceptanceError } from './live-acceptance-service.js';
import { ObsSourceInventoryError } from './obs-source-inventory-service.js';
import { comparePreStreamReports, createPreStreamReport, PreStreamReportError } from './pre-stream-report-service.js';

export interface DiagnosticsTarget {
  health(): Readonly<Record<string, unknown>>;
  readiness(): Readonly<Record<string, unknown>>;
  diagnostics(): Readonly<Record<string, unknown>>;
  simulate(input: unknown, byteLength?: number): Promise<IngestResult>;
  controlTimedActions(operation: 'start' | 'stop' | 'pause' | 'resume'): Promise<Readonly<Record<string, unknown>>>;
  testTimedAction?(id: string): Promise<Readonly<Record<string, unknown>>>;
  administerViewerFoundation?(request: ViewerFoundationAdminRequestV1): Promise<ViewerFoundationAdminResultV1>;
  administerCommunityAnalytics?(request: CommunityAnalyticsAdminRequestV1): Promise<CommunityAnalyticsAdminResultV1>;
  administerQuoteVault?(request: QuoteVaultAdminRequestV1): Promise<QuoteVaultAdminResultV1>;
  administerViewerSpotlight?(request: ViewerSpotlightAdminRequestV1): Promise<ViewerSpotlightAdminResultV1>;
  administerChatGuard?(request: ChatGuardAdminRequestV1): Promise<ChatGuardAdminResultV1>;
  administerVillageDraw?(request: VillageDrawAdminRequestV1): Promise<VillageDrawAdminResultV1>;
  administerFollowerPulse?(request: FollowerPulseAdminRequestV1): Promise<FollowerPulseAdminResultV1>;
  resetAddOnCoordination?(resource?: string): Readonly<Record<string, unknown>>;
}

export interface DockChatController {
  readonly enabledPlatforms: readonly OutboundPlatform[];
  send(request: OutboundMessageRequest): Promise<readonly OutboundMessageDelivery[]>;
}

class UnsupportedContentEncodingError extends Error {}
class OverlayAssetError extends Error {}

const ADD_ON_OVERLAY_ALIASES = Object.freeze<Record<string, string>>({
  '/overlay/shoutouts': 'thsv.automated-shoutouts',
  '/overlay/clips': 'thsv.random-clip-player',
  '/overlay/subathon': 'thsv.subathon-timer',
  '/overlay/countdown': 'thsv.starting-soon-countdown',
  '/overlay/ad-break': 'thsv.ad-break-companion',
});

function addOnOverlayModuleId(requestPath: string | undefined): string | undefined {
  if (requestPath === undefined) return undefined;
  const alias = ADD_ON_OVERLAY_ALIASES[requestPath];
  if (alias !== undefined) return alias;
  return /^\/overlay\/addons\/([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+)$/u.exec(requestPath)?.[1];
}

function activeLivePlatforms(diagnostics: Readonly<Record<string, unknown>>): readonly unknown[] {
  const timedActions = diagnostics['timedActions'];
  const timedActionPlatforms = typeof timedActions === 'object' && timedActions !== null && !Array.isArray(timedActions) && Array.isArray((timedActions as Record<string, unknown>)['livePlatforms'])
    ? (timedActions as Record<string, unknown>)['livePlatforms'] as unknown[] : [];
  const mainFeatures = diagnostics['mainFeatures'];
  const broadcastDirector = typeof mainFeatures === 'object' && mainFeatures !== null && !Array.isArray(mainFeatures)
    ? (mainFeatures as Record<string, unknown>)['broadcastDirector'] : undefined;
  const featurePlatforms = typeof broadcastDirector === 'object' && broadcastDirector !== null && !Array.isArray(broadcastDirector) && Array.isArray((broadcastDirector as Record<string, unknown>)['livePlatforms'])
    ? (broadcastDirector as Record<string, unknown>)['livePlatforms'] as unknown[] : [];
  return [...new Set([...timedActionPlatforms, ...featurePlatforms])];
}

export class DiagnosticsServer {
  private server: Server | undefined;
  private readonly guard: MutableRequestGuard;
  private readonly overlayAssetDirectory: string;
  private readonly clipMediaCacheDirectory: string;
  private readonly dockSessionToken = randomUUID();
  private readonly controlToken: string;
  private readonly wizardUnlockTickets = new Map<string, number>();
  private readonly supportBundleSnapshots = new Map<string, { readonly tabId: string; readonly expiresAt: number; readonly bundle: SupportBundleResult; readonly preview: SupportBundlePreview }>();
  private dockWindowStartedAt = Date.now();
  private dockRequestsInWindow = 0;
  private dockRequestActive = false;

  public constructor(
    private readonly config: BridgeConfig['service'] & BridgeConfig['security'],
    private readonly target: DiagnosticsTarget,
    private readonly logger: Logger,
    controlToken: string,
    private readonly requestShutdown?: () => void,
    private readonly overlayHub?: BrowserOverlayHub,
    private readonly wizard?: WizardService,
    private readonly dataRoot = 'data',
    private readonly commandDirectory?: CommandDirectoryService,
    private readonly dockChat?: DockChatController,
  ) {
    this.controlToken = controlToken;
    this.guard = new MutableRequestGuard(controlToken, config.allowedOrigins, config.maxRequestsPerMinute, config.maxConcurrentRequests);
    // Must be derived from the configured data root, not a bare relative literal: the portable
    // Windows installer runs the bridge with its working directory inside the versioned, disposable
    // app/<version>/ folder, which is deleted on every upgrade. Anything meant to outlive an upgrade
    // has to be anchored to dataRoot, the one directory the installer promises to preserve.
    this.overlayAssetDirectory = join(dataRoot, 'runtime', 'overlay-assets');
    this.clipMediaCacheDirectory = join(dataRoot, 'runtime', 'clip-media-cache');
  }

  public async start(): Promise<void> {
    if (this.server !== undefined) return;
    const server = createServer((request, response) => void this.route(request, response));
    this.server = server;
    this.overlayHub?.attach(server);
    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException): void => {
        server.off('listening', onListening);
        if (error.code === 'EADDRINUSE') reject(new Error(`Port conflict: ${this.config.host}:${String(this.config.port)} is already in use`));
        else reject(error);
      };
      const onListening = (): void => { server.off('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this.config.port, this.config.host);
    });
    this.logger.info('Diagnostics server listening', { host: this.config.host, port: this.port });
  }

  public async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (server === undefined) return;
    this.overlayHub?.stop();
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }

  public get port(): number {
    const address = this.server?.address();
    return typeof address === 'object' && address !== null ? address.port : this.config.port;
  }

  private pruneSupportBundleSnapshots(): void {
    const now = Date.now();
    for (const [id, snapshot] of this.supportBundleSnapshots) if (snapshot.expiresAt <= now) this.supportBundleSnapshots.delete(id);
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.setSecurityHeaders(response);
    const requestPath = request.url?.split('?', 1)[0];
    let release: (() => void) | undefined;
    try {
      if (request.method === 'GET' && request.url === '/health') {
        this.guard.assertLoopback(request);
        return this.reply(response, 200, this.target.health());
      }
      if (request.method === 'GET' && request.url === '/ready') {
        this.guard.assertLoopback(request);
        const readiness = this.target.readiness();
        const acceptance = this.wizard?.liveAcceptanceAttentionSummary();
        return this.reply(response, readiness['ready'] === true ? 200 : 503, acceptance === undefined ? readiness : { ...readiness, acceptance });
      }
      if (request.method === 'GET' && request.url === '/diagnostics') {
        this.guard.assertLoopback(request);
        return this.reply(response, 200, { ...this.target.diagnostics(), browserOverlay: this.overlayHub?.status() });
      }
      if (request.method === 'POST' && requestPath === '/wizard/api/unlock-tickets') {
        release = this.guard.acquire(request, false);
        const now = Date.now();
        for (const [digest, expiresAt] of this.wizardUnlockTickets) if (expiresAt <= now) this.wizardUnlockTickets.delete(digest);
        if (this.wizardUnlockTickets.size >= 8) {
          const oldest = this.wizardUnlockTickets.keys().next().value;
          if (oldest !== undefined) this.wizardUnlockTickets.delete(oldest);
        }
        const ticket = randomBytes(32).toString('base64url');
        this.wizardUnlockTickets.set(createHash('sha256').update(ticket).digest('hex'), now + 60_000);
        return this.reply(response, 201, { ticket, expiresInSeconds: 60 });
      }
      if (request.method === 'POST' && requestPath === '/wizard/api/unlock') {
        this.assertWizardUnlockRequest(request);
        const body = await readBody(request, 512);
        const input = JSON.parse(body.text) as Record<string, unknown>;
        const ticket = typeof input['ticket'] === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(input['ticket']) ? input['ticket'] : '';
        const digest = createHash('sha256').update(ticket).digest('hex');
        const expiresAt = this.wizardUnlockTickets.get(digest);
        this.wizardUnlockTickets.delete(digest);
        if (ticket.length === 0 || expiresAt === undefined || expiresAt <= Date.now()) throw new RequestGuardError(401, 'This wizard unlock link is invalid or expired');
        return this.reply(response, 200, { controlToken: this.controlToken });
      }
      if (request.method === 'GET' && (requestPath === '/commands' || requestPath === '/commands/')) {
        if (this.commandDirectory === undefined) return this.reply(response, 404, { error: 'Command directory is unavailable' });
        return this.commandDirectoryPage(response);
      }
      if (request.method === 'GET' && requestPath === '/commands/catalog.json') {
        if (this.commandDirectory === undefined) return this.reply(response, 404, { error: 'Command directory is unavailable' });
        const catalogue = this.commandDirectory.catalogue();
        response.setHeader('etag', `"${catalogue.catalogHash}"`);
        return this.reply(response, 200, catalogue);
      }
      if (request.method === 'GET' && requestPath === '/wizard/api/commands/directory') {
        if (this.commandDirectory === undefined) return this.reply(response, 404, { error: 'Command directory is unavailable' });
        release = this.guard.acquire(request, false);
        const streamerBot = await this.commandDirectory.refreshStreamerBotCommands();
        return this.reply(response, 200, { ...this.commandDirectory.catalogue(), publishing: this.commandDirectory.publicationStatus(), streamerBot });
      }
      if (request.method === 'GET' && requestPath === '/wizard/api/commands/directory/moderator') {
        if (this.commandDirectory === undefined) return this.reply(response, 404, { error: 'Command directory is unavailable' });
        release = this.guard.acquire(request, false);
        const streamerBot = await this.commandDirectory.refreshStreamerBotCommands();
        return this.reply(response, 200, { ...this.commandDirectory.moderatorCatalogue(), streamerBot });
      }
      if (request.method === 'POST' && requestPath === '/wizard/api/commands/directory/publish') {
        if (this.commandDirectory === undefined) return this.reply(response, 404, { error: 'Command directory is unavailable' });
        // This is a bodyless control operation. Authentication, origin, loopback,
        // rate, and concurrency checks still apply; requiring JSON would reject
        // the wizard's ordinary POST before it reached the publisher.
        release = this.guard.acquire(request, false);
        await this.commandDirectory.refreshStreamerBotCommands();
        const result = await this.commandDirectory.publish();
        return this.reply(response, result.state === 'failed' ? 502 : result.state === 'disabled' ? 409 : 200, result);
      }
      if (request.method === 'DELETE' && requestPath === '/wizard/api/commands/directory/publish') {
        if (this.commandDirectory === undefined) return this.reply(response, 404, { error: 'Command directory is unavailable' });
        release = this.guard.acquire(request, false);
        const result = await this.commandDirectory.removePublished();
        return this.reply(response, result.state === 'failed' ? 502 : result.state === 'disabled' ? 409 : 200, result);
      }
      if (request.method === 'GET' && requestPath === '/wizard/api/commands/directory/export') {
        if (this.commandDirectory === undefined) return this.reply(response, 404, { error: 'Command directory is unavailable' });
        release = this.guard.acquire(request, false);
        const catalogue = this.commandDirectory.catalogue();
        response.statusCode = 200;
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.setHeader('content-disposition', 'attachment; filename="thsv-stream-commands.html"');
        response.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
        response.end(this.commandDirectory.html(catalogue));
        return;
      }
      if (request.method === 'GET' && request.url === '/overlay/config' && this.overlayHub !== undefined) {
        this.guard.assertLoopback(request);
        return this.reply(response, 200, this.overlayHub.clientConfig());
      }
      if (request.method === 'GET' && requestPath === '/overlay/chat/dock') {
        this.guard.assertLoopback(request);
        response.setHeader('set-cookie', `thsv_dock=${this.dockSessionToken}; HttpOnly; SameSite=Strict; Path=/overlay/chat/dock`);
        return await this.overlayAsset(response, requestPath);
      }
      if (request.method === 'GET' && requestPath === '/overlay/chat/dock/config') {
        this.assertDockSession(request);
        return this.reply(response, 200, {
          enabled: this.dockChat !== undefined,
          platforms: this.dockChat?.enabledPlatforms ?? [],
          characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150 },
          accountMode: { twitch: 'creator', youtube: 'creator', kick: 'creator', tiktok: 'tikfinity-configured-sender' },
        });
      }
      if (request.method === 'POST' && requestPath === '/overlay/chat/dock/send') {
        this.assertDockSession(request, true);
        if (this.dockChat === undefined) return this.reply(response, 503, { error: 'Interactive chat delivery is unavailable.' });
        const releaseDock = this.acquireDockRequest();
        try {
          const body = await readBody(request, 2_048);
          const input = JSON.parse(body.text) as Record<string, unknown>;
          const message = typeof input['message'] === 'string' ? input['message'].trim().replace(/\s+/gu, ' ') : '';
          const target = typeof input['target'] === 'string' ? input['target'].toLowerCase() : '';
          const selectedPlatforms = target === 'all'
            ? [...this.dockChat.enabledPlatforms]
            : this.dockChat.enabledPlatforms.includes(target as OutboundPlatform) ? [target as OutboundPlatform] : [];
          if (message.length === 0) return this.reply(response, 400, { error: 'Type a chat message before sending.' });
          if (selectedPlatforms.length === 0) return this.reply(response, 400, { error: 'Choose an enabled chat platform.' });
          const limits: Readonly<Record<OutboundPlatform, number>> = { twitch: 500, youtube: 200, kick: 500, tiktok: 150 };
          const maximum = Math.min(...selectedPlatforms.map((platform) => limits[platform]));
          if (Array.from(message).length > maximum) return this.reply(response, 400, { error: `Message exceeds the ${String(maximum)} character limit for the selected destination.` });
          const deliveries = await this.dockChat.send({ message, routing: 'selected', selectedPlatforms, overflow: 'reject' });
          return this.reply(response, 202, { accepted: deliveries.every((delivery) => delivery.accepted), deliveries });
        } finally { releaseDock(); }
      }
      if (request.method === 'GET' && requestPath !== undefined && ['/overlay/addons/host.js', '/overlay/addons/host.css'].includes(requestPath)) return await this.overlayAsset(response, requestPath);
      const addOnOverlayModule = request.method === 'GET' ? addOnOverlayModuleId(requestPath) : undefined;
      if (addOnOverlayModule !== undefined && this.overlayHub !== undefined && this.wizard !== undefined) {
        this.guard.assertLoopback(request);
        const addOn = (await this.wizard.listAddOns()).find((candidate) => candidate.moduleId === addOnOverlayModule);
        if (!this.overlayHub.clientConfig().enabled || addOn === undefined || addOn.health !== 'installed' || !addOn.enabled || !addOn.permissions.includes('overlay.publish')) return this.reply(response, 404, { error: 'Add-on overlay not found' });
        return await this.addOnOverlayAsset(response, 'addon-host.html');
      }
      if (request.method === 'GET' && request.url === '/wizard/api/overview' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.overview());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/inspect' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.inspect());
      }
      if (request.method === 'GET' && request.url === '/wizard/api/streamerbot/import-catalogue' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.streamerBotImportCatalogue());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/streamerbot/import-package' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.generateStreamerBotImport(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'GET' && request.url === '/wizard/api/streamerbot-launcher' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.streamerBotLauncherStatus());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/streamerbot-launcher/detect' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        return this.reply(response, 200, await this.wizard.detectStreamerBotLauncher());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/streamerbot-launcher/save' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, 4_096);
        return this.reply(response, 200, await this.wizard.saveStreamerBotLauncher(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/streamerbot-launcher/choose' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, 512);
        return this.reply(response, 200, await this.wizard.chooseStreamerBotLauncher(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/streamerbot-launcher/optional/save' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, 4_096);
        return this.reply(response, 200, await this.wizard.saveOptionalStreamingApplication(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/streamerbot-launcher/optional/choose' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, 512);
        return this.reply(response, 200, await this.wizard.chooseOptionalStreamingApplication(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/streamerbot-launcher/optional/enable' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, 512);
        return this.reply(response, 200, await this.wizard.enableOptionalStreamingApplication(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/streamerbot-launcher/start' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, 512);
        return this.reply(response, 200, await this.wizard.startStreamerBotSafely(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/streamerbot-launcher/start-all' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, 512);
        return this.reply(response, 200, await this.wizard.startAllStreamingTools(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/restart' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        if (activeLivePlatforms(this.target.diagnostics()).length > 0) return this.reply(response, 409, { error: 'StreamBridge will not restart while a platform is live. Finish the stream, then use Restart safely again.' });
        const body = await readBody(request, 512);
        return this.reply(response, 202, await this.wizard.restartStreamBridge(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/streamerbot-launcher/shortcut' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, 512);
        return this.reply(response, 200, await this.wizard.createStreamerBotDesktopShortcut(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/streamerbot-launcher/open-folder' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, 512);
        return this.reply(response, 200, this.wizard.openStreamBridgeInstallFolder(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/transactions' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 201, await this.wizard.beginTransaction(wizardTabLease(request)));
      }
      const stageMatch = request.method === 'POST' ? /^\/wizard\/api\/transactions\/([0-9a-f-]+)\/stage$/u.exec(request.url ?? '') : null;
      if (stageMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, this.wizard.stageTransaction(stageMatch[1], JSON.parse(body.text) as unknown,wizardTabLease(request)));
      }
      const importMatch = request.method === 'POST' ? /^\/wizard\/api\/transactions\/([0-9a-f-]+)\/import$/u.exec(request.url ?? '') : null;
      if (importMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, this.wizard.stageImport(importMatch[1], JSON.parse(body.text) as unknown,wizardTabLease(request)));
      }
      const commitMatch = request.method === 'POST' ? /^\/wizard\/api\/transactions\/([0-9a-f-]+)\/commit$/u.exec(request.url ?? '') : null;
      if (commitMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.commitTransaction(commitMatch[1],wizardTabLease(request)));
      }
      const cancelMatch = request.method === 'POST' ? /^\/wizard\/api\/transactions\/([0-9a-f-]+)\/cancel$/u.exec(request.url ?? '') : null;
      if (cancelMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, this.wizard.cancelTransaction(cancelMatch[1],wizardTabLease(request)));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/commands/sync' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.syncCommands());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/commands/generate' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.generateCommands(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/commands/verify' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.verifyGeneratedCommands(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/commands/administer' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.administerCommand(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/rewards/administer' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.administerReward(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'GET' && request.url === '/wizard/api/diagnostics' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, this.wizard.diagnostics());
      }
      if (request.method === 'GET' && request.url === '/wizard/api/support-bundle' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        this.pruneSupportBundleSnapshots();
        const previewId = typeof request.headers['x-thsv-support-preview'] === 'string' ? request.headers['x-thsv-support-preview'] : '';
        const snapshot = this.supportBundleSnapshots.get(previewId);
        if (snapshot === undefined || snapshot.expiresAt <= Date.now() || snapshot.tabId !== wizardTabLease(request)) return this.reply(response, 409, { error: 'Preview this support bundle in the current Wizard tab before downloading it.' });
        this.supportBundleSnapshots.delete(previewId);
        const bundle = snapshot.bundle;
        response.statusCode = 200;
        response.setHeader('content-type', 'application/zip');
        response.setHeader('content-disposition', `attachment; filename="${bundle.filename}"`);
        response.setHeader('content-length', String(bundle.bytes.byteLength));
        response.end(bundle.bytes);
        return;
      }
      if (request.method === 'GET' && request.url === '/wizard/api/support-bundle/preview' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        this.pruneSupportBundleSnapshots();
        while (this.supportBundleSnapshots.size >= 8) this.supportBundleSnapshots.delete(this.supportBundleSnapshots.keys().next().value ?? '');
        const prepared = await prepareSupportBundle(this.dataRoot, { health: this.target.health(), readiness: this.target.readiness(), diagnostics: this.target.diagnostics(), ...(this.overlayHub === undefined ? {} : { overlay: this.overlayHub.status() }) });
        const previewId = randomUUID(); const expiresAt = Date.now() + 5 * 60_000;
        this.supportBundleSnapshots.set(previewId, { tabId: wizardTabLease(request), expiresAt, ...prepared });
        return this.reply(response, 200, { ...prepared.preview, previewId, expiresAt: new Date(expiresAt).toISOString() });
      }
      if (request.method === 'GET' && request.url === '/wizard/api/readiness' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        const overlay = this.overlayHub?.status();
        return this.reply(response, 200, { readiness: this.target.readiness(), launcher: await this.wizard.streamerBotLauncherStatus(), configuration: await this.wizard.configurationActivation(), provenance: this.wizard.provenance(), obsInventory: this.wizard.obsInventoryStatus(overlay), ...(overlay === undefined ? {} : { overlay }) });
      }
      if (request.method === 'GET' && request.url === '/wizard/api/pre-stream-report' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        const report = await createPreStreamReport(this.dataRoot, { provenance: this.wizard.provenance(), readiness: this.target.readiness(), obsInventory: this.wizard.obsInventoryStatus(this.overlayHub?.status()), liveAcceptance: this.wizard.liveAcceptanceStatus() });
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.setHeader('content-disposition', `attachment; filename="${report.filename}"`);
        response.setHeader('content-length', String(report.bytes.byteLength));
        response.end(report.bytes);
        return;
      }
      if (request.method === 'POST' && request.url === '/wizard/api/pre-stream-report/compare' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        const body = await readBody(request, Math.min(this.config.maxPayloadBytes, 512 * 1024)); const input = JSON.parse(body.text) as unknown;
        if (typeof input !== 'object' || input === null || Array.isArray(input) || !('baseline' in input)) throw new PreStreamReportError('Choose an earlier sanitized pre-stream report to compare.');
        const current = await createPreStreamReport(this.dataRoot, { provenance: this.wizard.provenance(), readiness: this.target.readiness(), obsInventory: this.wizard.obsInventoryStatus(this.overlayHub?.status()), liveAcceptance: this.wizard.liveAcceptanceStatus() });
        return this.reply(response, 200, comparePreStreamReports((input as Record<string, unknown>)['baseline'], JSON.parse(new TextDecoder().decode(current.bytes)) as unknown));
      }
      if (request.method === 'GET' && request.url === '/wizard/api/website-companion' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.websiteCompanionStatus());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/website-companion/pair' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.startWebsitePairing());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/website-companion/check' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.checkWebsitePairing());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/website-companion/publish' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.publishWebsiteConfiguration());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/website-companion/stage-draft' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.stageWebsiteConfigurationDraft(wizardTabLease(request)));
      }
      if (request.method === 'DELETE' && request.url === '/wizard/api/website-companion' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.disconnectWebsiteCompanion());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/coordination/reset' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        if (this.target.resetAddOnCoordination === undefined) return this.reply(response, 503, { error: 'Add-on coordination reset is unavailable.' });
        const body = await readBody(request, this.config.maxPayloadBytes);
        const input = JSON.parse(body.text) as Record<string, unknown>;
        if (input['approvedByCreator'] !== true) return this.reply(response, 403, { error: 'Coordination reset requires explicit creator approval.' });
        const resource = typeof input['resource'] === 'string' && input['resource'].length > 0 ? input['resource'] : undefined;
        return this.reply(response, 200, this.target.resetAddOnCoordination(resource));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/viewer-foundation/admin' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        if (this.target.administerViewerFoundation === undefined) return this.reply(response, 503, { error: 'Viewer Foundation administration is unavailable.' });
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.target.administerViewerFoundation(JSON.parse(body.text) as ViewerFoundationAdminRequestV1));
      }
      if (request.method === 'GET' && request.url === '/wizard/api/viewer-foundation' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, { integration: await this.wizard.viewerFoundation() });
      }
      if (request.method === 'PUT' && request.url === '/wizard/api/viewer-foundation/settings' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.saveViewerFoundationSettings(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'GET' && request.url === '/wizard/api/viewer-foundation/migration' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await readLegacyViewerMigration(this.dataRoot));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/viewer-foundation/migration' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        if (this.target.administerViewerFoundation === undefined) return this.reply(response, 503, { error: 'Viewer Foundation administration is unavailable.' });
        const body = await readBody(request, this.config.maxPayloadBytes); const input = JSON.parse(body.text) as Record<string, unknown>;
        if (input['approvedByCreator'] !== true || typeof input['migrationDigest'] !== 'string') return this.reply(response, 403, { error: 'Legacy migration requires explicit creator approval and the preview digest.' });
        const preview = await readLegacyViewerMigration(this.dataRoot);
        if (!preview.found || preview.digest !== input['migrationDigest']) return this.reply(response, 409, { error: 'The legacy state changed after preview. Preview it again before importing.' });
        return this.reply(response, 200, await this.target.administerViewerFoundation({ operation: 'import-legacy', approvedByCreator: true, migrationDigest: preview.digest, legacyViewers: preview.records }));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/community-analytics/admin' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        if (this.target.administerCommunityAnalytics === undefined) return this.reply(response, 503, { error: 'Community Analytics administration is unavailable.' });
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.target.administerCommunityAnalytics(JSON.parse(body.text) as CommunityAnalyticsAdminRequestV1));
      }
      if (request.method === 'GET' && request.url === '/wizard/api/community-analytics' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, { integration: await this.wizard.communityAnalytics() });
      }
      if (request.method === 'PUT' && request.url === '/wizard/api/community-analytics/settings' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.saveCommunityAnalyticsSettings(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'GET' && request.url === '/wizard/api/kofi-donations' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, { integration: await this.wizard.kofiDonations() });
      }
      if (request.method === 'PUT' && request.url === '/wizard/api/kofi-donations/settings' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.saveKofiDonationsSettings(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/quote-vault/admin' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        if (this.target.administerQuoteVault === undefined) return this.reply(response, 503, { error: 'Quote Vault administration is unavailable.' });
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.target.administerQuoteVault(JSON.parse(body.text) as QuoteVaultAdminRequestV1));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/viewer-spotlight/admin' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        if (this.target.administerViewerSpotlight === undefined) return this.reply(response, 503, { error: 'Viewer Spotlight administration is unavailable.' });
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.target.administerViewerSpotlight(JSON.parse(body.text) as ViewerSpotlightAdminRequestV1));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/village-draw/admin' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        if (this.target.administerVillageDraw === undefined) return this.reply(response, 503, { error: 'Village Draw administration is unavailable.' });
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.target.administerVillageDraw(JSON.parse(body.text) as VillageDrawAdminRequestV1));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/chat-guard/admin' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        if (this.target.administerChatGuard === undefined) return this.reply(response, 503, { error: 'Chat Guard administration is unavailable.' });
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.target.administerChatGuard(JSON.parse(body.text) as ChatGuardAdminRequestV1));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/follower-pulse/admin' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        if (this.target.administerFollowerPulse === undefined) return this.reply(response, 503, { error: 'Follower Pulse administration is unavailable.' });
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.target.administerFollowerPulse(JSON.parse(body.text) as FollowerPulseAdminRequestV1));
      }
      if (request.method === 'GET' && request.url === '/wizard/api/configuration/export' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.exportConfiguration());
      }
      if (request.method === 'GET' && request.url === '/wizard/api/addons' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, { addOns: await this.wizard.listAddOns(), featureFamilies: MAIN_FEATURE_FAMILIES, featureMigrations: await this.wizard.listFeatureMigrations(), discovered: await this.wizard.discoverAddOns(), trustedPublishers: await this.wizard.listTrustedAddOnPublishers() });
      }
      if (request.method === 'GET' && request.url === '/wizard/api/addons/acceptance' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, { acceptance: await this.wizard.listAddOnAcceptance() });
      }
      if (request.method === 'GET' && request.url === '/wizard/api/live-acceptance' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, this.wizard.liveAcceptanceStatus());
      }
      if (request.method === 'GET' && request.url === '/wizard/api/release-readiness' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.releaseReadinessStatus(false));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/release-readiness/refresh' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.releaseReadinessStatus(true));
      }
      if (request.method === 'PUT' && request.url === '/wizard/api/live-acceptance/reminders' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, 512);
        return this.reply(response, 200, this.wizard.setLiveAcceptanceReminder(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'GET' && request.url === '/wizard/api/obs-source-inventory' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, this.wizard.obsInventoryStatus(this.overlayHub?.status()));
      }
      if (request.method === 'PUT' && request.url === '/wizard/api/obs-source-inventory' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, this.wizard.saveObsInventory(JSON.parse(body.text) as unknown, this.overlayHub?.status()));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/updates/check' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.checkForUpdates());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/updates/stage' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.stageReleaseUpdate(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/updates/apply' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        if (activeLivePlatforms(this.target.diagnostics()).length > 0) return this.reply(response, 409, { error: 'Finish the live stream before installing a StreamBridge update. Feature package updates may be prepared while live, but the Bridge itself will not restart on air.' });
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 202, await this.wizard.applyReleaseUpdate(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/addons/updates/check' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.checkForAddOnUpdates());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/addons/updates/stage' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.stageAddOnUpdate(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/addons/updates/install' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.installAddOnUpdate(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'GET' && request.url === '/wizard/api/addons/trusted-publishers' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, { publishers: await this.wizard.listTrustedAddOnPublishers() });
      }
      if (request.method === 'POST' && request.url === '/wizard/api/addons/trusted-publishers' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 201, await this.wizard.saveTrustedAddOnPublisher(JSON.parse(body.text) as unknown));
      }
      const trustedPublisherDeleteMatch = request.method === 'DELETE' ? /^\/wizard\/api\/addons\/trusted-publishers\/([^/]+)$/u.exec(request.url ?? '') : null;
      if (trustedPublisherDeleteMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.removeTrustedAddOnPublisher(decodeURIComponent(trustedPublisherDeleteMatch[1]), JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/addons/trusted-updates/check' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.checkTrustedPublisherAddOnUpdates(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/addons/trusted-updates/stage' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.stageTrustedPublisherAddOnUpdate(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/addons/trusted-updates/install' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.installTrustedPublisherAddOnUpdate(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/addons/install' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, Math.max(this.config.maxPayloadBytes, 10_000_000));
        return this.reply(response, 201, await this.wizard.installAddOn(JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/addons/install-discovered' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 201, await this.wizard.installDiscoveredAddOn(JSON.parse(body.text) as unknown));
      }
      const featureFamilyEnabledMatch = request.method === 'POST' ? /^\/wizard\/api\/extensions\/([^/]+)\/enabled$/u.exec(request.url ?? '') : null;
      if (featureFamilyEnabledMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.setFeatureFamilyEnabled(decodeURIComponent(featureFamilyEnabledMatch[1]), JSON.parse(body.text) as unknown));
      }
      const addOnEnabledMatch = request.method === 'POST' ? /^\/wizard\/api\/addons\/([^/]+)\/enabled$/u.exec(request.url ?? '') : null;
      if (addOnEnabledMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.setAddOnEnabled(decodeURIComponent(addOnEnabledMatch[1]), JSON.parse(body.text) as unknown));
      }
      const featureMigrationMatch = request.method === 'POST' ? /^\/wizard\/api\/addons\/([^/]+)\/feature-migration$/u.exec(request.url ?? '') : null;
      if (featureMigrationMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.applyFeatureMigration(decodeURIComponent(featureMigrationMatch[1]), JSON.parse(body.text) as unknown));
      }
      const addOnActionGrantsMatch = request.method === 'PUT' ? /^\/wizard\/api\/addons\/([^/]+)\/action-grants$/u.exec(request.url ?? '') : null;
      if (addOnActionGrantsMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.setAddOnApprovedActions(decodeURIComponent(addOnActionGrantsMatch[1]), JSON.parse(body.text) as unknown));
      }
      const addOnOverlayPreviewMatch = request.method === 'POST' ? /^\/wizard\/api\/addons\/([^/]+)\/overlay-preview$/u.exec(request.url ?? '') : null;
      if (addOnOverlayPreviewMatch?.[1] !== undefined && this.wizard !== undefined && this.overlayHub !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        const previewRequest = body.text.trim() ? JSON.parse(body.text) as unknown : {};
        const moduleId = decodeURIComponent(addOnOverlayPreviewMatch[1]);
        const addOn = (await this.wizard.listAddOns()).find((candidate) => candidate.moduleId === moduleId);
        if (!this.overlayHub.clientConfig().enabled || addOn === undefined || addOn.health !== 'installed' || !addOn.enabled || !addOn.permissions.includes('overlay.publish')) return this.reply(response, 404, { error: 'Enabled add-on overlay not found' });
        if (previewRequest !== null && typeof previewRequest === 'object' && !Array.isArray(previewRequest) && (previewRequest as Record<string, unknown>)['action'] === 'hide') {
          const topic = `${moduleId}.preview.hide`;
          await this.overlayHub.publishAddOn(moduleId, topic, { force: true });
          return this.reply(response, 202, { accepted: true, simulated: true, moduleId, topic });
        }
        const topic = addOnOverlayPreviewTopic(moduleId);
        const requestedPreviewMode = previewRequest !== null && typeof previewRequest === 'object' && !Array.isArray(previewRequest)
          ? (previewRequest as Record<string, unknown>)['mode'] : undefined;
        const previewMode = typeof requestedPreviewMode === 'string' ? requestedPreviewMode : '';
        await this.overlayHub.publishAddOn(moduleId, topic, { ...buildAddOnOverlayPreview(addOn, previewMode), templatePreview: true });
        return this.reply(response, 202, { accepted: true, simulated: true, moduleId, topic });
      }
      const addOnOverlayDraftPreviewMatch = request.method === 'POST' ? /^\/wizard\/api\/addons\/([^/]+)\/overlay-preview-draft$/u.exec(request.url ?? '') : null;
      if (addOnOverlayDraftPreviewMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        const requestBody = JSON.parse(body.text) as unknown;
        if (requestBody === null || typeof requestBody !== 'object' || Array.isArray(requestBody)) throw new AddOnWizardError(400, 'Overlay draft preview request must be an object.');
        const record = requestBody as Record<string, unknown>;
        const moduleId = decodeURIComponent(addOnOverlayDraftPreviewMatch[1]);
        const addOn = await this.wizard.previewAddOnSettings(moduleId, record['settings']);
        if (addOn.health !== 'installed' || !addOn.enabled || !addOn.permissions.includes('overlay.publish')) return this.reply(response, 404, { error: 'Enabled add-on overlay not found' });
        const previewMode = typeof record['mode'] === 'string' ? record['mode'] : '';
        const topic = addOnOverlayPreviewTopic(moduleId);
        const event = {
          contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId, topic,
          emittedAt: new Date().toISOString(), payload: { ...buildAddOnOverlayPreview(addOn, previewMode), templatePreview: true },
        };
        return this.reply(response, 200, { accepted: true, simulated: true, persisted: false, moduleId, event });
      }
      const addOnRemoveMatch = request.method === 'POST' ? /^\/wizard\/api\/addons\/([^/]+)\/remove$/u.exec(request.url ?? '') : null;
      if (addOnRemoveMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.removeAddOn(decodeURIComponent(addOnRemoveMatch[1]), JSON.parse(body.text) as unknown));
      }
      const addOnSettingsMatch = request.method === 'PUT' ? /^\/wizard\/api\/addons\/([^/]+)\/settings$/u.exec(request.url ?? '') : null;
      if (addOnSettingsMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.saveAddOnSettings(decodeURIComponent(addOnSettingsMatch[1]), JSON.parse(body.text) as unknown));
      }
      const addOnAcceptanceMatch = request.method === 'PUT' ? /^\/wizard\/api\/addons\/([^/]+)\/acceptance$/u.exec(request.url ?? '') : null;
      if (addOnAcceptanceMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.saveAddOnAcceptance(decodeURIComponent(addOnAcceptanceMatch[1]), JSON.parse(body.text) as unknown));
      }
      const liveAcceptanceMatch = request.method === 'PUT' ? /^\/wizard\/api\/live-acceptance\/([a-z][a-z0-9-]{2,80})$/u.exec(request.url ?? '') : null;
      if (liveAcceptanceMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, this.wizard.confirmLiveAcceptance(liveAcceptanceMatch[1], JSON.parse(body.text) as unknown));
      }
      if (request.method === 'POST' && request.url === '/wizard/api/overlay-assets' && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, Math.max(this.config.maxPayloadBytes, MAX_OVERLAY_VIDEO_PAYLOAD_BYTES));
        const input = JSON.parse(body.text) as Record<string, unknown>;
        const kind = input['kind']; const contentType = input['contentType']; const encoded = input['contentBase64'];
        const allowed = kind === 'sound'
          ? new Map([['audio/mpeg', 'mp3'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/ogg', 'ogg']])
          : kind === 'background' ? new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif']])
          : kind === 'video' ? new Map([['video/mp4', 'mp4'], ['video/webm', 'webm']]) : undefined;
        if (allowed === undefined || typeof contentType !== 'string' || typeof encoded !== 'string' || !allowed.has(contentType)) return this.reply(response, 400, { error: 'Unsupported overlay asset type.' });
        const extension = allowed.get(contentType) ?? '';
        const maxBytes = kind === 'video' ? MAX_OVERLAY_VIDEO_ASSET_BYTES : MAX_OVERLAY_ASSET_BYTES;
        const { filename, bytes } = await storeOverlayAsset(encoded, contentType, extension, this.overlayAssetDirectory, maxBytes);
        return this.reply(response, 201, { url: `/overlay/assets/${filename}`, bytes: bytes.length, contentType });
      }
      const overlayAssetMatch = request.method === 'GET' ? /^\/overlay\/assets\/([a-f0-9]{64}\.(?:mp3|wav|ogg|png|jpg|webp|gif|mp4|webm))$/u.exec(request.url ?? '') : null;
      if (overlayAssetMatch?.[1] !== undefined) {
        const extension = overlayAssetMatch[1].split('.').pop() ?? '';
        const contentTypes: Readonly<Record<string, string>> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' };
        const body = await readFile(join(this.overlayAssetDirectory, overlayAssetMatch[1]));
        response.statusCode = 200; response.setHeader('content-type', contentTypes[extension] ?? 'application/octet-stream'); response.setHeader('cache-control', 'public, max-age=31536000, immutable'); response.end(body); return;
      }
      const cachedClipMatch = request.method === 'GET' ? /^\/overlay\/cache\/([a-f0-9]{64}\.mp4)$/u.exec(request.url ?? '') : null;
      if (cachedClipMatch?.[1] !== undefined) {
        const cached = await readCachedClip(this.clipMediaCacheDirectory, cachedClipMatch[1]);
        if (cached === undefined) return this.reply(response, 404, { error: 'Cached clip not found or expired.' });
        const range = /^bytes=(\d*)-(\d*)$/u.exec(request.headers.range ?? ''); let start = 0; let end = cached.bytes.length - 1;
        if (range !== null) { start = range[1] ? Number(range[1]) : 0; end = range[2] ? Number(range[2]) : end; if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= cached.bytes.length) { response.statusCode = 416; response.setHeader('content-range', `bytes */${String(cached.bytes.length)}`); response.end(); return; } response.statusCode = 206; response.setHeader('content-range', `bytes ${String(start)}-${String(end)}/${String(cached.bytes.length)}`); }
        else response.statusCode = 200;
        response.setHeader('content-type', 'video/mp4'); response.setHeader('accept-ranges', 'bytes'); response.setHeader('content-length', String(end - start + 1)); response.setHeader('cache-control', 'private, max-age=60'); response.end(cached.bytes.subarray(start, end + 1)); return;
      }
      if (request.method === 'GET' && requestPath !== undefined && WIZARD_ASSETS[requestPath] !== undefined && this.wizard !== undefined) return await this.wizardAsset(response, requestPath);
      if (request.method === 'GET' && requestPath !== undefined && OVERLAY_ASSETS[requestPath] !== undefined) return await this.overlayAsset(response, requestPath);
      if (request.method === 'POST' && request.url === '/shutdown' && this.requestShutdown !== undefined) {
        release = this.guard.acquire(request, false);
        this.reply(response, 202, { accepted: true });
        setImmediate(this.requestShutdown);
        return;
      }
      if (request.method === 'POST' && request.url === '/simulate') {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        const input = JSON.parse(body.text) as unknown;
        const result = await this.target.simulate(input, body.bytes);
        return this.reply(response, 202, result);
      }
      const timedMatch = request.method === 'POST' ? /^\/timed-actions\/(start|stop|pause|resume)$/u.exec(request.url ?? '') : null;
      if (timedMatch !== null) {
        release = this.guard.acquire(request, false);
        const operation = timedMatch[1] as 'start' | 'stop' | 'pause' | 'resume';
        return this.reply(response, 200, { accepted: true, operation, status: await this.target.controlTimedActions(operation) });
      }
      const timedTestMatch = request.method === 'POST' ? /^\/wizard\/api\/timed-actions\/([^/]+)\/test$/u.exec(request.url ?? '') : null;
      if (timedTestMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        if (this.target.testTimedAction === undefined) return this.reply(response, 503, { error: 'Timed-action testing is unavailable.' });
        return this.reply(response, 202, await this.target.testTimedAction(decodeURIComponent(timedTestMatch[1])));
      }
      const alertPreviewMatch = request.method === 'POST' ? /^\/wizard\/api\/alerts\/([^/]+)\/([^/]+)\/preview$/u.exec(request.url ?? '') : null;
      if (alertPreviewMatch?.[1] !== undefined && alertPreviewMatch[2] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        const platform = decodeURIComponent(alertPreviewMatch[1]);
        const alertType = decodeURIComponent(alertPreviewMatch[2]);
        if (!isValidPlatformAlertType(platform, alertType)) return this.reply(response, 400, { error: 'Unknown platform or alert type for that platform' });
        const result = await this.target.simulate(buildAlertPreview(platform, alertType));
        return this.reply(response, 202, {
          contractVersion: '2.0.0-preview.1', accepted: result.accepted, simulated: true, platform, alertType,
          visible: this.overlayHub?.clientConfig().showSimulated === true, delivery: result.delivery, outputs: result.outputs,
        });
      }
      if (request.method === 'POST' && request.url === '/wizard/api/alerts/preview' && this.wizard !== undefined && this.overlayHub !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        const input = JSON.parse(body.text) as Record<string, unknown>;
        const platform = typeof input['platform'] === 'string' ? input['platform'] : '';
        const alertType = typeof input['alertType'] === 'string' ? input['alertType'] : '';
        if (!isValidPlatformAlertType(platform, alertType)) return this.reply(response, 400, { error: 'Unknown platform or alert type for that platform' });
        const alerts = alertPresentationSchema.parse(input['alerts']);
        const base = this.overlayHub.clientConfig();
        const count = this.overlayHub.publishPreview(buildAlertPreview(platform, alertType), { ...base, alerts, alertDurationMs: typeof input['alertDurationMs'] === 'number' ? Math.max(1_000, Math.min(60_000, Math.trunc(input['alertDurationMs']))) : base.alertDurationMs });
        return this.reply(response, 202, { accepted: count > 0, simulated: true, platform, alertType, overlayEvents: count });
      }
      return this.reply(response, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof RequestGuardError) return this.reply(response, error.statusCode, { error: error.message });
      if (error instanceof WizardTransactionError) return this.reply(response, error.statusCode, { error: error.message });
      if (error instanceof WizardConfigurationError) return this.reply(response, error.statusCode, { error: error.message });
      if (error instanceof AddOnWizardError) return this.reply(response, error.statusCode, { error: error.message });
      if (error instanceof LiveAcceptanceError) return this.reply(response, error.statusCode, { error: error.message });
      if (error instanceof ObsSourceInventoryError) return this.reply(response, error.statusCode, { error: error.message });
      if (error instanceof PreStreamReportError) return this.reply(response, 400, { error: error.message });
      if (error instanceof PayloadTooLargeError) return this.reply(response, 413, { error: error.message });
      if (error instanceof InvalidEventError) return this.reply(response, 400, { error: error.message, details: error.details });
      if (error instanceof UnknownTimedActionError) return this.reply(response, 409, { error: error.message });
      if (error instanceof OutputCapacityError) return this.reply(response, 429, { error: error.message });
      if (error instanceof OutputUnavailableError) return this.reply(response, 503, { error: error.message });
      if (error instanceof UnsupportedContentEncodingError) return this.reply(response, 415, { error: error.message });
      if (error instanceof OverlayAssetError) return this.reply(response, 400, { error: error.message });
      if (error instanceof SyntaxError || isValidationError(error)) return this.reply(response, 400, {
        error: request.url === '/wizard/api/viewer-foundation/admin'
          ? 'Request body is not a valid Viewer Foundation administration request'
          : request.url === '/wizard/api/community-analytics/admin'
            ? 'Request body is not a valid Community Analytics administration request'
          : request.url === '/wizard/api/quote-vault/admin'
            ? 'Request body is not a valid Quote Vault administration request'
            : request.url === '/wizard/api/viewer-spotlight/admin'
              ? 'Request body is not a valid Viewer Spotlight administration request'
            : request.url === '/wizard/api/chat-guard/admin'
              ? 'Request body is not a valid Chat Guard administration request'
          : 'Request body is not a valid normalized event',
      });
      this.logger.error('HTTP request failed', { method: request.method, url: request.url, error });
      return this.reply(response, 500, { error: 'Internal bridge error' });
    } finally { release?.(); }
  }

  private setSecurityHeaders(response: ServerResponse): void {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('cross-origin-resource-policy', 'same-origin');
  }

  private assertWizardUnlockRequest(request: IncomingMessage): void {
    this.guard.assertLoopback(request);
    const origin = request.headers.origin;
    if (origin !== undefined && !isSameOriginUrl(origin, request.headers.host)) throw new RequestGuardError(403, 'Wizard unlock requests must use the local StreamBridge origin');
    if (request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') throw new RequestGuardError(415, 'Content-Type must be application/json');
  }

  private assertDockSession(request: IncomingMessage, requireJson = false): void {
    this.guard.assertLoopback(request);
    const origin = request.headers.origin;
    if (origin !== undefined && !isSameOriginUrl(origin, request.headers.host)) throw new RequestGuardError(403, 'Dock requests must use the local StreamBridge origin');
    if (requireJson && request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') throw new RequestGuardError(415, 'Content-Type must be application/json');
    const cookie = request.headers.cookie?.split(';').map((value) => value.trim()).find((value) => value.startsWith('thsv_dock='))?.slice('thsv_dock='.length) ?? '';
    const provided = Buffer.from(cookie, 'utf8');
    const expected = Buffer.from(this.dockSessionToken, 'utf8');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new RequestGuardError(401, 'Open the local chat dock before sending messages');
  }

  private acquireDockRequest(): () => void {
    const now = Date.now();
    if (now - this.dockWindowStartedAt >= 60_000) { this.dockWindowStartedAt = now; this.dockRequestsInWindow = 0; }
    if (this.dockRequestsInWindow >= 30) throw new RequestGuardError(429, 'Chat dock rate limit exceeded');
    if (this.dockRequestActive) throw new RequestGuardError(429, 'Wait for the current chat message to finish queuing');
    this.dockRequestsInWindow += 1;
    this.dockRequestActive = true;
    let released = false;
    return () => { if (!released) { released = true; this.dockRequestActive = false; } };
  }

  private reply(response: ServerResponse, status: number, body: unknown): void {
    response.statusCode = status;
    response.end(`${JSON.stringify(body)}\n`);
  }

  private commandDirectoryPage(response: ServerResponse): void {
    if (this.commandDirectory === undefined) return this.reply(response, 404, { error: 'Command directory is unavailable' });
    const catalogue = this.commandDirectory.catalogue();
    response.statusCode = 200;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.setHeader('cache-control', 'no-cache');
    response.setHeader('etag', `"${catalogue.catalogHash}"`);
    response.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.end(this.commandDirectory.html(catalogue));
  }

  private async overlayAsset(response: ServerResponse, url: string): Promise<void> {
    const asset = OVERLAY_ASSETS[url];
    if (asset === undefined) return this.reply(response, 404, { error: 'Not found' });
    const body = await readFile(resolve(process.cwd(), 'overlays', 'browser', asset.file));
    response.statusCode = 200;
    response.setHeader('content-type', asset.contentType);
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; img-src 'self' https: data:; media-src 'self' blob:; frame-src https://clips.twitch.tv https://www.youtube.com https://www.youtube-nocookie.com; base-uri 'none'; form-action 'none'");
    response.end(body);
  }

  private async addOnOverlayAsset(response: ServerResponse, file: string): Promise<void> {
    const body = await readFile(resolve(process.cwd(), 'overlays', 'browser', file));
    response.statusCode = 200;
    response.setHeader('content-type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; img-src 'self' https: data:; media-src 'self' https: blob:; frame-src https://clips.twitch.tv https://www.youtube.com https://www.youtube-nocookie.com; base-uri 'none'; form-action 'none'");
    response.end(body);
  }

  private async wizardAsset(response: ServerResponse, url: string): Promise<void> {
    const asset = WIZARD_ASSETS[url];
    if (asset === undefined) return this.reply(response, 404, { error: 'Not found' });
    const body = await readFile(resolve(process.cwd(), 'wizard', 'browser', asset.file));
    response.statusCode = 200;
    response.setHeader('content-type', asset.contentType);
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; media-src 'self' blob:; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.end(body);
  }
}

interface AddOnPreviewSource {
  readonly moduleId: string;
  readonly name: string;
  readonly settings: Readonly<Record<string, unknown>>;
}

export function addOnOverlayPreviewTopic(moduleId: string): string {
  if (['thsv.ad-break-companion', 'thsv.starting-soon-countdown', 'thsv.subathon-timer'].includes(moduleId)) return `${moduleId}.timer.update`;
  if (moduleId === 'thsv.stream-labels') return `${moduleId}.labels.update`;
  if (moduleId === 'thsv.prize-wheel') return `${moduleId}.wheel.spin`;
  if (moduleId === 'thsv.custom-counter') return `${moduleId}.counter.update`;
  if (moduleId === 'thsv.village-hydration-station') return `${moduleId}.hydration.update`;
  if (moduleId === 'thsv.random-clip-player' || moduleId === 'thsv.village-jukebox') return `${moduleId}.media.play`;
  if (moduleId === 'thsv.viewer-lobby') return `${moduleId}.queue.update`;
  if (moduleId === 'thsv.village-polls') return `${moduleId}.poll.update`;
  return `${moduleId}.card.show`;
}

interface LegacyViewerMigrationPreview {
  readonly found: boolean;
  readonly source: string;
  readonly digest?: string;
  readonly records: readonly Readonly<{ viewerId: string; points: number; lastAwardAt: Readonly<Record<string, number>> }>[];
  readonly rejectedRecords: number;
  readonly totalPoints: number;
}

async function readLegacyViewerMigration(dataRoot: string): Promise<LegacyViewerMigrationPreview> {
  const path = resolve(dataRoot, 'state', 'viewer-progression.json');
  try {
    const information = await stat(path);
    if (!information.isFile() || information.size > 2_000_000) throw new Error('Legacy Viewer Progression state must be a regular file no larger than 2 MB.');
    const bytes = await readFile(path); const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Legacy Viewer Progression state must be a JSON object.');
    const viewers = (parsed as Record<string, unknown>)['viewers'];
    if (viewers === null || typeof viewers !== 'object' || Array.isArray(viewers)) throw new Error('Legacy Viewer Progression state has no valid viewers object.');
    const records: Array<{ viewerId: string; points: number; lastAwardAt: Record<string, number> }> = []; let rejectedRecords = 0;
    for (const [viewerId, raw] of Object.entries(viewers).slice(0, 5_000)) {
      if (!/^[a-z][a-z0-9-]{0,63}$/u.test(viewerId) || raw === null || typeof raw !== 'object' || Array.isArray(raw)) { rejectedRecords += 1; continue; }
      const source = raw as Record<string, unknown>; const points = source['points'];
      if (!Number.isSafeInteger(points) || (points as number) < 0) { rejectedRecords += 1; continue; }
      const lastAwardAt: Record<string, number> = {}; const awards = source['lastAwardAt'];
      if (awards !== null && typeof awards === 'object' && !Array.isArray(awards)) for (const [eventType, at] of Object.entries(awards).slice(0, 50)) if (/^[a-z][a-z0-9.-]{0,63}$/u.test(eventType) && Number.isSafeInteger(at) && (at as number) >= 0) lastAwardAt[eventType] = at as number;
      records.push({ viewerId, points: points as number, lastAwardAt });
    }
    const boundedRecords = records.slice(0, 500);
    return { found: true, source: 'data/state/viewer-progression.json', digest: createHash('sha256').update(bytes).digest('hex'), records: boundedRecords, rejectedRecords: rejectedRecords + Math.max(0, Object.keys(viewers).length - 5_000) + Math.max(0, records.length - boundedRecords.length), totalPoints: boundedRecords.reduce((total, record) => Math.min(Number.MAX_SAFE_INTEGER, total + record.points), 0) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { found: false, source: 'data/state/viewer-progression.json', records: [], rejectedRecords: 0, totalPoints: 0 };
    throw error;
  }
}

export function buildAddOnOverlayPreview(addOn: AddOnPreviewSource, previewMode = ''): Readonly<Record<string, unknown>> {
  if (addOn.moduleId === 'thsv.village-hydration-station') {
    const goalOunces = boundedPreviewInteger(addOn.settings['goalOunces'], 8, 512, 64);
    const totalOunces = Math.max(1, Math.round(goalOunces / 2));
    const reminderIntervalMinutes = boundedPreviewInteger(addOn.settings['reminderIntervalMinutes'], 5, 240, 45);
    return {
      moduleId: addOn.moduleId, cardKind: 'hydration-station', visible: true,
      title: 'Water Goal', totalOunces, goalOunces, percentage: Math.round(totalOunces / goalOunces * 1_000) / 10,
      defaultServingOunces: boundedPreviewInteger(addOn.settings['defaultServingOunces'], 1, 64, 8),
      nextReminderAt: Date.now() + reminderIntervalMinutes * 60_000, reminderIntervalMinutes,
      showNumbers: addOn.settings['showNumbers'] !== false, showNextReminder: addOn.settings['showNextReminder'] !== false,
      live: true, livePlatforms: ['twitch'], sequence: Date.now(), preview: true, templatePreview: true,
      notice: { kind: 'preview', text: 'Hydration check. Time for a sip of water.', actor: '', platform: '', expiresAt: Date.now() + 60_000 },
      style: {
        containerStyle: previewEnum(addOn.settings['containerStyle'], ['bottle', 'glass', 'water-tower'], 'bottle'),
        backgroundMode: previewEnum(addOn.settings['backgroundMode'], ['glass', 'solid', 'none'], 'glass'),
        backgroundColor: previewColor(addOn.settings['backgroundColor'], '#0b1720'),
        backgroundOpacity: typeof addOn.settings['backgroundOpacity'] === 'number' ? Math.max(0, Math.min(1, addOn.settings['backgroundOpacity'])) : .9,
        waterColor: previewColor(addOn.settings['waterColor'], '#55d6ff'), waterHighlightColor: previewColor(addOn.settings['waterHighlightColor'], '#b8f3ff'),
        accentColor: previewColor(addOn.settings['accentColor'], '#7ff5cc'), textColor: previewColor(addOn.settings['textColor'], '#ffffff'), mutedColor: previewColor(addOn.settings['mutedColor'], '#c9e7ef'),
      },
    };
  }
  if (addOn.moduleId === 'thsv.ad-break-companion') {
    const active = previewMode === 'active';
    const remainingSeconds = active ? 90 : 60;
    return {
      moduleId: addOn.moduleId,
      variant: 'ad-break',
      phase: active ? 'active' : 'scheduled',
      label: previewText(addOn.settings[active ? 'activeLabel' : 'upcomingLabel'], active ? 'AD BREAK' : 'AD BREAK IN'),
      remainingSeconds,
      maximumSeconds: remainingSeconds,
      remainingText: active ? '01:30' : '01:00',
      running: true,
      live: true,
      completed: false,
      badgeText: active ? 'IN PROGRESS' : 'UPCOMING',
      lastReason: previewText(addOn.settings[active ? 'activeMessage' : 'upcomingMessage'], active ? 'The stream will continue after this break' : 'A quick break is coming up'),
      contextText: active ? '90 second Twitch ad break' : 'Twitch · 3 snoozes available',
      warning: false,
      critical: false,
      preview: true,
      style: {
        fontFamily: 'broadcast',
        backgroundMode: previewEnum(addOn.settings['overlayBackgroundMode'], ['glass', 'solid', 'none'], 'glass'),
        backgroundColor: previewColor(addOn.settings['overlayBackgroundColor'], '#101722'),
        backgroundOpacity: typeof addOn.settings['overlayBackgroundOpacity'] === 'number' ? addOn.settings['overlayBackgroundOpacity'] : .9,
        accentColor: previewColor(addOn.settings['overlayAccentColor'], '#f4c95d'),
        textColor: previewColor(addOn.settings['overlayTextColor'], '#ffffff'),
        mutedColor: previewColor(addOn.settings['overlayMutedColor'], '#d9e2ef'),
        warningColor: previewColor(addOn.settings['overlayAccentColor'], '#f4c95d'),
        criticalColor: previewColor(addOn.settings['overlayCriticalColor'], '#ff6b7d'),
        liveColor: previewColor(addOn.settings['overlayAccentColor'], '#f4c95d'),
        borderColor: previewColor(addOn.settings['overlayBorderColor'], '#f4c95d'),
        showProgressBar: true,
      },
    };
  }
  if (addOn.moduleId === 'thsv.starting-soon-countdown' || addOn.moduleId === 'thsv.subathon-timer') {
    const countdown = addOn.moduleId === 'thsv.starting-soon-countdown';
    const remainingSeconds = countdown
      ? Math.max(5, boundedPreviewInteger(addOn.settings['durationHours'], 0, 24, 0) * 3_600 + boundedPreviewInteger(addOn.settings['durationMinutes'], 0, 59, 10) * 60 + boundedPreviewInteger(addOn.settings['durationSeconds'], 0, 59, 0))
      : Math.max(60, boundedPreviewInteger(addOn.settings['startingMinutes'], 0, 10_080, 60) * 60);
    const label = previewText(addOn.settings['overlayLabel'], countdown ? 'STARTING SOON' : 'SUBATHON');
    return {
      moduleId: addOn.moduleId, label, remainingSeconds, maximumSeconds: remainingSeconds,
      remainingText: `${String(Math.floor(remainingSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((remainingSeconds % 3600) / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`,
      running: true, live: true, completed: false, badgeText: 'RUNNING',
      contextText: countdown ? 'Starting Soon scene' : 'Twitch + YouTube + Kick + TikTok',
      lastReason: countdown ? 'Preview uses the saved countdown template' : 'Preview uses the saved subathon template',
      warning: false, critical: false, preview: true, templatePreview: true,
      style: {
        fontFamily: previewEnum(addOn.settings['overlayFontFamily'], ['display', 'broadcast', 'mono'], 'display'),
        backgroundMode: previewEnum(addOn.settings['overlayBackgroundMode'], ['glass', 'solid', 'none'], 'glass'),
        backgroundColor: previewColor(addOn.settings['overlayBackgroundColor'], '#0b1017'),
        backgroundOpacity: typeof addOn.settings['overlayBackgroundOpacity'] === 'number' ? Math.max(0, Math.min(1, addOn.settings['overlayBackgroundOpacity'])) : .88,
        accentColor: previewColor(addOn.settings['overlayAccentColor'], '#7ee0ff'), textColor: previewColor(addOn.settings['overlayTextColor'], '#eff7ff'),
        mutedColor: previewColor(addOn.settings['overlayMutedColor'], '#dfefff'), warningColor: previewColor(addOn.settings['overlayWarningColor'], '#f0c15a'),
        criticalColor: previewColor(addOn.settings['overlayCriticalColor'], '#ff6b7d'), liveColor: previewColor(addOn.settings['overlayLiveColor'], '#61f2a4'),
        borderColor: previewColor(addOn.settings['overlayBorderColor'], '#85cbff'), showProgressBar: addOn.settings['overlayShowProgressBar'] !== false,
      },
    };
  }
  if (addOn.moduleId === 'thsv.custom-counter') return {
    id: previewText(addOn.settings['defaultCounterId'], 'main'), name: previewText(addOn.settings['defaultCounterName'], 'Stream Counter'),
    value: 42, visible: true, sequence: Date.now(), iconUrl: typeof addOn.settings['iconUrl'] === 'string' && addOn.settings['iconUrl'].startsWith('https://') ? addOn.settings['iconUrl'] : '',
    preview: true, templatePreview: true,
    style: {
      backgroundColor: previewColor(addOn.settings['backgroundColor'], '#111827'), accentColor: previewColor(addOn.settings['accentColor'], '#7ee0ff'), textColor: previewColor(addOn.settings['textColor'], '#ffffff'),
      fontFamily: previewEnum(addOn.settings['fontFamily'], ['display', 'broadcast', 'mono'], 'broadcast'), fontSize: boundedPreviewInteger(addOn.settings['fontSize'], 24, 120, 72),
      borderColor: previewColor(addOn.settings['borderColor'], '#7ee0ff'), borderWidth: boundedPreviewInteger(addOn.settings['borderWidth'], 0, 12, 3), borderRadius: boundedPreviewInteger(addOn.settings['borderRadius'], 0, 64, 24),
      shadow: addOn.settings['shadow'] !== false, spacing: boundedPreviewInteger(addOn.settings['spacing'], 0, 64, 24), alignment: previewEnum(addOn.settings['alignment'], ['left', 'center', 'right'], 'left'),
      layout: previewEnum(addOn.settings['layout'], ['horizontal', 'vertical'], 'horizontal'), showLabel: addOn.settings['showLabel'] !== false, showIcon: addOn.settings['showIcon'] !== false, animation: 'none',
    },
  };
  if (addOn.moduleId === 'thsv.random-clip-player' || addOn.moduleId === 'thsv.village-jukebox') return {
    templatePreview: true, preview: true, playbackId: `template-${addOn.moduleId}`, durationMs: 600_000,
    title: addOn.moduleId === 'thsv.village-jukebox' ? 'Example Song — Example Artist · requested by Example Villager' : 'Random Twitch Clip · exact 16:9 playback area',
    style: {
      backgroundColor: previewColor(addOn.settings['backgroundColor'], '#101820'), accentColor: previewColor(addOn.settings['accentColor'], '#7ff5cc'),
      textColor: previewColor(addOn.settings['textColor'], '#ffffff'), fontFamily: previewEnum(addOn.settings['fontFamily'], ['broadcast', 'display', 'serif', 'mono'], 'broadcast'),
    },
  };
  if (addOn.moduleId === 'thsv.accessibility-captions') return {
    title: 'Example Viewer · Twitch', text: 'This is the exact saved caption template with a representative long message so its wrapping and safe area can be sized correctly.',
    durationMs: boundedPreviewInteger(addOn.settings['durationSeconds'], 3, 30, 8) * 1_000, presentationMode: 'single', preview: true, templatePreview: true,
    style: { backgroundMode: previewEnum(addOn.settings['backgroundMode'], ['solid', 'glass', 'none'], 'solid'), backgroundColor: previewColor(addOn.settings['backgroundColor'], '#000000'), backgroundOpacity: addOn.settings['highContrast'] === false ? .78 : .96, accentColor: previewColor(addOn.settings['textColor'], '#ffffff'), textColor: previewColor(addOn.settings['textColor'], '#ffffff'), fontFamily: 'broadcast', fontSize: boundedPreviewInteger(addOn.settings['fontSize'], 20, 72, 36) },
  };
  if (addOn.moduleId === 'thsv.voice-relay') return {
    title: 'Example Villager · TWITCH', text: 'This is the exact speaker-card template and typewriter text area used while Village Voice is speaking.',
    durationMs: 60_000, revealDurationMs: 50_000, presentationMode: 'typewriter', preview: true, templatePreview: true,
    style: { backgroundMode: previewEnum(addOn.settings['overlayBackgroundMode'], ['glass', 'solid', 'none'], 'glass'), backgroundColor: previewColor(addOn.settings['overlayBackgroundColor'], '#101820'), backgroundOpacity: typeof addOn.settings['overlayBackgroundOpacity'] === 'number' ? Math.max(0, Math.min(1, addOn.settings['overlayBackgroundOpacity'])) : .94, accentColor: previewColor(addOn.settings['overlayAccentColor'], '#7ff5cc'), textColor: previewColor(addOn.settings['overlayTextColor'], '#ffffff'), fontFamily: 'broadcast', fontSize: boundedPreviewInteger(addOn.settings['overlayFontSize'], 20, 72, 38) },
  };
  if (addOn.moduleId === 'thsv.category-pilot') return { title: 'Category Pilot suggestion', text: 'Example Game is running. Apply gameplay?', durationMs: 15_000, preview: true, templatePreview: true };
  if (addOn.moduleId === 'thsv.raid-scout') return {
    title: 'RAID SUGGESTION', text: 'Example Creator — Just Chatting — 42 viewers — Preferred channel', durationMs: boundedPreviewInteger(addOn.settings['cardSeconds'], 5, 3_600, 20) * 1_000,
    preview: true, templatePreview: true,
    style: { backgroundMode: previewEnum(addOn.settings['overlayBackgroundMode'], ['glass', 'solid', 'none'], 'glass'), backgroundColor: previewColor(addOn.settings['overlayBackgroundColor'], '#17122b'), backgroundOpacity: typeof addOn.settings['overlayBackgroundOpacity'] === 'number' ? Math.max(0, Math.min(1, addOn.settings['overlayBackgroundOpacity'])) : .94, accentColor: previewColor(addOn.settings['overlayAccentColor'], '#9146ff'), textColor: previewColor(addOn.settings['overlayTextColor'], '#ffffff'), fontFamily: previewEnum(addOn.settings['overlayFontFamily'], ['display', 'broadcast', 'serif', 'mono'], 'display') },
  };
  if (addOn.moduleId === 'thsv.automated-shoutouts') {
    const [requestedPresentation, requestedPlatform] = previewMode.split('-');
    const platform = ['twitch', 'youtube', 'kick', 'tiktok'].includes(requestedPlatform ?? '')
      ? requestedPlatform as 'twitch' | 'youtube' | 'kick' | 'tiktok'
      : 'twitch';
    // Only Twitch exposes the verified arbitrary-user category lookup required for a creator card.
    // Other platforms always preview the same viewer-welcome contract used by the live add-on.
    const presentation = requestedPresentation === 'viewer' || platform !== 'twitch' ? 'welcome' : 'creator';
    const platformName = platform === 'tiktok' ? 'TikTok' : `${platform[0]?.toUpperCase() ?? ''}${platform.slice(1)}`;
    const displayName = presentation === 'welcome' ? `Example ${platformName} Viewer` : `Example ${platformName} Streamer`;
    const userName = presentation === 'welcome' ? `example_${platform}_viewer` : `example_${platform}_streamer`;
    const category = presentation === 'welcome' ? `${platformName} Community` : 'Just Chatting';
    return {
      cardKind: 'shoutout-spotlight', trigger: presentation === 'welcome' ? 'first-chat' : 'manual', presentation, platform, preview: true,
      creator: {
        displayName, userName, category,
        channelUrl: presentation === 'welcome' ? '' : `https://${platform}.com/${userName}`,
        avatarUrl: '', viewers: 0,
      },
      title: presentation === 'welcome' ? `Welcome ${displayName}` : `Meet ${displayName} on ${platformName}`,
      text: presentation === 'welcome'
        ? `Welcome to the village, ${displayName}! We are glad you joined us on ${platformName}.`
        : `Go show ${displayName} some love! They stream ${category}.`,
      durationMs: 60_000,
    };
  }
  if (addOn.moduleId === 'thsv.viewer-lobby') {
    return {
      status: 'open', revision: Date.now(), count: 4, selectedEntryId: 'preview-selected', preview: true,
      entries: [
        { entryId: 'preview-selected', displayName: 'Selected Villager', platform: 'twitch', position: 1, state: 'selected', gamertag: 'CozySloth' },
        { entryId: 'preview-youtube', displayName: 'YouTube Viewer', platform: 'youtube', position: 2, state: 'waiting' },
        { entryId: 'preview-kick', displayName: 'Kick Viewer', platform: 'kick', position: 3, state: 'waiting' },
        { entryId: 'preview-tiktok', displayName: 'TikTok Viewer', platform: 'tiktok', position: 4, state: 'waiting' },
      ],
      style: {
        backgroundMode: previewEnum(addOn.settings['backgroundMode'], ['glass', 'solid', 'none'], 'glass'),
        backgroundColor: previewColor(addOn.settings['backgroundColor'], '#101820'),
        backgroundOpacity: typeof addOn.settings['backgroundOpacity'] === 'number' ? addOn.settings['backgroundOpacity'] : 0.92,
        accentColor: previewColor(addOn.settings['accentColor'], '#7ff5cc'),
        textColor: previewColor(addOn.settings['textColor'], '#ffffff'),
        fontFamily: previewEnum(addOn.settings['fontFamily'], ['broadcast', 'display', 'serif', 'mono'], 'broadcast'),
        fontSize: boundedPreviewInteger(addOn.settings['fontSize'], 18, 56, 32),
      },
    };
  }
  if (addOn.moduleId === 'thsv.village-draw') {
    return {
      cardKind: 'village-draw', phase: 'winner', giveawayName: previewText(addOn.settings['giveawayName'], 'Village Giveaway'),
      prizeName: previewText(addOn.settings['prizeItem'], 'Mystery Prize'), winnerMessage: previewText(addOn.settings['winnerOverlayMessage'], 'The village has chosen!'),
      winner: { displayName: 'Example Villager With A Long Name', platform: 'twitch', avatarUrl: '' },
      entrants: ['CozySloth', 'Early Bird', 'Night Owl', 'Village Wanderer', 'Example Villager'], entrantCount: 42, ticketCount: 84,
      imageUrl: typeof addOn.settings['prizeImageUrl'] === 'string' && addOn.settings['prizeImageUrl'].startsWith('https://') ? addOn.settings['prizeImageUrl'] : '',
      durationMs: boundedPreviewInteger(addOn.settings['cardSeconds'], 5, 60, 12) * 1_000,
      drawAnimationMs: boundedPreviewInteger(addOn.settings['drawAnimationSeconds'], 2, 10, 4) * 1_000,
      preview: true,
      style: {
        backgroundMode: 'glass', layout: previewEnum(addOn.settings['ticketLayout'], ['compact', 'wide'], 'compact'),
        backgroundColor: previewColor(addOn.settings['backgroundColor'], '#10201b'),
        backgroundOpacity: typeof addOn.settings['backgroundOpacity'] === 'number' ? Math.max(0.2, Math.min(0.95, addOn.settings['backgroundOpacity'])) : 0.72,
        accentColor: previewColor(addOn.settings['winnerColor'], '#ffd166'),
        textColor: previewColor(addOn.settings['textColor'], '#ffffff'),
        fontFamily: previewEnum(addOn.settings['fontFamily'], ['broadcast', 'display', 'serif', 'mono'], 'broadcast'),
        showConfetti: addOn.settings['showConfetti'] !== false, showPrizeImage: addOn.settings['showPrizeImage'] !== false,
        showWinnerAvatar: addOn.settings['showWinnerAvatar'] !== false, showPlatformBadge: addOn.settings['showPlatformBadge'] !== false,
        showEntryCount: addOn.settings['showEntryCount'] !== false, playWinnerTone: false,
      },
    };
  }
  if (addOn.moduleId === 'thsv.first-five') {
    return {
      cardKind: 'first-five', headline: 'Twitch First Five', subtitle: 'The first villagers have arrived', monthLabel: 'AUGUST 2026', platform: 'twitch', preview: true,
      placements: [
        { position: 1, displayName: 'Early Bird', platform: 'twitch' },
        { position: 2, displayName: 'CozySloth', platform: 'twitch' },
        { position: 3, displayName: 'Village Wanderer', platform: 'twitch' },
        { position: 4, displayName: 'Night Owl', platform: 'twitch' },
        { position: 5, displayName: 'Example Villager With A Long Name', platform: 'twitch' },
      ],
      leaders: [
        { rank: 1, displayName: 'Early Bird', points: 47 },
        { rank: 2, displayName: 'CozySloth', points: 41 },
        { rank: 3, displayName: 'Village Wanderer', points: 36 },
      ],
      title: 'FIRST FIVE - AUGUST 2026', text: 'The village arrival board is complete.', durationMs: 60_000,
      queueGapMs: boundedPreviewInteger(addOn.settings['crossPlatformGapSeconds'], 1, 10, 2) * 1_000,
    };
  }
  if (addOn.moduleId === 'thsv.fan-crown') {
    return {
      cardKind: 'fan-crown', state: 'held', eventTitle: 'CROWN CAPTURED', seasonMonth: '2026-08', currentCost: 1_250, preview: true,
      holder: { displayName: 'Example Villager With A Very Long Display Name', platform: 'twitch', avatarUrl: '', claimedAt: new Date(Date.now() - 18 * 60_000).toISOString(), captures: 4, totalSpent: 2_750 },
      leaders: [
        { rank: 1, displayName: 'Example Villager', totalSpent: 2_750, captures: 4 },
        { rank: 2, displayName: 'CozySloth', totalSpent: 2_100, captures: 3 },
        { rank: 3, displayName: 'Night Owl', totalSpent: 1_600, captures: 2 },
      ],
      title: 'CROWN CAPTURED', text: 'Example Villager holds the crown', durationMs: 60_000,
      style: {
        backgroundMode: previewEnum(addOn.settings['overlayBackgroundMode'], ['glass', 'solid', 'none'], 'glass'),
        backgroundColor: previewColor(addOn.settings['overlayBackgroundColor'], '#201335'),
        backgroundOpacity: typeof addOn.settings['overlayBackgroundOpacity'] === 'number' ? addOn.settings['overlayBackgroundOpacity'] : .94,
        accentColor: previewColor(addOn.settings['overlayAccentColor'], '#f4cc63'),
        textColor: previewColor(addOn.settings['overlayTextColor'], '#ffffff'),
        fontFamily: previewEnum(addOn.settings['overlayFontFamily'], ['display', 'broadcast', 'serif', 'mono'], 'display'),
      },
    };
  }
  if (addOn.moduleId === 'thsv.prize-wheel') {
    const rawOptions = Array.isArray(addOn.settings['options']) ? addOn.settings['options'] : [];
    const options = rawOptions.map((value) => previewText(value, '')).filter(Boolean).slice(0, 10);
    const boundedOptions = options.length >= 2 ? options : ['Cozy Game', 'Community Night', 'Story Game', 'Wildcard'];
    const winnerIndex = Math.min(1, boundedOptions.length - 1);
    return {
      title: previewText(addOn.settings['wheelTitle'], 'SPIN THE WHEEL'),
      options: boundedOptions,
      winnerIndex,
      winner: boundedOptions[winnerIndex],
      spinDurationMs: boundedPreviewInteger(addOn.settings['spinSeconds'], 6, 20, 9) * 1_000,
      winnerDurationMs: boundedPreviewInteger(addOn.settings['winnerCardSeconds'], 4, 30, 8) * 1_000,
      sequence: Date.now(),
      preview: true,
      style: {
        backgroundColor: previewColor(addOn.settings['backgroundColor'], '#101521'),
        wheelColors: Array.isArray(addOn.settings['wheelColors']) ? addOn.settings['wheelColors'].filter((value) => typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value)).slice(0, 10) : [],
        textColor: previewColor(addOn.settings['textColor'], '#ffffff'),
        accentColor: previewColor(addOn.settings['accentColor'], '#ffd166'),
        winnerColor: previewColor(addOn.settings['winnerColor'], '#7ff5cc'),
      },
    };
  }
  if (addOn.moduleId === 'thsv.stream-labels') {
    const settings = addOn.settings;
    const titles = {
      follower: previewText(settings['followerTitle'], 'Latest Follower'),
      member: previewText(settings['memberTitle'], 'Latest Member'),
      'gift-membership': previewText(settings['giftMembershipTitle'], 'Latest Gift Membership'),
      support: previewText(settings['supportTitle'], 'Latest Support'),
      raid: previewText(settings['raidTitle'], 'Latest Raid'),
      reward: previewText(settings['rewardTitle'], 'Latest Reward'),
      latest: previewText(settings['latestTitle'], 'Latest Event'),
    };
    const labels = Object.fromEntries(Object.entries(titles).map(([key, title], index) => [key, {
      key, title, value: ['Example Follower', 'Example Member · 6 months', 'Example Gifter · 5 gifted', 'Example Supporter · 25.00 USD', 'Example Raider · 42 viewers', 'Example Viewer · Hydrate', 'Example Supporter · 25.00 USD'][index],
      platform: ['twitch', 'youtube', 'kick', 'tiktok', 'twitch', 'twitch', 'youtube'][index], eventType: 'preview', eventId: `preview-${key}`, at: Date.now(),
    }]));
    return {
      labels, enabledLabels: Object.keys(labels), preview: true,
      style: {
        showLabelTitle: settings['showLabelTitle'] !== false,
        showPlatform: settings['showPlatform'] !== false,
        backgroundMode: previewEnum(settings['backgroundMode'], ['glass', 'solid', 'none'], 'glass'),
        backgroundColor: typeof settings['backgroundColor'] === 'string' ? settings['backgroundColor'] : '#101820',
        backgroundOpacity: typeof settings['backgroundOpacity'] === 'number' ? settings['backgroundOpacity'] : 0.88,
        accentColor: typeof settings['accentColor'] === 'string' ? settings['accentColor'] : '#7ff5cc',
        textColor: typeof settings['textColor'] === 'string' ? settings['textColor'] : '#ffffff',
        fontFamily: previewEnum(settings['fontFamily'], ['broadcast', 'display', 'serif', 'mono'], 'broadcast'),
        fontSize: boundedPreviewInteger(settings['fontSize'], 18, 96, 42),
        textAlign: previewEnum(settings['textAlign'], ['left', 'center', 'right'], 'left'),
      },
    };
  }
  if (addOn.moduleId === 'thsv.village-roll-call') {
    return {
      cardKind: 'village-roll-call', mode: 'preview', headline: 'Village Roll Call',
      subtitle: 'Monthly check-in leaderboard', monthLabel: 'CURRENT SEASON',
      leaders: [
        { rank: 1, displayName: 'Example Villager', count: 31 },
        { rank: 2, displayName: 'CozySloth', count: 29 },
        { rank: 3, displayName: 'Early Bird', count: 27 },
        { rank: 4, displayName: 'Night Owl', count: 24 },
        { rank: 5, displayName: 'Village Wanderer', count: 21 },
      ],
      title: 'VILLAGE ROLL CALL • PREVIEW',
      text: '1. Example Villager (7) • 2. CozySloth (5) • 3. Early Bird (4)',
      durationMs: boundedPreviewInteger(addOn.settings['cardSeconds'], 5, 3_600, 20) * 1_000,
      preview: true,
    };
  }
  if (addOn.moduleId === 'thsv.village-polls') {
    return {
      cardKind: 'village-polls', state: 'open', question: 'Which cozy community activity should we choose for the next village night?',
      totalVotes: 42, openedAt: new Date().toISOString(), closesAt: new Date(Date.now() + 90_000).toISOString(), winnerIndexes: [], preview: true,
      options: [
        { index: 1, label: 'Community game night', votes: 16, percentage: 38, platforms: { twitch: 7, youtube: 4, kick: 3, tiktok: 2 } },
        { index: 2, label: 'Movie watch-along', votes: 11, percentage: 26, platforms: { twitch: 4, youtube: 3, kick: 2, tiktok: 2 } },
        { index: 3, label: 'Creative build challenge', votes: 8, percentage: 19, platforms: { twitch: 3, youtube: 2, kick: 2, tiktok: 1 } },
        { index: 4, label: 'Chill story night', votes: 7, percentage: 17, platforms: { twitch: 2, youtube: 2, kick: 1, tiktok: 2 } },
      ],
      durationMs: boundedPreviewInteger(addOn.settings['resultSeconds'], 5, 60, 12) * 1_000,
      style: {
        layout: previewEnum(addOn.settings['layout'], ['compact', 'full'], 'compact'),
        showPercentages: addOn.settings['showPercentages'] !== false, showVoteCounts: addOn.settings['showVoteCounts'] !== false,
        showTimer: addOn.settings['showTimer'] !== false, showPlatformBreakdown: addOn.settings['showPlatformBreakdown'] === true,
        transition: previewEnum(addOn.settings['transition'], ['slide', 'fade', 'pop'], 'slide'),
        backgroundColor: previewColor(addOn.settings['backgroundColor'], '#111923'),
        backgroundOpacity: typeof addOn.settings['backgroundOpacity'] === 'number' ? Math.max(0.2, Math.min(0.95, addOn.settings['backgroundOpacity'])) : 0.72,
        accentColor: previewColor(addOn.settings['accentColor'], '#7ff5cc'), textColor: previewColor(addOn.settings['textColor'], '#ffffff'),
      },
    };
  }
  if (addOn.moduleId === 'thsv.chat-play-pack' && previewMode === 'trivia') return {
    cardKind: 'chat-play-game', gameKind: 'trivia', gameName: 'Trivia',
    prompt: 'Which planet is known as the Red Planet?', choices: ['Venus', 'Mars', 'Jupiter', 'Mercury'],
    instruction: 'Answer with !answer', durationMs: 60_000, presentationMode: 'single', preview: true,
  };
  if (addOn.moduleId === 'thsv.chat-play-pack' && previewMode === 'unscramble') return {
    cardKind: 'chat-play-game', gameKind: 'unscramble', gameName: 'Unscramble',
    prompt: 'EGVILAL', hint: 'A small community or settlement', instruction: 'Answer with !answer',
    durationMs: 60_000, presentationMode: 'single', preview: true,
  };
  if (addOn.moduleId === 'thsv.chat-play-pack' && previewMode === 'duel') return {
    cardKind: 'chat-play-game', gameKind: 'duel', gameName: 'Viewer Duel',
    challenger: 'Example Villager', opponent: 'CozySloth', instruction: 'Use !accept or !decline',
    durationMs: 60_000, presentationMode: 'single', preview: true,
  };
  if (addOn.moduleId === 'thsv.chat-play-pack') return {
    cardKind: 'chat-play-winner', gameName: 'Viewer Duel', points: 50,
    winner: { displayName: 'Example Villager With A Long Display Name', platform: 'twitch', avatarUrl: '' },
    durationMs: 60_000, presentationMode: 'single', preview: true,
  };
  if (addOn.moduleId !== 'thsv.viewer-spotlight') return { title: addOn.name, text: 'Overlay connection and scoped publication are working.', durationMs: 5_000, preview: true };
  const settings = addOn.settings;
  const fields: string[] = [];
  const stats: Array<{ label: string; value: string }> = [];
  const addField = (label: string, value: string, legacy: string): void => { stats.push({ label, value }); fields.push(legacy); };
  if (settings['showPoints'] !== false) addField('Village Points', '2,450', '2,450 points');
  if (settings['showLevel'] !== false) addField('Level', '25', 'Level 25');
  if (settings['showLatestAchievement'] !== false) addField('Achievement', 'Community Supporter', 'Community Supporter');
  if (settings['showObservedSessions'] === true) addField('Sessions', '14', '14 observed sessions');
  if (settings['showObservedMessages'] === true) addField('Messages', '328', '328 observed messages');
  if (settings['showObservedCommands'] === true) addField('Commands', '41', '41 observed commands');
  if (settings['showEngagementScore'] === true) addField('Engagement', '512', '512 engagement score');
  if (settings['showSeasonRank'] === true) addField('Monthly Rank', '#3 of 24', '#3 of 24 this month');
  const platform = settings['showPlatformBadge'] === false ? '' : ' • Twitch';
  return {
    cardKind: 'viewer-spotlight',
    title: `Preview Viewer${platform}`,
    text: fields.join(' • ') || 'Viewer card preview',
    front: {
      displayName: 'Preview Viewer', platformLabel: settings['showPlatformBadge'] === false ? '' : 'Twitch',
      viewerType: 'Streamer', category: 'Just Chatting', followStatus: 'following',
    },
    stats,
    flipToStats: stats.length > 0,
    durationMs: boundedPreviewInteger(settings['durationSeconds'], 3, 60, 10) * 1_000,
    presentationMode: previewEnum(settings['displayMode'], ['single', 'fade-carousel', 'credits-scroll'], 'single'),
    preview: true,
    style: {
      backgroundMode: previewEnum(settings['backgroundMode'], ['glass', 'solid', 'none'], 'glass'),
      backgroundColor: previewColor(settings['backgroundColor'], '#140d1f'),
      backgroundOpacity: typeof settings['backgroundOpacity'] === 'number' && Number.isFinite(settings['backgroundOpacity']) ? Math.max(0, Math.min(1, settings['backgroundOpacity'])) : 0.94,
      accentColor: previewColor(settings['accentColor'], '#7ff5cc'),
      textColor: previewColor(settings['textColor'], '#ffffff'),
      fontFamily: previewEnum(settings['fontFamily'], ['broadcast', 'display', 'serif', 'mono'], 'broadcast'),
    },
  };
}

function previewText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? Array.from(value.trim()).slice(0, 80).join('') : fallback;
}

function boundedPreviewInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return Number.isSafeInteger(value) ? Math.max(minimum, Math.min(maximum, value as number)) : fallback;
}

function previewColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
}

function previewEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function isValidPlatformAlertType(platform: string, alertType: string): boolean {
  if (!(ALERT_PLATFORM_VALUES as readonly string[]).includes(platform)) return false;
  return (PLATFORM_ALERT_TYPES[platform as (typeof ALERT_PLATFORM_VALUES)[number]] as readonly string[]).includes(alertType);
}

function buildAlertPreview(platform: string, alertType: string): NormalizedEvent {
  const eventTypes: Readonly<Record<string, string>> = {
    follow: 'channel.follow', subscription: 'channel.subscription', membership: 'channel.membership',
    'gift-subscription': 'channel.gift-subscription', gift: 'engagement.gift', donation: 'engagement.donation',
    cheer: 'engagement.cheer', 'super-chat': 'engagement.super-chat', raid: 'channel.raid', milestone: 'engagement.milestone',
  };
  const payloads: Readonly<Record<string, Readonly<Record<string, string | number>>>> = {
    follow: {}, subscription: { tier: 'Tier 1', message: 'Simulated subscription alert' }, membership: { tier: 'Member' },
    'gift-subscription': { tier: 'Tier 1', quantity: 5 }, gift: { itemName: 'Berry', quantity: 12 },
    donation: { amount: '5.00', currency: 'USD', message: 'Simulated support' }, cheer: { quantity: 100, message: 'Simulated cheer' },
    'super-chat': { amount: '5.00', currency: 'USD', message: 'Simulated Super Chat' }, raid: { quantity: 25 },
    milestone: { metric: 'followers', value: 1000 },
  };
  return buildNormalizedEvent({
    eventType: eventTypes[alertType] ?? 'engagement.milestone', platform,
    adapter: 'wizard-preview', sourceEventName: `Wizard ${platform} ${alertType} preview`, sourceEventId: `wizard-${randomUUID()}`,
    channel: { name: 'Preview Channel' }, ...(alertType === 'milestone' ? {} : { user: { name: 'preview_viewer', displayName: 'Preview Viewer', actorType: 'human' as const, roles: [] } }),
    payload: payloads[alertType] ?? {}, simulated: true,
  });
}

const WIZARD_ASSETS: Readonly<Record<string, { readonly file: string; readonly contentType: string }>> = {
  '/wizard': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/wizard/': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/wizard/app.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/wizard/addons.js': { file: 'addons.js', contentType: 'text/javascript; charset=utf-8' },
  '/wizard/styles.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/wizard/emote-preview.svg': { file: 'emote-preview.svg', contentType: 'image/svg+xml; charset=utf-8' },
};

const OVERLAY_ASSETS: Readonly<Record<string, { readonly file: string; readonly contentType: string }>> = {
  '/overlay': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/overlay/': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/overlay/chat': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/overlay/chat/dock': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/overlay/alerts': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/overlay/app.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-0.9.5.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-0.9.6.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-0.9.8.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-0.9.9.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.0.0.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.1.0.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.2.1.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.3.1.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.4.1.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.4.2.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.4.3.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.4.4.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.4.5.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.4.6.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.4.7.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.4.8.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.5.0.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.5.1.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.5.2.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/alert-queue-1.2.2.js': { file: 'alert-queue.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/alert-queue-1.2.3.js': { file: 'alert-queue.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-0.9.8.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-0.9.9.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-1.0.0.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-1.1.0.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-1.2.1.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-1.3.1.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-1.3.3.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/styles.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.5.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.6.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.8.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.9.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.0.0.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.1.0.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.1.1.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.2.1.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.3.1.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.3.2.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.3.3.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.3.4.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.3.5.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.3.6.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.3.7.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.4.0.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.4.1.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.4.2.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.4.3.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.4.4.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/addons/host.js': { file: 'addon-host.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/addons/host.css': { file: 'addon-host.css', contentType: 'text/css; charset=utf-8' },
};

interface RequestBody { readonly text: string; readonly bytes: number; }

function wizardTabLease(request: IncomingMessage): string {
  const value = request.headers['x-thsv-wizard-tab'];
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value) ? value.toLowerCase() : '';
}

async function readBody(request: IncomingMessage, maximumBytes: number): Promise<RequestBody> {
  const contentEncoding = (request.headers['content-encoding'] ?? 'identity').trim().toLowerCase();
  if (contentEncoding !== '' && contentEncoding !== 'identity') throw new UnsupportedContentEncodingError('Compressed request bodies are not accepted; send identity-encoded JSON.');
  const length = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(length) && length > maximumBytes) throw new PayloadTooLargeError(`Payload exceeds ${String(maximumBytes)} bytes`);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buffer.length;
    if (total > maximumBytes) throw new PayloadTooLargeError(`Payload exceeds ${String(maximumBytes)} bytes`);
    chunks.push(buffer);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), bytes: total };
}

const MAX_OVERLAY_ASSET_BYTES = 2_000_000;
const MAX_OVERLAY_VIDEO_ASSET_BYTES = 5_000_000;
const MAX_OVERLAY_VIDEO_PAYLOAD_BYTES = 7_000_000;
const MAX_OVERLAY_ASSET_FILES = 100;
const MAX_OVERLAY_ASSET_TOTAL_BYTES = 50_000_000;
let overlayAssetWriteChain: Promise<void> = Promise.resolve();

async function storeOverlayAsset(encoded: string, contentType: string, extension: string, directory: string, maxBytes: number = MAX_OVERLAY_ASSET_BYTES): Promise<{ filename: string; bytes: Buffer }> {
  if (encoded.length > Math.ceil(maxBytes / 3) * 4 || !isCanonicalBase64(encoded)) throw new OverlayAssetError('Overlay asset data is not valid canonical base64.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.length > maxBytes) throw new OverlayAssetError(`Overlay assets must be between 1 byte and ${String(Math.round(maxBytes / 1_000_000))} MB.`);
  if (!matchesDeclaredAssetType(bytes, contentType)) throw new OverlayAssetError('Overlay asset content does not match its declared media type.');
  const filename = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
  let release!: () => void;
  const previous = overlayAssetWriteChain;
  overlayAssetWriteChain = new Promise<void>((resolveWrite) => { release = resolveWrite; });
  await previous;
  try {
    await mkdir(directory, { recursive: true });
    const target = join(directory, filename);
    try { await stat(target); return { filename, bytes }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.(?:mp3|wav|ogg|png|jpg|webp|gif|mp4|webm)$/u.test(entry.name));
    if (entries.length >= MAX_OVERLAY_ASSET_FILES) throw new OverlayAssetError(`Overlay asset storage is limited to ${String(MAX_OVERLAY_ASSET_FILES)} files.`);
    const sizes = await Promise.all(entries.map(async (entry) => (await stat(join(directory, entry.name))).size));
    if (sizes.reduce((sum, size) => sum + size, 0) + bytes.length > MAX_OVERLAY_ASSET_TOTAL_BYTES) throw new OverlayAssetError('Overlay asset storage is limited to 50 MB.');
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
    return { filename, bytes };
  } finally { release(); }
}

function isCanonicalBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value);
}

function matchesDeclaredAssetType(bytes: Buffer, contentType: string): boolean {
  if (contentType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (contentType === 'image/gif') return bytes.length >= 6 && bytes.subarray(0, 4).toString('ascii') === 'GIF8' && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61;
  if (contentType === 'video/mp4') return bytes.length >= 8 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
  if (contentType === 'video/webm') return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (contentType === 'audio/wav' || contentType === 'audio/x-wav') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WAVE';
  if (contentType === 'audio/ogg') return bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii') === 'OggS';
  if (contentType === 'audio/mpeg') return bytes.length >= 3 && (bytes.subarray(0, 3).toString('ascii') === 'ID3' || (bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0));
  return false;
}

function isValidationError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && (error as Record<string, unknown>)['name'] === 'ZodError';
}

function isSameOriginUrl(origin: string, host: string | undefined): boolean {
  if (host === undefined) return false;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && url.host === host && url.username.length === 0 && url.password.length === 0;
  } catch { return false; }
}
