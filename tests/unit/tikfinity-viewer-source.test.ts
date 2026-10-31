import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { TikFinityViewerSource, parseTikFinityViewerMessage } from '../../bridge/services/tikfinity-viewer-source.js';
import { StreamerBotEventRelay } from '../../bridge/adapters/streamerbot-event-relay.js';
import type { BrowserOverlayHub } from '../../bridge/services/browser-overlay-hub.js';
import { ViewerCountService } from '../../bridge/services/viewer-count-service.js';

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('TikFinity viewer count', () => {
  it('reads the TikTok LIVE viewer count and the end of the LIVE from TikFinity events', () => {
    expect(parseTikFinityViewerMessage({ event: 'roomUser', data: { viewerCount: 128, topViewers: [] } })).toEqual({ viewers: 128 });
    expect(parseTikFinityViewerMessage({ event: 'roomUserSeq', data: { viewerCount: '64' } })).toEqual({ viewers: 64 });
    expect(parseTikFinityViewerMessage({ event: 'streamEnd', data: {} })).toEqual({ ended: true });
    expect(parseTikFinityViewerMessage({ event: 'chat', data: { viewerCount: 5 } })).toBeUndefined();
    expect(parseTikFinityViewerMessage({ event: 'roomUser', data: { viewerCount: -1 } })).toBeUndefined();
    expect(parseTikFinityViewerMessage({ event: 'state_update', state: {} })).toBeUndefined();
  });

  it('listens to the local Event API without sending anything and reports counts', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening');
    const address = server.address(); if (typeof address === 'string' || address === null) throw new Error('TikFinity test server did not bind.');
    const sent: string[] = [];
    server.on('connection', (socket) => {
      socket.on('message', (raw) => sent.push(Buffer.isBuffer(raw) ? raw.toString('utf8') : 'binary'));
      socket.send(JSON.stringify({ event: 'config', data: { events: [] } }));
      socket.send(JSON.stringify({ event: 'roomUser', data: { viewerCount: 42 } }));
      socket.send(JSON.stringify({ event: 'streamEnd', data: {} }));
    });
    const reports: Array<number | undefined> = [];
    const source = new TikFinityViewerSource((viewers) => reports.push(viewers), silent, `ws://127.0.0.1:${String(address.port)}`);
    source.start();
    await vi.waitFor(() => expect(reports).toEqual([42, undefined]));
    expect(source.status()).toMatchObject({ listening: true, connected: true });
    expect(sent).toEqual([]);
    source.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('adds TikTok and Facebook counts to the viewer counter and drops them when they end', () => {
    const publishViewerCounts = vi.fn();
    const service = new ViewerCountService({ publishViewerCounts } as unknown as BrowserOverlayHub, new StreamerBotEventRelay(), silent);
    service.report('tiktok', 64); service.report('facebook', 12); service.report('facebook', 12);
    expect(publishViewerCounts).toHaveBeenCalledTimes(2);
    expect(publishViewerCounts).toHaveBeenLastCalledWith({ total: 76, platforms: { tiktok: 64, facebook: 12 } });
    service.report('tiktok', undefined);
    expect(publishViewerCounts).toHaveBeenLastCalledWith({ total: 12, platforms: { facebook: 12 } });
    service.report('facebook', 1.5);
    expect(service.snapshot().total).toBe(12);
  });
});
