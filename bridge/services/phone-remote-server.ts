import { readFile } from 'node:fs/promises';
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import type { HostedPagesService } from './hosted-pages-service.js';
import type { Logger } from './logger.js';

// Phone Control Panel: an optional second listener on the home network, so a phone on the same Wi-Fi can use the
// Control Panel. It is off until the creator turns it on, and it serves nothing but the Control Panel page and the
// four Control Panel calls. Every call needs the key of a phone paired with a one-time code shown on this PC; the
// listener swaps that key for the control token itself, so the token never leaves this PC.

export const PHONE_REMOTE_PORT_OFFSET = 1;
const MAXIMUM_BODY_BYTES = 64 * 1024;

/** Files a phone may load. Everything else, including the Wizard, stays on this PC only. */
const STATIC_FILES: Readonly<Record<string, { readonly file: string; readonly type: string }>> = {
  '/wizard/control-panel.js': { file: 'control-panel.js', type: 'text/javascript; charset=utf-8' },
  '/wizard/control-panel.css': { file: 'control-panel.css', type: 'text/css; charset=utf-8' },
  '/wizard/stream-info.css': { file: 'stream-info.css', type: 'text/css; charset=utf-8' },
  '/wizard/page-theme.js': { file: 'page-theme.js', type: 'text/javascript; charset=utf-8' },
  '/wizard/i18n.js': { file: 'i18n.js', type: 'text/javascript; charset=utf-8' },
  '/wizard/phone.js': { file: 'phone.js', type: 'text/javascript; charset=utf-8' },
  '/wizard/phone-icon.svg': { file: 'phone-icon.svg', type: 'image/svg+xml' },
  ...Object.fromEntries(['es', 'de', 'fr', 'it', 'pt-BR', 'ja', 'ko', 'zh-CN'].map((code) => [`/wizard/i18n/${code}.js`, { file: `i18n/${code}.js`, type: 'text/javascript; charset=utf-8' }])),
};

/** The only Bridge calls a paired phone can make. */
const FORWARDED: Readonly<Record<string, readonly string[]>> = {
  '/wizard/api/control-panel': ['GET'],
  '/wizard/api/control-panel/status': ['POST'],
  '/wizard/api/control-panel/action': ['POST'],
  '/wizard/api/control-panel/settings': ['PUT'],
};

