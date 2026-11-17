import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { SprigCastDirectSceneClient, parseSprigCastBlooms, parseSprigCastConnectionFile, sprigcastAnswers, sprigcastAuthentication, sprigcastConnectMessage, findSprigCastUrl, sprigcastLiveUrl, sprigcastPair } from '../../bridge/services/sprigcast-direct-scene-client.js';
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

  it('blackout without the Hide it plugin: Set it up for me adds a Color Correction filter, and the effect uses it then switches off', async () => {
    const filters: Array<{ name: string; on: boolean }> = [];
    const fake = await fakeSprigCast((action, message) => {
      if (action === 'sources.list') return { sources: [{ id: 'camera-1', name: 'Facecam', kind: 'camera' }] };
      if (action === 'plugins.list') return { plugins: [{ id: 'hide_it', name: 'Hide it', enabled: false }] };
      if (action === 'filters.list') return { filters: filters.map((entry) => ({ name: entry.name, on: entry.on })) };
      if (action === 'filter.add') { filters.push({ name: String(message['name']), on: message['on'] === true }); return {}; }
      if (action === 'filter.set') { const found = filters.find((entry) => entry.name === message['filter']); if (found) found.on = message['on'] === true; return {}; }
      if (action === 'hide.blackout') throw Object.assign(new Error('Add the Hide it plugin in SprigCast (Settings → Plugins).'), { code: 'plugin_missing' });
      return {};
    });
    const client = new SprigCastDirectSceneClient(fake.url, '', 2_000);
    expect(await client.checkEffect('blackout', 'Facecam', '')).toMatchObject({ status: 'needs-setup', canCreate: true });
    await client.createEffect('blackout', 'Facecam', '');
    expect(fake.asked.find((entry) => entry['do'] === 'filter.add')).toMatchObject({ kind: 'color_correction', name: 'Blackout', settings: { color: '#000000' }, on: false });
    expect(await client.checkEffect('blackout', 'Facecam', '')).toMatchObject({ status: 'ready' });
    await client.runEffect('blackout', 'Facecam', 1);
    expect(filters[0]?.on).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1_300));
    expect(filters[0]?.on).toBe(false);
    await expect(client.runEffect('pixelate', 'Facecam', 1)).resolves.toBeUndefined();
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
