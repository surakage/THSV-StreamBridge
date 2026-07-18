import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { BrowserOverlayConfig } from '../../schemas/config.js';
import { BROWSER_OVERLAY_CONTRACT_VERSION, projectBrowserOverlayEvent } from '../core/browser-overlay.js';
import type { Logger } from './logger.js';

export class BrowserOverlayHub {
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });
  private attachedServer: Server | undefined;
  private published = 0;
  private readonly upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (request.url !== '/overlay/events' || !isLoopback(request.socket.remoteAddress)) { socket.destroy(); return; }
    this.sockets.handleUpgrade(request, socket, head, (client) => this.sockets.emit('connection', client, request));
  };

  public constructor(private readonly logger: Logger, private readonly config: BrowserOverlayConfig) {
    this.sockets.on('connection', (socket) => {
      socket.send(JSON.stringify({ contractVersion: BROWSER_OVERLAY_CONTRACT_VERSION, kind: 'hub.ready', emittedAt: new Date().toISOString() }));
      this.logger.info('Browser overlay client connected', { clients: this.sockets.clients.size });
      socket.on('close', () => this.logger.info('Browser overlay client disconnected', { clients: this.sockets.clients.size }));
    });
  }

  public attach(server: Server): void {
    if (this.attachedServer === server) return;
    if (this.attachedServer !== undefined) throw new Error('Browser overlay hub is already attached');
    this.attachedServer = server;
    server.on('upgrade', this.upgrade);
  }

  public publish(event: NormalizedEvent): void {
    if (!this.config.enabled || (!this.config.showSimulated && event.metadata.simulated) || (!this.config.showBots && event.eventType === 'chat.message' && event.user?.actorType === 'bot')) return;
    const overlayEvent = projectBrowserOverlayEvent(event, this.config);
    if (overlayEvent === undefined) return;
    const message = JSON.stringify(overlayEvent);
    for (const socket of this.sockets.clients) if (socket.readyState === WebSocket.OPEN) socket.send(message);
    this.published += 1;
  }

  public status(): Readonly<Record<string, unknown>> { return { enabled: this.config.enabled, clients: this.sockets.clients.size, published: this.published }; }
  public clientConfig(): BrowserOverlayConfig { return { ...this.config }; }

  public stop(): void {
    if (this.attachedServer !== undefined) this.attachedServer.off('upgrade', this.upgrade);
    this.attachedServer = undefined;
    for (const socket of this.sockets.clients) socket.close(1001, 'Bridge stopping');
    this.sockets.close();
  }
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
