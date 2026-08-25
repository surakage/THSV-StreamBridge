import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { MeldDirectSceneClient, StreamlabsDirectSceneClient, parseMeldSceneSnapshot, parseStreamlabsSceneSnapshot } from '../../bridge/services/direct-broadcast-scene-clients.js';

describe('direct broadcast scene clients', () => {
  it('extracts ordered Meld scenes and the current scene from the Qt WebChannel session property', () => {
    const result = parseMeldSceneSnapshot({ meld: { properties: [[0, 'version', null, 2], [1, 'session', [1, 4], { items: { b: { type: 'scene', index: 1, name: 'BRB', current: true }, a: { type: 'scene', index: 0, name: 'Starting Soon', current: false }, layer: { type: 'layer', name: 'Camera' } } }]] } });
    expect(result).toMatchObject({ scenes: ['Starting Soon', 'BRB'], currentScene: 'BRB', connectionName: 'Meld Studio WebSocket (direct)' });
  });

  it('extracts Streamlabs Desktop scenes and resolves the active scene id', () => {
    const result = parseStreamlabsSceneSnapshot([{ id: 'one', name: 'Live' }, { id: 'two', name: 'Ending' }], 'two');
    expect(result).toMatchObject({ scenes: ['Live', 'Ending'], currentScene: 'Ending', connectionName: 'Streamlabs Desktop Remote Control (direct)' });
  });

  it('fails closed on empty vendor responses', () => {
    expect(() => parseMeldSceneSnapshot({ meld: { properties: [] } })).toThrow('returned no scene entries');
    expect(() => parseStreamlabsSceneSnapshot([], '')).toThrow('returned no scene entries');
  });

  it('replays the sanitized Meld WebChannel capture and receives a persistent change signal', async () => {
    const capture = JSON.parse(await readFile('tests/fixtures/broadcast-vendors/meld-session.json', 'utf8')) as unknown;
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening');
    const address = server.address(); if (typeof address === 'string' || address === null) throw new Error('Meld replay server did not bind.');
    server.on('connection', (socket) => socket.on('message', (raw) => { const request = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw as ArrayBuffer).toString('utf8')) as { type?: number; id?: number }; if (request.type === 3) socket.send(JSON.stringify({ type: 10, id: request.id, data: capture })); if (request.type === 4) setTimeout(() => socket.send(JSON.stringify({ type: 1, object: 'meld', signal: 4 })), 10); }));
    const client = new MeldDirectSceneClient(`ws://127.0.0.1:${String(address.port)}`, 1_000);
    await expect(client.getSceneList()).resolves.toMatchObject({ scenes: ['Starting Soon', 'Live'], currentScene: 'Live' });
    const controller = new AbortController(); const changed = vi.fn(() => controller.abort());
    await client.watchChanges(changed, controller.signal); expect(changed).toHaveBeenCalled();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('replays the sanitized Streamlabs SockJS capture and receives a persistent scene event', async () => {
    const capture = JSON.parse(await readFile('tests/fixtures/broadcast-vendors/streamlabs-scenes.json', 'utf8')) as { scenes: unknown; activeSceneId: unknown };
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening');
    const address = server.address(); if (typeof address === 'string' || address === null) throw new Error('Streamlabs replay server did not bind.');
    server.on('connection', (socket) => { socket.send('o'); let subscriptions = 0; socket.on('message', (raw) => { const request = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw as ArrayBuffer).toString('utf8')) as { id: number; method: string }; const result = request.method === 'getScenes' ? capture.scenes : request.method === 'activeSceneId' ? capture.activeSceneId : {}; socket.send(`a${JSON.stringify([JSON.stringify({ jsonrpc: '2.0', id: request.id, result })])}`); if (['sceneSwitched', 'sceneAdded', 'sceneRemoved'].includes(request.method) && ++subscriptions === 3) setTimeout(() => socket.send(`a${JSON.stringify([JSON.stringify({ result: { _type: 'EVENT', emitter: 'STREAM' } })])}`), 10); }); });
    const client = new StreamlabsDirectSceneClient(`ws://127.0.0.1:${String(address.port)}/api/websocket`, 'token', 1_000);
    await expect(client.getSceneList()).resolves.toMatchObject({ scenes: ['Starting Soon', 'Live'], currentScene: 'Live' });
    const controller = new AbortController(); const changed = vi.fn(() => controller.abort());
    await client.watchChanges(changed, controller.signal); expect(changed).toHaveBeenCalled();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
