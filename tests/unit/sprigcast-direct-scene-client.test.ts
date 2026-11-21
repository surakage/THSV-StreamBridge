import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { SprigCastDirectSceneClient, parseSprigCastBlooms, parseSprigCastConnectionFile, sprigcastAnswers, sprigcastAuthentication, sprigcastConnectMessage, findSprigCastUrl, sprigcastLiveUrl, sprigcastMessages, sprigcastPair } from '../../bridge/services/sprigcast-direct-scene-client.js';
import { BroadcastConnectionVaultService } from '../../bridge/services/broadcast-connection-vault-service.js';

type Handler = (action: string, message: Record<string, unknown>) => unknown;
const servers: WebSocketServer[] = [];

/** A tiny stand-in for SprigCast's own API at /sprigcast. */
async function fakeSprigCast(handle: Handler, password = ''): Promise<{ url: string; asked: Array<Record<string, unknown>>; greetings: Array<Record<string, unknown>> }> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const asked: Array<Record<string, unknown>> = []; const greetings: Array<Record<string, unknown>> = [];
  server.on('connection', (socket, request) => {
    if (request.url !== '/sprigcast') { socket.send(JSON.stringify({ op: 0, d: { rpcVersion: 1 } })); return; }
    const salt = 'salt'; const challenge = 'challenge'; let welcomed = false;
    socket.send(JSON.stringify({ hello: { app: 'SprigCast', version: '0.2.0', api: 0, auth: password === '' ? null : { salt, challenge } } }));
    socket.on('message', (raw) => {
      const message = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : '{}') as Record<string, unknown>;
      if (!welcomed) {
        greetings.push(message);
        if (typeof message['pair'] === 'string') {
          if (message['pair'] !== '123456') { socket.close(4011, 'Wrong code.'); return; }
          socket.send(JSON.stringify({ paired: { key: 'sc_paired-key', name: message['name'] } }));
          welcomed = true; socket.send(JSON.stringify({ welcome: { api: 0, events: [] } })); return;
        }
        if (password !== '' && message['auth'] !== sprigcastAuthentication(password, salt, challenge)) { socket.close(4009, 'Wrong password.'); return; }
        welcomed = true; socket.send(JSON.stringify({ welcome: { api: 0, events: [] } })); return;
      }
      asked.push(message);
      try { socket.send(JSON.stringify({ id: message['id'], ok: true, result: handle(String(message['do']), message) ?? {} })); }
      catch (error) { socket.send(JSON.stringify({ id: message['id'], ok: false, error: { code: (error as { code?: string }).code ?? 'not_found', message: (error as Error).message } })); }
    });
  });
  const address = server.address(); if (address === null || typeof address === 'string') throw new Error('no port');
  return { url: `ws://127.0.0.1:${String(address.port)}/sprigcast`, asked, greetings };
}

afterEach(async () => { await Promise.all(servers.splice(0).map(async (server) => { for (const client of server.clients) client.terminate(); await new Promise<void>((resolve) => server.close(() => resolve())); })); });

