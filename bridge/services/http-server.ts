import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { BridgeConfig } from '../../schemas/config.js';
import type { StreamBridge } from '../core/bridge.js';
import { InvalidEventError, PayloadTooLargeError } from '../core/bridge.js';
import type { Logger } from './logger.js';

export class DiagnosticsServer {
  private server: Server | undefined;

  public constructor(
    private readonly config: BridgeConfig['service'] & BridgeConfig['security'],
    private readonly bridge: StreamBridge,
    private readonly logger: Logger,
    private readonly requestShutdown?: () => void,
  ) {}

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
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    try {
      if (request.method === 'GET' && request.url === '/health') return this.reply(response, 200, this.bridge.health());
      if (request.method === 'GET' && request.url === '/ready') {
        const readiness = this.bridge.readiness();
        return this.reply(response, readiness['ready'] === true ? 200 : 503, readiness);
      }
      if (request.method === 'GET' && request.url === '/diagnostics') return this.reply(response, 200, this.bridge.diagnostics());
      if (request.method === 'POST' && request.url === '/shutdown' && this.requestShutdown !== undefined && isLoopback(request.socket.remoteAddress)) {
        this.reply(response, 202, { accepted: true });
        setImmediate(this.requestShutdown);
        return;
      }
      if (request.method === 'POST' && request.url === '/simulate') {
        const body = await readBody(request, this.config.maxPayloadBytes);
        const input = JSON.parse(body) as unknown;
        const result = await this.bridge.mockAdapter.simulate(input).then(() => ({ accepted: true }));
        return this.reply(response, 202, result);
      }
      return this.reply(response, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof PayloadTooLargeError) return this.reply(response, 413, { error: error.message });
      if (error instanceof InvalidEventError) return this.reply(response, 400, { error: error.message, details: error.details });
      if (error instanceof SyntaxError) return this.reply(response, 400, { error: 'Request body is not valid JSON' });
      this.logger.error('HTTP request failed', { method: request.method, url: request.url, error });
      return this.reply(response, 500, { error: 'Internal bridge error' });
    }
  }

  private reply(response: ServerResponse, status: number, body: unknown): void {
    response.statusCode = status;
    response.end(`${JSON.stringify(body)}\n`);
  }
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

async function readBody(request: IncomingMessage, maximumBytes: number): Promise<string> {
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
  return Buffer.concat(chunks).toString('utf8');
}
