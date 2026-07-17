import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BridgeConfig } from '../../schemas/config.js';
import type { IngestResult } from '../core/bridge.js';
import { InvalidEventError, PayloadTooLargeError } from '../core/bridge.js';
import { OutputCapacityError, OutputUnavailableError } from '../core/delivery-manager.js';
import type { Logger } from './logger.js';
import { MutableRequestGuard, RequestGuardError } from './request-guard.js';
import type { BrowserOverlayHub } from './browser-overlay-hub.js';
import { z } from 'zod';
import { MAX_PROGRESSION_ADJUSTMENT, VIEWER_ID_PATTERN, ViewerProgressionUnavailableError, type ViewerProgressionAdjustment, type ViewerProgressionAdjustmentResult, type ViewerDeletionResult } from '../core/viewer-progression.js';
import { CompanionUnavailableError, type CompanionAdministrativeAction } from '../core/companion.js';

export interface DiagnosticsTarget {
  health(): Readonly<Record<string, unknown>>;
  readiness(): Readonly<Record<string, unknown>>;
  diagnostics(): Readonly<Record<string, unknown>>;
  simulate(input: unknown, byteLength?: number): Promise<IngestResult>;
  controlTimedActions(operation: 'start' | 'stop' | 'pause' | 'resume'): Promise<Readonly<Record<string, unknown>>>;
  adjustViewerProgression(input: ViewerProgressionAdjustment): Promise<ViewerProgressionAdjustmentResult>;
  deleteViewerProgression(viewerId: string, performedBy: string, reason: string): Promise<ViewerDeletionResult>;
  controlCompanion(input: CompanionAdministrativeAction): Promise<IngestResult>;
}

class AdministrativeRequestError extends Error {}

export class DiagnosticsServer {
  private server: Server | undefined;
  private readonly guard: MutableRequestGuard;

  public constructor(
    private readonly config: BridgeConfig['service'] & BridgeConfig['security'],
    private readonly target: DiagnosticsTarget,
    private readonly logger: Logger,
    controlToken: string,
    private readonly requestShutdown?: () => void,
    private readonly overlayHub?: BrowserOverlayHub,
  ) {
    this.guard = new MutableRequestGuard(controlToken, config.allowedOrigins, config.maxRequestsPerMinute, config.maxConcurrentRequests);
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
      if (request.method === 'GET' && request.url === '/health') return this.reply(response, 200, this.target.health());
      if (request.method === 'GET' && request.url === '/ready') {
        const readiness = this.target.readiness();
        return this.reply(response, readiness['ready'] === true ? 200 : 503, readiness);
      }
      if (request.method === 'GET' && request.url === '/diagnostics') return this.reply(response, 200, { ...this.target.diagnostics(), browserOverlay: this.overlayHub?.status() });
      if (request.method === 'GET' && request.url === '/overlay/config' && this.overlayHub !== undefined) {
        const companion = this.target.diagnostics()['companion'];
        const companionSleeping = companion !== null && typeof companion === 'object' && (companion as Record<string, unknown>)['sleeping'] === true;
        return this.reply(response, 200, { ...this.overlayHub.clientConfig(), companionSleeping });
      }
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
      if (request.method === 'POST' && request.url === '/viewer-progression/adjust') {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        const input = parseAdministrativeBody(viewerAdjustmentSchema, body.text);
        return this.reply(response, 200, { accepted: true, result: await this.target.adjustViewerProgression(input) });
      }
      if (request.method === 'POST' && request.url === '/companion/actions') {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        const input = parseAdministrativeBody(companionActionSchema, body.text);
        return this.reply(response, 202, await this.target.controlCompanion(input));
      }
      const deletionMatch = request.method === 'DELETE' ? /^\/viewer-progression\/viewers\/([a-z][a-z0-9-]{0,63})$/u.exec(request.url ?? '') : null;
      if (deletionMatch !== null) {
        release = this.guard.acquire(request, true);
        const body = await readBody(request, this.config.maxPayloadBytes);
        const input = parseAdministrativeBody(viewerDeletionSchema, body.text);
        return this.reply(response, 200, { accepted: true, result: await this.target.deleteViewerProgression(deletionMatch[1] ?? '', input.performedBy, input.reason) });
      }
      return this.reply(response, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof RequestGuardError) return this.reply(response, error.statusCode, { error: error.message });
      if (error instanceof AdministrativeRequestError) return this.reply(response, 400, { error: error.message });
      if (error instanceof ViewerProgressionUnavailableError) return this.reply(response, 409, { error: error.message });
      if (error instanceof CompanionUnavailableError) return this.reply(response, 409, { error: error.message });
      if (error instanceof PayloadTooLargeError) return this.reply(response, 413, { error: error.message });
      if (error instanceof InvalidEventError) return this.reply(response, 400, { error: error.message, details: error.details });
      if (error instanceof OutputCapacityError) return this.reply(response, 429, { error: error.message });
      if (error instanceof OutputUnavailableError) return this.reply(response, 503, { error: error.message });
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
    response.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; img-src 'self' https: data:");
    response.end(body);
  }
}

const operatorIdentifierSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9 ._@-]*$/u, 'performedBy contains unsupported characters');
const reasonSchema = z.string().trim().min(3).max(500);
const viewerAdjustmentSchema = z.object({
  viewerId: z.string().regex(VIEWER_ID_PATTERN),
  operation: z.enum(['add', 'remove', 'reset']),
  amount: z.number().int().min(1).max(MAX_PROGRESSION_ADJUSTMENT).optional(),
  performedBy: operatorIdentifierSchema,
  reason: reasonSchema,
}).strict().superRefine((value, context) => {
  if (value.operation === 'reset' && value.amount !== undefined) context.addIssue({ code: 'custom', path: ['amount'], message: 'reset must not include amount' });
  if (value.operation !== 'reset' && value.amount === undefined) context.addIssue({ code: 'custom', path: ['amount'], message: 'add and remove require amount' });
});
const viewerDeletionSchema = z.object({ performedBy: operatorIdentifierSchema, reason: reasonSchema }).strict();
const companionActionSchema = z.object({ action: z.enum(['wave', 'eat', 'sleep', 'wake', 'celebrate']), performedBy: operatorIdentifierSchema, reason: reasonSchema }).strict();

function parseAdministrativeBody<T>(schema: z.ZodType<T>, body: string): T {
  let input: unknown;
  try { input = JSON.parse(body) as unknown; }
  catch { throw new AdministrativeRequestError('Request body must be valid JSON.'); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AdministrativeRequestError(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; '));
  return parsed.data;
}

const OVERLAY_ASSETS: Readonly<Record<string, { readonly file: string; readonly contentType: string }>> = {
  '/overlay': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/overlay/': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/overlay/chat': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/overlay/alerts': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/overlay/companion': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/overlay/app.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-0.9.5.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-0.9.6.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-0.9.8.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-0.9.9.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.0.0.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/app-1.1.0.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-0.9.8.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-0.9.9.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-1.0.0.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/worker-1.1.0.js': { file: 'worker.js', contentType: 'text/javascript; charset=utf-8' },
  '/overlay/styles.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.5.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.6.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.8.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-0.9.9.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.0.0.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/styles-1.1.0.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/overlay/bloom-sprite-1.0.0.png': { file: 'bloom-wave-sprite.png', contentType: 'image/png' },
  '/overlay/bloom-idle-sprite-1.1.0.png': { file: 'bloom-idle-sprite.png', contentType: 'image/png' },
  '/overlay/bloom-wave-sprite-1.1.0.png': { file: 'bloom-wave-v2-sprite.png', contentType: 'image/png' },
  '/overlay/bloom-eat-sprite-1.1.0.png': { file: 'bloom-eat-sprite.png', contentType: 'image/png' },
  '/overlay/bloom-sleep-sprite-1.1.0.png': { file: 'bloom-sleep-sprite.png', contentType: 'image/png' },
  '/overlay/bloom-celebrate-sprite-1.1.0.png': { file: 'bloom-celebrate-sprite.png', contentType: 'image/png' },
};

interface RequestBody { readonly text: string; readonly bytes: number; }

async function readBody(request: IncomingMessage, maximumBytes: number): Promise<RequestBody> {
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

function isValidationError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && (error as Record<string, unknown>)['name'] === 'ZodError';
}
