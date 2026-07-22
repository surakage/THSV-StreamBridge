import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
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

export interface DiagnosticsTarget {
  health(): Readonly<Record<string, unknown>>;
  readiness(): Readonly<Record<string, unknown>>;
  diagnostics(): Readonly<Record<string, unknown>>;
  simulate(input: unknown, byteLength?: number): Promise<IngestResult>;
  controlTimedActions(operation: 'start' | 'stop' | 'pause' | 'resume'): Promise<Readonly<Record<string, unknown>>>;
  testTimedAction?(id: string): Promise<Readonly<Record<string, unknown>>>;
}

class UnsupportedContentEncodingError extends Error {}
class OverlayAssetError extends Error {}

export class DiagnosticsServer {
  private server: Server | undefined;
  private readonly guard: MutableRequestGuard;
  private readonly overlayAssetDirectory: string;

  public constructor(
    private readonly config: BridgeConfig['service'] & BridgeConfig['security'],
    private readonly target: DiagnosticsTarget,
    private readonly logger: Logger,
    controlToken: string,
    private readonly requestShutdown?: () => void,
    private readonly overlayHub?: BrowserOverlayHub,
    private readonly wizard?: WizardService,
    dataRoot = 'data',
  ) {
    this.guard = new MutableRequestGuard(controlToken, config.allowedOrigins, config.maxRequestsPerMinute, config.maxConcurrentRequests);
    // Must be derived from the configured data root, not a bare relative literal: the portable
    // Windows installer runs the bridge with its working directory inside the versioned, disposable
    // app/<version>/ folder, which is deleted on every upgrade. Anything meant to outlive an upgrade
    // has to be anchored to dataRoot, the one directory the installer promises to preserve.
    this.overlayAssetDirectory = join(dataRoot, 'runtime', 'overlay-assets');
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
        return this.reply(response, readiness['ready'] === true ? 200 : 503, readiness);
      }
      if (request.method === 'GET' && request.url === '/diagnostics') {
        this.guard.assertLoopback(request);
        return this.reply(response, 200, { ...this.target.diagnostics(), browserOverlay: this.overlayHub?.status() });
      }
      if (request.method === 'GET' && request.url === '/overlay/config' && this.overlayHub !== undefined) {
        this.guard.assertLoopback(request);
        return this.reply(response, 200, this.overlayHub.clientConfig());
      }
      if (request.method === 'GET' && requestPath !== undefined && ['/overlay/addons/host.js', '/overlay/addons/host.css'].includes(requestPath)) return await this.overlayAsset(response, requestPath);
      const addOnOverlayMatch = request.method === 'GET' ? /^\/overlay\/addons\/([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+)$/u.exec(requestPath ?? '') : null;
      if (addOnOverlayMatch?.[1] !== undefined && this.overlayHub !== undefined && this.wizard !== undefined) {
        this.guard.assertLoopback(request);
        const addOn = (await this.wizard.listAddOns()).find((candidate) => candidate.moduleId === addOnOverlayMatch[1]);
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
      if (request.method === 'POST' && request.url === '/wizard/api/transactions' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 201, await this.wizard.beginTransaction());
      }
      const stageMatch = request.method === 'POST' ? /^\/wizard\/api\/transactions\/([0-9a-f-]+)\/stage$/u.exec(request.url ?? '') : null;
      if (stageMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, this.wizard.stageTransaction(stageMatch[1], JSON.parse(body.text) as unknown));
      }
      const importMatch = request.method === 'POST' ? /^\/wizard\/api\/transactions\/([0-9a-f-]+)\/import$/u.exec(request.url ?? '') : null;
      if (importMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, this.wizard.stageImport(importMatch[1], JSON.parse(body.text) as unknown));
      }
      const commitMatch = request.method === 'POST' ? /^\/wizard\/api\/transactions\/([0-9a-f-]+)\/commit$/u.exec(request.url ?? '') : null;
      if (commitMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.commitTransaction(commitMatch[1]));
      }
      const cancelMatch = request.method === 'POST' ? /^\/wizard\/api\/transactions\/([0-9a-f-]+)\/cancel$/u.exec(request.url ?? '') : null;
      if (cancelMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, this.wizard.cancelTransaction(cancelMatch[1]));
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
      if (request.method === 'GET' && request.url === '/wizard/api/configuration/export' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.exportConfiguration());
      }
      if (request.method === 'GET' && request.url === '/wizard/api/addons' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, { addOns: await this.wizard.listAddOns(), discovered: await this.wizard.discoverAddOns() });
      }
      if (request.method === 'POST' && request.url === '/wizard/api/updates/check' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.checkForUpdates());
      }
      if (request.method === 'POST' && request.url === '/wizard/api/addons/updates/check' && this.wizard !== undefined) {
        release = this.guard.acquire(request, false);
        return this.reply(response, 200, await this.wizard.checkForAddOnUpdates());
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
      const addOnEnabledMatch = request.method === 'POST' ? /^\/wizard\/api\/addons\/([^/]+)\/enabled$/u.exec(request.url ?? '') : null;
      if (addOnEnabledMatch?.[1] !== undefined && this.wizard !== undefined) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        return this.reply(response, 200, await this.wizard.setAddOnEnabled(decodeURIComponent(addOnEnabledMatch[1]), JSON.parse(body.text) as unknown));
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
        const moduleId = decodeURIComponent(addOnOverlayPreviewMatch[1]);
        const addOn = (await this.wizard.listAddOns()).find((candidate) => candidate.moduleId === moduleId);
        if (!this.overlayHub.clientConfig().enabled || addOn === undefined || addOn.health !== 'installed' || !addOn.enabled || !addOn.permissions.includes('overlay.publish')) return this.reply(response, 404, { error: 'Enabled add-on overlay not found' });
        this.overlayHub.publishAddOn(moduleId, `${moduleId}.card.show`, { title: addOn.name, text: 'Overlay connection and scoped publication are working.', durationMs: 5_000, preview: true });
        return this.reply(response, 202, { accepted: true, simulated: true, moduleId, topic: `${moduleId}.card.show` });
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
      if (error instanceof PayloadTooLargeError) return this.reply(response, 413, { error: error.message });
      if (error instanceof InvalidEventError) return this.reply(response, 400, { error: error.message, details: error.details });
      if (error instanceof UnknownTimedActionError) return this.reply(response, 409, { error: error.message });
      if (error instanceof OutputCapacityError) return this.reply(response, 429, { error: error.message });
      if (error instanceof OutputUnavailableError) return this.reply(response, 503, { error: error.message });
      if (error instanceof UnsupportedContentEncodingError) return this.reply(response, 415, { error: error.message });
      if (error instanceof OverlayAssetError) return this.reply(response, 400, { error: error.message });
      if (error instanceof SyntaxError || isValidationError(error)) return this.reply(response, 400, { error: 'Request body is not a valid normalized event' });
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

  private reply(response: ServerResponse, status: number, body: unknown): void {
    response.statusCode = status;
    response.end(`${JSON.stringify(body)}\n`);
  }

  private async overlayAsset(response: ServerResponse, url: string): Promise<void> {
    const asset = OVERLAY_ASSETS[url];
    if (asset === undefined) return this.reply(response, 404, { error: 'Not found' });
    const body = await readFile(resolve(process.cwd(), 'overlays', 'browser', asset.file));
    response.statusCode = 200;
    response.setHeader('content-type', asset.contentType);
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; img-src 'self' https: data:; media-src 'self'");
    response.end(body);
  }

  private async addOnOverlayAsset(response: ServerResponse, file: string): Promise<void> {
    const body = await readFile(resolve(process.cwd(), 'overlays', 'browser', file));
    response.statusCode = 200;
    response.setHeader('content-type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; img-src 'self' https: data:; media-src 'self' https:; base-uri 'none'; form-action 'none'");
    response.end(body);
  }

  private async wizardAsset(response: ServerResponse, url: string): Promise<void> {
    const asset = WIZARD_ASSETS[url];
    if (asset === undefined) return this.reply(response, 404, { error: 'Not found' });
    const body = await readFile(resolve(process.cwd(), 'wizard', 'browser', asset.file));
    response.statusCode = 200;
    response.setHeader('content-type', asset.contentType);
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.end(body);
  }
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
  '/overlay/app-1.4.0.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/alert-queue-1.2.2.js': { file: 'alert-queue.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-0.9.8.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-0.9.9.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-1.0.0.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-1.1.0.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-1.2.1.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-1.3.1.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/styles.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.5.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.6.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.8.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.9.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.0.0.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.1.0.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.1.1.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.2.1.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.3.0.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/addons/host.js': { file: 'addon-host.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/addons/host.css': { file: 'addon-host.css', contentType: 'text/css; charset=utf-8' },
};

interface RequestBody { readonly text: string; readonly bytes: number; }

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
