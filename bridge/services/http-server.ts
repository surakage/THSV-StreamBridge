import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { BridgeConfig } from '../../schemas/config.js';
import type { IngestResult } from '../core/bridge.js';
import { InvalidEventError, PayloadTooLargeError } from '../core/bridge.js';
import { OutputCapacityError, OutputUnavailableError } from '../core/delivery-manager.js';
import type { Logger } from './logger.js';
import { MutableRequestGuard, RequestGuardError } from './request-guard.js';

export interface DiagnosticsTarget {
  health(): Readonly<Record<string, unknown>>;
  readiness(): Readonly<Record<string, unknown>>;
  diagnostics(): Readonly<Record<string, unknown>>;
  simulate(input: unknown, byteLength?: number): Promise<IngestResult>;
  controlTimedActions(operation: 'start' | 'stop' | 'pause' | 'resume'): Promise<Readonly<Record<string, unknown>>>;
}

export class DiagnosticsServer {
  private server: Server | undefined;
  private readonly guard: MutableRequestGuard;

  public constructor(
    private readonly config: BridgeConfig['service'] & BridgeConfig['security'],
    private readonly target: DiagnosticsTarget,
    private readonly logger: Logger,
    controlToken: string,
    private readonly requestShutdown?: () => void,
  ) {
    this.guard = new MutableRequestGuard(controlToken, config.allowedOrigins, config.maxRequestsPerMinute, config.maxConcurrentRequests);
  }

  public async start(): Promise<void> {
    if (this.server !== undefined) return;
    const server = createServer((request, response) => void this.route(request, response));
    this.server = server;
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
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }

  public get port(): number {
    const address = this.server?.address();
    return typeof address === 'object' && address !== null ? address.port : this.config.port;
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.setSecurityHeaders(response);
    let release: (() => void) | undefined;
    try {
      if (request.method === 'GET' && request.url === '/health') return this.reply(response, 200, this.target.health());
      if (request.method === 'GET' && request.url === '/ready') {
        const readiness = this.target.readiness();
        return this.reply(response, readiness['ready'] === true ? 200 : 503, readiness);
      }
      if (request.method === 'GET' && request.url === '/diagnostics') return this.reply(response, 200, this.target.diagnostics());
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
      return this.reply(response, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof RequestGuardError) return this.reply(response, error.statusCode, { error: error.message });
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
}

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
