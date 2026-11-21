import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LocalAudioFolderService, LOCAL_AUDIO_ROUTE, cleanFolder } from '../../bridge/services/local-audio-folder.js';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import randomSound, { manifest, parseFolder, pickSound, resolveRequest, settingsFor } from '../../addons/random-sound/dist/index.js';

function files(...names: string[]) { return names.map((name, index) => ({ name, url: `/overlay/local-audio/${String(index).padStart(32, '0')}.ogg`, bytes: 10 })); }

function runtime(settings: Record<string, unknown> = {}, listed = files('boing.ogg', 'honk.ogg', 'splat.ogg')) {
  return {
    settings: { enabled: true, folders: ['Funny | C:\\Sounds\\Funny | 50 | funny | tw-funny | '], ...settings },
    chat: { send: vi.fn(async () => []) },
    overlay: { publish: vi.fn(async () => undefined) },
    audioFolder: { list: vi.fn(async (folder: string) => ({ folder, files: listed, skipped: 0 })) },
  };
}

function chat(message: string, platform = 'twitch', userId = 'viewer-1', roles: string[] = []) {
  return { eventId: `chat-${String(Math.random())}`, eventType: 'chat.message', platform, user: { id: userId, displayName: 'Sloth', actorType: 'human', roles }, metadata: { simulated: false }, payload: { message } };
}

describe('Random Sound extension', () => {
  it('ships empty and off', () => {
    const settings = settingsFor({ settings: {} });
    expect(settings.enabled).toBe(false);
    expect(settings.folders).toEqual([]);
  });

  it('reads folder rows', () => {
    expect(parseFolder('Funny | "C:\\Sounds\\Funny" | | !Funny | |', 0)).toMatchObject({ id: 'folder-1', folder: 'C:\\Sounds\\Funny', volume: 100, command: 'funny' });
    expect(parseFolder('No folder | | 50 | x | |', 0)).toBeUndefined();
  });

  it('plays every sound once before any repeats, and never the same sound twice in a row', async () => {
    await randomSound.start();
    const list = files('a.ogg', 'b.ogg', 'c.ogg');
    const settings = { noRepeats: true };
    const played: string[] = [];
    for (let round = 0; round < 30; round += 1) played.push(String(pickSound(list, settings, 'folder')?.name ?? ''));
    for (let start = 0; start < 30; start += 3) expect(new Set(played.slice(start, start + 3)).size).toBe(3);
    for (let index = 1; index < 30; index += 1) expect(played[index]).not.toBe(played[index - 1]);
    const loose: string[] = [];
    for (let round = 0; round < 30; round += 1) loose.push(String(pickSound(list, { noRepeats: false }, 'loose')?.name ?? ''));
    for (let index = 1; index < 30; index += 1) expect(loose[index]).not.toBe(loose[index - 1]);
    await randomSound.stop();
  });

  it('plays a random sound from the folder on a chat command, with an optional reply', async () => {
    const context = runtime({ volume: 80, playedMessage: '{viewer} played {sound} from {folder}' }); await randomSound.start();
    await randomSound.onEvent(chat('!funny'), context);
    expect(context.audioFolder.list).toHaveBeenCalledWith('C:\\Sounds\\Funny');
    expect(context.overlay.publish).toHaveBeenCalledWith('thsv.random-sound.sound.play', expect.objectContaining({ volume: 0.4, overlap: false }), { lane: 'independent' });
    expect((context.chat.send.mock.calls[0] as unknown[])[0]).toMatchObject({ sourcePlatform: 'twitch', message: expect.stringMatching(/^Sloth played (boing|honk|splat) from Funny$/u) as unknown });
    await randomSound.stop();
  });

  it('plays rewards right away and applies chat cooldowns', async () => {
    const context = runtime({ globalCooldownSeconds: 0, viewerCooldownSeconds: 60 }); await randomSound.start();
    await randomSound.onEvent(chat('!funny'), context);
    await randomSound.onEvent(chat('!funny'), context);
    expect(context.overlay.publish).toHaveBeenCalledTimes(1);
    await randomSound.onEvent({ eventId: 'r1', eventType: 'reward.redemption', platform: 'twitch', user: { id: 'viewer-1' }, metadata: { simulated: false }, payload: { rewardId: 'tw-funny', verifiedTransport: true } }, context);
    expect(context.overlay.publish).toHaveBeenCalledTimes(2);
    expect(resolveRequest(chat('!other'), settingsFor(context))).toBeUndefined();
    await randomSound.stop();
  });

  it('shows each folder in the Control Panel and reports a folder that cannot be read', async () => {
    const context = runtime();
    context.audioFolder.list.mockRejectedValueOnce(new Error('That folder does not exist on this PC.'));
    await randomSound.start();
    const status = await randomSound.controlPanel({ operation: 'status' }, context);
    expect(status.lists[0].items[0]).toMatchObject({ title: 'Funny', badge: 'Check folder', detail: 'That folder does not exist on this PC.' });
    await randomSound.controlPanel({ operation: 'action', action: 'rescan' }, context);
    const played = await randomSound.controlPanel({ operation: 'action', action: 'play-1' }, context);
    expect(played.message).toMatch(/^Playing (boing|honk|splat) from Funny\.$/u);
    expect(played.summary).toContainEqual({ label: 'Sounds', value: '3' });
    await randomSound.stop();
  });

  it('keeps its descriptor and manifest in step', async () => {
    const descriptor = JSON.parse(await readFile('addons/random-sound/module-package.json', 'utf8')) as { manifest: unknown; permissions: string[] };
    expect(descriptor.manifest).toEqual(manifest);
    expect(descriptor.permissions).toContain('audio.folder');
  });
});

describe('sound folders on this PC', () => {
  it('lists only sound files directly in the folder and serves them by token', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-sounds-'));
    try {
      await writeFile(join(root, 'b.mp3'), 'ID3data'); await writeFile(join(root, 'a.OGG'), 'OggS'); await writeFile(join(root, 'notes.txt'), 'x');
      await writeFile(join(root, 'empty.wav'), ''); await mkdir(join(root, 'inner')); await writeFile(join(root, 'inner', 'c.mp3'), 'ID3');
      const service = new LocalAudioFolderService();
      const listing = await service.list(root);
      expect(listing.files.map((file) => file.name)).toEqual(['a.OGG', 'b.mp3']);
      expect(listing.skipped).toBe(1);
      const match = LOCAL_AUDIO_ROUTE.exec(listing.files[1]?.url ?? '');
      expect(match).not.toBeNull();
      expect(service.resolve(match?.[1] ?? '', 'mp3')).toEqual({ path: join(root, 'b.mp3'), contentType: 'audio/mpeg' });
      expect(service.resolve(match?.[1] ?? '', 'wav')).toBeUndefined();
      expect(service.resolve('0'.repeat(32), 'mp3')).toBeUndefined();
      expect((await service.list(root)).files[1]?.url).toBe(listing.files[1]?.url);
      await expect(service.list(join(root, 'missing'))).rejects.toThrow('does not exist');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('wants a full local folder path', () => {
    expect(() => cleanFolder('Music')).toThrow('full path');
    expect(() => cleanFolder('\\\\server\\share')).toThrow('Network');
    expect(() => cleanFolder('')).toThrow();
    expect(cleanFolder('"C:\\Sounds"')).toBe('C:\\Sounds');
  });
});