describe('SprigCast direct scene client (its own API, never the OBS door)', () => {
  it('lists blooms with the horizontal bloom on air as the current scene', () => {
    const snapshot = parseSprigCastBlooms({ blooms: [{ name: 'Starting', onAir: [] }, { name: 'Gameplay', onAir: ['horizontal', 'vertical'] }, { name: ' ', onAir: [] }] }, 'id', 'SprigCast');
    expect(snapshot).toEqual({ connectionId: 'id', connectionName: 'SprigCast', scenes: ['Starting', 'Gameplay'], currentScene: 'Gameplay' });
  });

  it('answers the password challenge the obs-websocket way and reads blooms', async () => {
    const fake = await fakeSprigCast((action) => action === 'blooms.list' ? { blooms: [{ name: 'BRB', onAir: ['horizontal'] }] } : {}, 'hunter2');
    const client = new SprigCastDirectSceneClient(fake.url, 'hunter2', 2_000, 'c1', 'SprigCast');
    expect((await client.getSceneList()).currentScene).toBe('BRB');
    expect(fake.greetings[0]?.['events']).toBe('none');
    expect(fake.asked[0]).toMatchObject({ do: 'blooms.list' });
  });

  it('keeps one socket open for its requests, names itself, and a status probe reuses it', async () => {
    const fake = await fakeSprigCast((action) => action === 'blooms.list' ? { blooms: [{ name: 'BRB', onAir: ['horizontal'] }] } : {});
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000, 'c1', 'SprigCast');
    await client.getSceneList(); await client.getSceneList();
    await new SprigCastDirectSceneClient(fake.url, '', 2_000, 'c2', 'SprigCast').getSceneList();
    expect(fake.greetings).toHaveLength(1);
    expect(fake.greetings[0]).toMatchObject({ events: 'none', name: 'StreamBridge' });
    expect(fake.asked.filter((entry) => entry['do'] === 'blooms.list')).toHaveLength(3);
    expect(await sprigcastAnswers(fake.url)).toBe(true);
    expect(fake.greetings).toHaveLength(1);
  });

  it('opens a new request socket after SprigCast closes the old one', async () => {
    const fake = await fakeSprigCast(() => ({ blooms: [] }));
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000);
    await client.getSceneList();
    for (const socket of servers.at(-1)?.clients ?? []) socket.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await client.getSceneList();
    expect(fake.greetings).toHaveLength(2);
  });

  it('explains a wrong password and a missing one', async () => {
    const fake = await fakeSprigCast(() => ({}), 'right');
    await expect(new SprigCastDirectSceneClient(fake.url, 'wrong', 2_000).getSceneList()).rejects.toThrow(/no longer knows StreamBridge.*Pair a device/u);
    await expect(new SprigCastDirectSceneClient(fake.url, '', 2_000).getSceneList()).rejects.toThrow(/needs to be paired.*Pair a device/u);
  });

  it('passes SprigCast errors through with their code', async () => {
    const fake = await fakeSprigCast(() => { throw new Error("No bloom called 'Nope'."); });
    await expect(new SprigCastDirectSceneClient(fake.url, '', 2_000).showScene('Nope')).rejects.toThrow(/No bloom called 'Nope'/u);
  });

  it('saves a screenshot from the returned PNG without SprigCast saving its own copy', async () => {
    const png = Buffer.from('fake-png').toString('base64');
    const fake = await fakeSprigCast((action) => action === 'screenshot.take' ? { shots: [{ shape: 'vertical', png }] } : {});
    const folder = await mkdtemp(join(tmpdir(), 'sprigcast-shot-'));
    try {
      await new SprigCastDirectSceneClient(fake.url, '', 2_000).saveScreenshot(join(folder, 'a', 'shot.png'), undefined, true);
      expect(await readFile(join(folder, 'a', 'shot.png'), 'utf8')).toBe('fake-png');
      expect(fake.asked[0]).toMatchObject({ do: 'screenshot.take', shape: 'vertical', save: false, data: true });
    } finally { await rm(folder, { recursive: true, force: true }); }
  });

  it('pictures one source or one bloom, and refuses an older SprigCast that pictures the whole screen instead', async () => {
    const png = Buffer.from('cam-png').toString('base64');
    let oneSource = true;
    const fake = await fakeSprigCast((action, message) => action === 'screenshot.take' ? { shots: [oneSource ? { ...(message['bloom'] === undefined ? { source: message['source'] } : { bloom: message['bloom'] }), png } : { shape: 'horizontal', png }] } : {});
    const folder = await mkdtemp(join(tmpdir(), 'sprigcast-shot-'));
    try {
      const client = new SprigCastDirectSceneClient(fake.url, '', 2_000);
      await client.saveScreenshot(join(folder, 'cam.png'), 'Cam');
      expect(await readFile(join(folder, 'cam.png'), 'utf8')).toBe('cam-png');
      expect(fake.asked[0]).toMatchObject({ do: 'screenshot.take', source: 'Cam', save: false, data: true });
      await client.saveScreenshot(join(folder, 'brb.png'), 'BRB', false, 'scene');
      expect(fake.asked[1]).toMatchObject({ do: 'screenshot.take', bloom: 'BRB' });
      oneSource = false;
      await expect(client.saveScreenshot(join(folder, 'old.png'), 'Cam')).rejects.toThrow(/Update SprigCast to picture one source/u);
    } finally { await rm(folder, { recursive: true, force: true }); }
  });

  it('Add all makes the bloom and Web page sources, places them on each canvas, and never touches a source that is there', async () => {
    const blooms = ['Live']; const sources = ['Chat']; const placed: Array<Record<string, unknown>> = [];
    const fake = await fakeSprigCast((action, message) => {
      if (action === 'blooms.list') return { blooms: blooms.map((name) => ({ id: name, name, shapes: { horizontal: name }, onAir: [] })) };
      if (action === 'bloom.new') { blooms.push(String(message['name'])); return {}; }
      if (action === 'sources.list') return { sources: sources.map((name) => ({ id: name, name, kind: 'browser' })) };
      if (action === 'source.new') { sources.push(String(message['name'])); return {}; }
      if (action === 'item.add') return { item: message['source'], shapes: ['horizontal', 'vertical'] };
      if (action === 'item.place') { placed.push(message); return {}; }
      if (action === 'bloom.remove') { blooms.splice(blooms.indexOf(String(message['bloom'])), 1); return {}; }
      return {};
    });
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000);
    const result = await client.addBrowserSources('StreamBridge Live', [
      { name: 'Chat', url: 'http://127.0.0.1:8787/overlay/chat', width: 400, height: 800 },
      { name: 'Alerts', url: 'http://127.0.0.1:8787/overlay/alerts', width: 1920, height: 1080, placement: 'full' },
    ]);
    expect(result).toEqual({ sceneName: 'StreamBridge Live', sceneCreated: true, added: ['Alerts'], skipped: ['Chat'] });
    expect(fake.asked.find((entry) => entry['do'] === 'source.new')).toMatchObject({ name: 'Alerts', kind: 'browser', settings: { url: 'http://127.0.0.1:8787/overlay/alerts', width: 1920, height: 1080, keep_running: true } });
    expect(placed.map((entry) => [entry['shape'], entry['x'], entry['y']])).toEqual([['horizontal', 0, 0], ['vertical', 0, 0]]);
    expect(await client.removeScenes(['StreamBridge Live', 'StreamBridge Ending'])).toEqual({ removed: ['StreamBridge Live'], missing: ['StreamBridge Ending'] });
  });

  it('pairs with a 6-digit code and then signs in with the key like a password', async () => {
    const fake = await fakeSprigCast((action) => action === 'blooms.list' ? { blooms: [{ name: 'Live', onAir: ['horizontal'] }] } : {}, 'sc_paired-key');
    await expect(sprigcastPair(fake.url, '12')).rejects.toThrow(/6-digit code/u);
    await expect(sprigcastPair(fake.url, '654321')).rejects.toThrow(/did not accept that code/u);
    const key = await sprigcastPair(fake.url, '123456');
    expect(key).toBe('sc_paired-key');
    expect(fake.greetings.find((entry) => entry['pair'] === '123456')).toMatchObject({ name: 'StreamBridge' });
    expect((await new SprigCastDirectSceneClient(fake.url, key, 2_000).getSceneList()).currentScene).toBe('Live');
  });

  it('reads connection.json for the live port, ignoring a file left behind by a crash', () => {
    const text = JSON.stringify({ app: 'SprigCast', version: '0.2.0', port: 4456, path: '/sprigcast', obsCompatible: true, passwordSet: true, pid: 42 });
    const file = parseSprigCastConnectionFile(text, (pid) => pid === 42);
    expect(file).toEqual({ port: 4456, path: '/sprigcast', passwordSet: true, pid: 42 });
    expect(parseSprigCastConnectionFile(text, () => false)).toBeUndefined();
    expect(parseSprigCastConnectionFile('not json', () => true)).toBeUndefined();
    expect(sprigcastLiveUrl('ws://127.0.0.1:4455/sprigcast', file)).toBe('ws://127.0.0.1:4456/sprigcast');
    expect(sprigcastLiveUrl('ws://127.0.0.1:4455/sprigcast', undefined)).toBe('ws://127.0.0.1:4455/sprigcast');
  });

  it('reads a connection.json saved with a byte-order mark', () => {
    expect(parseSprigCastConnectionFile('\uFEFF' + JSON.stringify({ port: 4456, path: '/sprigcast', pid: 7 }), () => true)?.port).toBe(4456);
  });

  it('finds SprigCast on 4456 when the typed 4455 refuses and no connection.json was found', async () => {
    const tried: string[] = [];
    const answers = async (url: string): Promise<boolean> => { tried.push(url); return url === 'ws://127.0.0.1:4456/sprigcast'; };
    expect(await findSprigCastUrl('ws://127.0.0.1:4455/sprigcast', undefined, answers)).toBe('ws://127.0.0.1:4456/sprigcast');
    expect(tried[0]).toBe('ws://127.0.0.1:4455/sprigcast');
    expect(await findSprigCastUrl('ws://127.0.0.1:4455/sprigcast', undefined, async () => false)).toBe('ws://127.0.0.1:4455/sprigcast');
    expect(await findSprigCastUrl('ws://127.0.0.1:4455/sprigcast', { port: 4457, path: '/sprigcast', passwordSet: true, pid: 1 }, async () => false)).toBe('ws://127.0.0.1:4457/sprigcast');
  });

  it('looks for SprigCast on every port it may move to (4455 to 4460)', async () => {
    const tried: string[] = [];
    expect(await findSprigCastUrl('ws://127.0.0.1:4455/sprigcast', undefined, async (url) => { tried.push(url); return url.includes(':4460/'); })).toBe('ws://127.0.0.1:4460/sprigcast');
    expect(tried).toContain('ws://127.0.0.1:4458/sprigcast');
  });

  it('counts a paused recording as recording, and names the plugin an effect needs', async () => {
    const fake = await fakeSprigCast((action) => {
      if (action === 'record.status') return { on: false, paused: true };
      if (action === 'stream.status') return { on: false, places: [] };
      if (action === 'sprigs.list') return { sprigs: [] };
      if (action === 'hide.pixelate' || action === 'roll.spin') throw Object.assign(new Error('plugin missing'), { code: 'plugin_missing' });
      return {};
    });
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000);
    expect(await client.isBusy()).toBe(true);
    await expect(client.runEffect('pixelate', 'Facecam', 5)).rejects.toThrow('SprigCast needs the Hide it plugin for this. Add it in SprigCast under Tools › Plugin store.');
    await expect(client.runEffect('barrel-roll', 'Facecam', 5)).rejects.toThrow(/Barrel Roll plugin/u);
  });

  it('lets go of its socket when SprigCast says app.closing, so the watcher can reconnect', async () => {
    const fake = await fakeSprigCast((action) => (action === 'blooms.list' ? { blooms: [] } : {}));
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000);
    const controller = new AbortController();
    const watching = client.watchChanges(() => undefined, controller.signal);
    await expect.poll(() => client.hasOpenSession()).toBe(true);
    for (const socket of servers.at(-1)?.clients ?? []) socket.send(JSON.stringify({ event: 'app.closing' }));
    await expect(watching).resolves.toBeUndefined();
    expect(client.hasOpenSession()).toBe(false);
    controller.abort();
  });

  it('reads a group of events sent at once (array, {events}, {batch}) in order, like single messages', () => {
    const a = { event: 'bloom.shown', bloom: 'A' }; const b = { event: 'bloom.shown', bloom: 'B' };
    expect(sprigcastMessages(a)).toEqual([a]);
    expect(sprigcastMessages([a, b])).toEqual([a, b]);
    expect(sprigcastMessages({ events: [a, 'junk', b] })).toEqual([a, b]);
    expect(sprigcastMessages({ batch: [b, a] })).toEqual([b, a]);
    expect(sprigcastMessages({ id: 'sb-1', ok: true, result: { events: [] } })).toHaveLength(1);
    expect(sprigcastMessages('text')).toEqual([]);
    expect(sprigcastMessages(Array.from({ length: 900 }, () => a))).toHaveLength(500);
  });

  it('handles several events in one batch: one scene re-read, one stream-state look, and answers mixed in still resolve', async () => {
    let listCalls = 0;
    const fake = await fakeSprigCast((action) => { if (action === 'blooms.list') { listCalls += 1; return { blooms: [{ name: 'C', onAir: ['horizontal'] }] }; } return {}; });
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000, undefined, undefined, 60_000);
    const signals: string[] = []; const stop = client.onStreamStateSignal((signal) => signals.push(signal));
    let changes = 0; const controller = new AbortController();
    const watching = client.watchChanges(() => { changes += 1; }, controller.signal);
    await expect.poll(() => client.hasOpenSession()).toBe(true);
    const socket = [...(servers.at(-1)?.clients ?? [])][0];
    socket?.send(JSON.stringify([{ event: 'bloom.shown', bloom: 'A' }, { event: 'bloom.shown', bloom: 'B' }, { event: 'stream.changed', active: true }, { event: 'record.changed', active: true }]));
    socket?.send(JSON.stringify({ events: [{ event: 'bloom.shown', bloom: 'C' }, { event: 'stream.changed', active: true }] }));
    await expect.poll(() => changes).toBe(1);
    expect(signals.filter((signal) => signal === 'stream-state-changed').length).toBeLessThanOrEqual(2);
    expect(signals).toContain('stream-state-changed');
    expect((await client.getSceneList()).currentScene).toBe('C');
    expect(listCalls).toBe(1);
    socket?.send(JSON.stringify({ batch: [{ event: 'garden.changed' }, { event: 'app.closing' }] }));
    await expect(watching).resolves.toBeUndefined();
    expect(client.hasOpenSession()).toBe(false);
    stop(); controller.abort();
  });

  it('reads SprigCast\'s real batch shape: separate event messages in a row, a stream end never lost before a restart', async () => {
    const fake = await fakeSprigCast((action) => (action === 'blooms.list' ? { blooms: [{ name: 'Gameplay', onAir: ['horizontal'] }] } : {}));
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000, undefined, undefined, 60_000);
    const signals: string[] = []; const stop = client.onStreamStateSignal((signal) => signals.push(signal));
    let changes = 0; const controller = new AbortController();
    const watching = client.watchChanges(() => { changes += 1; }, controller.signal);
    await expect.poll(() => client.hasOpenSession()).toBe(true);
    const socket = [...(servers.at(-1)?.clients ?? [])][0];
    for (const message of [{ event: 'stream.changed', on: false }, { event: 'stream.changed', on: true }, { event: 'bloom.shown', bloom: 'Starting Soon' }, { event: 'bloom.shown', bloom: 'Gameplay' }]) socket?.send(JSON.stringify(message));
    await expect.poll(() => changes).toBe(1);
    expect(signals).toContain('stream-state-changed');
    controller.abort(); await watching; stop();
  });

  it('switches Keep running when hidden on for pages that must not be closed, and never off for anything', async () => {
    const settings: Record<string, Record<string, unknown>> = {
      a: { url: 'http://127.0.0.1:8787/overlay/alerts', keep_running: false },
      b: { url: 'http://localhost:8787/overlay/chat?theme=x' },
      c: { url: 'http://127.0.0.1:8787/overlay/addons/thsv.soundboard', keep_running: true },
      d: { url: 'http://127.0.0.1:8787/overlay/addons/thsv.fan-crown', keep_running: false },
      e: { url: 'https://example.com/overlay/alerts', keep_running: false },
      f: { url: 'http://127.0.0.1:8787/overlay/combined/sounds', keep_running: false },
    };
    const fake = await fakeSprigCast((action, message) => {
      if (action === 'sources.list') return { sources: Object.keys(settings).map((id) => ({ id, name: id.toUpperCase(), kind: 'browser' })).concat([{ id: 'g', name: 'Cam', kind: 'camera' }]) };
      if (action === 'source.get') return { settings: settings[String(message['source'])] };
      if (action === 'source.set') { Object.assign(settings[String(message['source'])] ?? {}, message['settings']); return {}; }
      return {};
    });
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000);
    expect(await client.keepAlwaysRunningPagesOn()).toEqual({ changed: ['A', 'B', 'F'], already: ['C'] });
    expect(settings['d']?.['keep_running']).toBe(false);
    expect(settings['e']?.['keep_running']).toBe(false);
    expect(fake.asked.filter((message) => message['do'] === 'source.set').every((message) => (message['settings'] as Record<string, unknown>)['keep_running'] === true)).toBe(true);
  });

  it('lists its Web page sources with their pages for the readiness check', async () => {
    const fake = await fakeSprigCast((action, message) => {
      if (action === 'sources.list') return { sources: [{ id: 'b1', name: 'Alerts', kind: 'browser' }, { id: 'c1', name: 'Facecam', kind: 'camera' }] };
      if (action === 'source.get') return { settings: { url: message['source'] === 'b1' ? 'http://127.0.0.1:8787/overlay/alerts' : '' } };
      return {};
    });
    await expect(new SprigCastDirectSceneClient(fake.url, '', 2_000).browserSources()).resolves.toEqual([{ name: 'Alerts', url: 'http://127.0.0.1:8787/overlay/alerts' }]);
  });

  it('turns a refused connection into plain words', async () => {
    expect(sprigcastConnectMessage('connect ECONNREFUSED 127.0.0.1:4455', 'ws://127.0.0.1:4455/sprigcast')).toMatch(/^SprigCast isn't answering at ws:\/\/127\.0\.0\.1:4455\/sprigcast\./u);
    expect(sprigcastConnectMessage('Something else', 'ws://x')).toBe('Something else');
    await expect(sprigcastPair('ws://127.0.0.1:9/sprigcast', '123456', 'StreamBridge', 1_000)).rejects.toThrow(/SprigCast isn't answering/u);
  });

  it('places by item id on the canvas sizes SprigCast reports, stretching full-canvas overlays when it can', async () => {
    const placed: Array<Record<string, unknown>> = [];
    const fake = await fakeSprigCast((action, message) => {
      if (action === 'app.info') return { app: 'SprigCast', version: '0.2.0', canvases: [{ id: 'horizontal', width: 2560, height: 1440 }, { id: 'vertical', width: 1080, height: 1920 }], features: ['bloom.new', 'item.scale_xy', 'canvas.size'] };
      if (action === 'blooms.list') return { blooms: [] };
      if (action === 'sources.list') return { sources: [] };
      if (action === 'item.add') return { item: 'browser-7', shapes: ['horizontal', 'vertical'] };
      if (action === 'item.place') { placed.push(message); return {}; }
      return {};
    });
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000);
    expect((await client.info()).features.has('item.scale_xy')).toBe(true);
    await client.addBrowserSources('StreamBridge Live', [{ name: 'Alerts', url: 'http://127.0.0.1:8787/overlay/alerts', width: 1920, height: 1080, placement: 'full' }]);
    expect(placed[0]).toMatchObject({ item: 'browser-7', shape: 'horizontal', scale: 2560 / 1920 });
    expect(placed[1]).toMatchObject({ item: 'browser-7', shape: 'vertical', scale_x: 1080 / 1920, scale_y: 1920 / 1080 });
    expect(fake.asked.filter((entry) => entry['do'] === 'item.add')).toHaveLength(1);
  });

  it('also hits the "(Vertical)" copy an OBS import made for the vertical canvas', async () => {
    const fake = await fakeSprigCast((action) => {
      if (action === 'sources.list') return { sources: [{ id: 'camera-3', name: '[VCD] Elgato', kind: 'camera' }, { id: 'camera-1', name: '[VCD] Elgato (Vertical)', kind: 'camera' }, { id: 'camera-2', name: 'Webcam', kind: 'camera' }] };
      if (action === 'sprigs.list') return { sprigs: [{ name: '🟣 Elgato' }] };
      if (action === 'items.list') return { shapes: { horizontal: [{ id: 'camera-3', name: '[VCD] Elgato', sprig: false }] } };
      if (action === 'blooms.list') return { blooms: [{ name: 'Gameplay', onAir: ['horizontal', 'vertical'] }] };
      return {};
    });
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000);
    await client.runEffect('pixelate', '[VCD] Elgato', 15);
    await client.runEffect('barrel-roll', '🟣 Elgato', 3);
    await client.runEffect('blackout', 'Webcam', 5);
    const effects = fake.asked.filter((entry) => ['hide.blackout', 'hide.pixelate', 'roll.spin'].includes(String(entry['do'])));
    expect(effects).toEqual([
      expect.objectContaining({ do: 'hide.pixelate', source: '[VCD] Elgato', seconds: 15 }),
      expect.objectContaining({ do: 'hide.pixelate', source: '[VCD] Elgato (Vertical)', seconds: 15 }),
      expect.objectContaining({ do: 'roll.spin', sprig: '🟣 Elgato', seconds: 3 }),
      expect.objectContaining({ do: 'roll.spin', source: '[VCD] Elgato (Vertical)', seconds: 3 }),
      expect.objectContaining({ do: 'hide.blackout', source: 'Webcam', seconds: 5 }),
    ]);
  });

  it('runs every effect through the both-canvas requests, never filter.set, and never adds a one-canvas filter', async () => {
    const fake = await fakeSprigCast((action) => {
      if (action === 'sources.list') return { sources: [{ id: 'camera-1', name: 'Facecam', kind: 'camera' }] };
      if (action === 'sprigs.list') return { sprigs: [{ name: 'Elgato' }] };
      if (action === 'blooms.list') return { blooms: [{ name: 'Starting', onAir: [] }, { name: 'Gameplay', onAir: ['horizontal', 'vertical'] }] };
      if (action === 'plugins.list') return { plugins: [{ id: 'hide_it', name: 'Hide it', enabled: false }] };
      return {};
    });
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000);
    await client.runEffect('blackout', 'Facecam', 10);
    await client.runEffect('pixelate', 'Elgato', 5);
    await client.runEffect('barrel-roll', 'Elgato', 3);
    await client.runEffect('barrel-roll', 'Facecam', 3);
    const effects = fake.asked.filter((entry) => ['hide.blackout', 'hide.pixelate', 'roll.spin'].includes(String(entry['do'])));
    expect(effects).toEqual([
      expect.objectContaining({ do: 'hide.blackout', source: 'Facecam', seconds: 10 }),
      expect.objectContaining({ do: 'hide.pixelate', sprig: 'Elgato', in: 'Gameplay', seconds: 5 }),
      expect.objectContaining({ do: 'roll.spin', sprig: 'Elgato', seconds: 3 }),
      expect.objectContaining({ do: 'roll.spin', source: 'Facecam', seconds: 3 }),
    ]);
    expect(effects[0]).not.toHaveProperty('in');
    expect(fake.asked.some((entry) => entry['do'] === 'filter.set' || entry['do'] === 'filter.add')).toBe(false);
    // Without Hide it there is no filter fallback: the creator is asked to add the plugin.
    expect(await client.checkEffect('blackout', 'Facecam', '')).toMatchObject({ status: 'needs-setup', canCreate: false, detail: 'Add the Hide it plugin in SprigCast under Tools › Plugin store.' });
    expect(await client.checkEffect('pixelate', 'Elgato', '')).toMatchObject({ status: 'needs-setup' });
    await expect(client.createEffect('blackout')).rejects.toThrow(/Hide it plugin/u);
  });

  it('Save power turns keep_running off only on StreamBridge overlays that are safe to pause', async () => {
    const settings: Record<string, Record<string, unknown>> = {
      a: { url: 'http://127.0.0.1:8787/overlay/addons/thsv.chat-first', keep_running: true },
      b: { url: 'http://127.0.0.1:8787/overlay/alerts', keep_running: true },
      c: { url: 'http://127.0.0.1:8787/overlay/addons/thsv.local-clock', keep_running: false },
    };
    const fake = await fakeSprigCast((action, message) => {
      if (action === 'sources.list') return { sources: [{ id: 'a', name: 'Chat First', kind: 'browser' }, { id: 'b', name: 'Alerts', kind: 'browser' }, { id: 'c', name: 'Clock', kind: 'browser' }, { id: 'd', name: 'Cam', kind: 'camera' }] };
      if (action === 'source.get') return { settings: settings[String(message['source'])] };
      if (action === 'source.set') { Object.assign(settings[String(message['source'])] ?? {}, message['settings']); return {}; }
      return {};
    });
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000);
    expect(await client.pauseHiddenOverlaySources()).toEqual({ changed: ['Chat First'], already: ['Clock'], keptRunning: 1 });
    expect(settings['a']?.['keep_running']).toBe(false);
    expect(settings['b']?.['keep_running']).toBe(true);
    expect(await client.resumeHiddenOverlaySources()).toEqual({ changed: ['Chat First', 'Clock'], already: [], keptRunning: 1 });
  });

  it('discovery counts only SprigCast\'s own API, not an OBS answering on the same port', async () => {
    const fake = await fakeSprigCast(() => ({}));
    expect(await sprigcastAnswers(fake.url)).toBe(true);
    expect(await sprigcastAnswers(fake.url.replace('/sprigcast', '/'), 500)).toBe(false);
    expect(await sprigcastAnswers('ws://127.0.0.1:1/sprigcast', 500)).toBe(false);
  });

  it('the vault only saves SprigCast addresses that end in /sprigcast', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'sprigcast-vault-'));
    try {
      const vault = new BroadcastConnectionVaultService(folder, 'linux');
      await vault.start();
      await expect(vault.save({ provider: 'sprigcast', name: 'SprigCast', url: 'ws://127.0.0.1:4455', approvedByCreator: true })).rejects.toThrow(/must end with \/sprigcast/u);
    } finally { await rm(folder, { recursive: true, force: true }); }
  });
});