const MANIFEST = JSON.stringify({
  name: 'StreamBridge Control Panel', short_name: 'StreamBridge', start_url: '/', scope: '/', display: 'standalone',
  background_color: '#121a14', theme_color: '#121a14', icons: [{ src: '/wizard/phone-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
});

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' https: data:; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

export interface PhoneRemoteOptions {
  readonly devices: HostedPagesService;
  readonly port: number;
  readonly bridgePort: number;
  readonly controlToken: string;
  readonly logger: Logger;
  readonly wizardDirectory?: string;
}

export class PhoneRemoteServer {
  private server: Server | undefined;

  public constructor(private readonly options: PhoneRemoteOptions) {}

  public get running(): boolean { return this.server?.listening === true; }

  /** Addresses a phone on the same network can open. */
  public addresses(): readonly string[] {
    const urls: string[] = [];
    for (const entries of Object.values(networkInterfaces())) {
      for (const entry of entries ?? []) if (entry.family === 'IPv4' && !entry.internal && isPrivateAddress(entry.address)) urls.push(`http://${entry.address}:${String(this.options.port)}/`);
    }
    return urls.slice(0, 4);
  }

  public async start(): Promise<void> {
    if (this.server !== undefined) return;
    const server = createServer((request, response) => { void this.handle(request, response); });
    await new Promise<void>((resolveStart, rejectStart) => {
      server.once('error', rejectStart);
      server.listen(this.options.port, '0.0.0.0', () => { server.off('error', rejectStart); resolveStart(); });
    });
    this.server = server;
    this.options.logger.info('Phone Control Panel is listening on the home network', { port: this.options.port });
  }

  public async stop(): Promise<void> {
    const server = this.server; this.server = undefined;
    if (server === undefined) return;
    server.closeAllConnections();
    await new Promise<void>((resolveStop) => { server.close(() => resolveStop()); });
    this.options.logger.info('Phone Control Panel stopped listening');
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
      // Only private home-network addresses, never the internet, even if a router forwards the port.
      if (!isPrivateAddress(stripMapped(request.socket.remoteAddress ?? ''))) return this.send(response, 403, 'application/json', JSON.stringify({ error: 'Only devices on your home network can open this.' }));
      // Opened by address only (http://192.168.x.x:port/), so a web page under another name can never reach it.
      if (!isAddressHost(request.headers.host)) return this.send(response, 421, 'application/json', JSON.stringify({ error: 'Open the Phone Control Panel by the address StreamBridge shows on your PC.' }));
      const path = new URL(request.url ?? '/', 'http://phone.invalid').pathname;
      const origin = request.headers.origin;
      if (origin !== undefined && origin !== `http://${request.headers.host ?? ''}`) return this.send(response, 403, 'application/json', JSON.stringify({ error: 'Browser origin is not allowed' }));
      if (request.method === 'GET' && (path === '/' || path === '/panel')) return this.send(response, 200, 'text/html; charset=utf-8', await this.page());
      if (request.method === 'GET' && path === '/manifest.webmanifest') return this.send(response, 200, 'application/manifest+json', MANIFEST);
      const asset = STATIC_FILES[path];
      if (request.method === 'GET' && asset !== undefined) return this.send(response, 200, asset.type, await readFile(resolve(this.wizardDirectory(), asset.file)));
      if (request.method === 'POST' && path === '/phone/pair') {
        const body = await readBody(request, 512);
        try { return this.send(response, 201, 'application/json', JSON.stringify(await this.options.devices.pair(JSON.parse(body.toString('utf8')) as unknown))); }
        catch (error) { const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number' ? (error as { statusCode: number }).statusCode : 400; return this.send(response, statusCode, 'application/json', JSON.stringify({ error: error instanceof Error ? error.message : 'Pairing failed.' })); }
      }
      const methods = FORWARDED[path];
      if (methods === undefined) return this.send(response, 404, 'application/json', JSON.stringify({ error: 'Not found' }));
      if (!methods.includes(request.method ?? '')) return this.send(response, 405, 'application/json', JSON.stringify({ error: 'Method not allowed' }));
      if (!this.options.devices.authorizes(request.headers.authorization)) return this.send(response, 401, 'application/json', JSON.stringify({ error: 'This phone is not paired any more. Pair it again from StreamBridge on your PC.' }));
      await this.forward(request, response, path, await readBody(request, MAXIMUM_BODY_BYTES));
    } catch (error) {
      this.options.logger.warn('Phone Control Panel request failed', { error });
      if (!response.headersSent) this.send(response, 500, 'application/json', JSON.stringify({ error: 'StreamBridge could not answer. Try again.' }));
    }
  }

  private wizardDirectory(): string { return this.options.wizardDirectory ?? resolve(process.cwd(), 'wizard', 'browser'); }

  private async page(): Promise<string> {
    const html = await readFile(resolve(this.wizardDirectory(), 'control-panel.html'), 'utf8');
    return html
      .replace('</title>', '</title><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#121a14"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><link rel="icon" href="/wizard/phone-icon.svg">')
      .replace('<script src="/wizard/control-panel.js">', '<script src="/wizard/phone.js"></script><script src="/wizard/control-panel.js">')
      .replace('<html', '<html data-phone="1"');
  }

  private async forward(request: IncomingMessage, response: ServerResponse, path: string, body: Buffer): Promise<void> {
    await new Promise<void>((resolveForward) => {
      const tab = request.headers['x-thsv-wizard-tab'];
      const outgoing = httpRequest({
        host: '127.0.0.1', port: this.options.bridgePort, path, method: request.method,
        headers: { authorization: `Bearer ${this.options.controlToken}`, ...(typeof tab === 'string' ? { 'x-thsv-wizard-tab': tab } : {}), ...(body.length > 0 ? { 'content-type': 'application/json', 'content-length': String(body.length) } : {}) },
      }, (answer) => {
        const chunks: Buffer[] = [];
        answer.on('data', (chunk: Buffer) => chunks.push(chunk));
        answer.on('end', () => { this.send(response, answer.statusCode ?? 502, 'application/json', Buffer.concat(chunks)); resolveForward(); });
        answer.on('error', () => { this.send(response, 502, 'application/json', JSON.stringify({ error: 'StreamBridge could not answer. Try again.' })); resolveForward(); });
      });
      outgoing.on('error', () => { this.send(response, 502, 'application/json', JSON.stringify({ error: 'StreamBridge could not answer. Try again.' })); resolveForward(); });
      outgoing.end(body);
    });
  }

  private send(response: ServerResponse, statusCode: number, type: string, body: string | Buffer): void {
    if (response.headersSent) return;
    response.statusCode = statusCode;
    response.setHeader('content-type', type);
    response.end(body);
  }
}

function isAddressHost(host: string | undefined): boolean {
  if (host === undefined) return false;
  const name = host.replace(/:\d{1,5}$/u, '');
  return name === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(name);
}

function stripMapped(address: string): string { return address.startsWith('::ffff:') ? address.slice(7) : address; }

/** Home-network addresses: 10/8, 172.16/12, 192.168/16, and this PC itself. */
export function isPrivateAddress(address: string): boolean {
  if (address === '127.0.0.1' || address === '::1') return true;
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer; size += buffer.length;
    if (size > limit) throw new Error('Request is too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export interface PhoneRemoteStatus {
  readonly enabled: boolean;
  readonly listening: boolean;
  readonly port: number;
  readonly addresses: readonly string[];
  readonly phones: readonly { readonly id: string; readonly name: string; readonly pairedAt: string }[];
  readonly problem?: string;
}

/** The Phone Control Panel switch: the paired phones plus the home-network listener, which runs only while it is on. */
export class PhoneRemoteService {
  private problem: string | undefined;

  public constructor(private readonly devices: HostedPagesService, private readonly server: PhoneRemoteServer, private readonly port: number, private readonly logger: Logger) {}

  public async start(): Promise<void> {
    await this.devices.start();
    if (this.devices.status().enabled) await this.listen();
  }

  public async stop(): Promise<void> {
    await this.server.stop();
    await this.devices.flush();
  }

  public status(): PhoneRemoteStatus {
    const devices = this.devices.status();
    return {
      enabled: devices.enabled, listening: this.server.running, port: this.port,
      addresses: this.server.running ? this.server.addresses() : [],
      phones: devices.browsers,
      ...(this.problem === undefined ? {} : { problem: this.problem }),
    };
  }

  public async setEnabled(enabled: boolean): Promise<PhoneRemoteStatus> {
    await this.devices.setEnabled(enabled);
    if (enabled) await this.listen();
    else { this.problem = undefined; await this.server.stop(); }
    return this.status();
  }

  public createCode(): { readonly code: string; readonly expiresInSeconds: number } { return this.devices.createCode(); }

  public async unpair(id: string): Promise<PhoneRemoteStatus> { await this.devices.unpair(id); return this.status(); }

  private async listen(): Promise<void> {
    try { await this.server.start(); this.problem = undefined; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      this.problem = code === 'EADDRINUSE' ? `Port ${String(this.port)} is already in use by another program, so phones cannot connect.` : 'Phones cannot connect right now. Try turning it off and on again.';
      this.logger.warn('Phone Control Panel could not listen on the home network', { port: this.port, error });
    }
  }
}
