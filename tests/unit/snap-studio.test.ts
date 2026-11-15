import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnapStudio, SnapStudioError, snapFileName } from '../../bridge/services/snap-studio.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('picture')]);
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const roots: string[] = [];

async function studio(options: { finishWindowMs?: number; fail?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'snap-studio-')); roots.push(root);
  const folder = join(root, 'Snaps');
  const capture = vi.fn(async (request: { filePath: string }) => {
    if (options.fail === true) throw new Error('OBS is not connected');
    await writeFile(request.filePath, PNG);
    return { app: 'obs' as const, connectionName: 'OBS' };
  });
  const discordPost = vi.fn(async () => ({ ok: true }));
  const instance = new SnapStudio(join(root, 'data'), { capture, logger, discordPost, defaultFolder: folder, finishWindowMs: options.finishWindowMs ?? 60_000 });
  return { instance, folder, capture, discordPost };
}

afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('Snap Studio', () => {
  it('names files with the date, time and a Windows-safe viewer name', () => {
    expect(snapFileName(new Date(2026, 10, 15, 20, 6, 12), 'Sura:<the>/Sloth', true)).toBe('2026-11-15 20-06-12 - SuratheSloth');
    expect(snapFileName(new Date(2026, 10, 15, 20, 6, 12), 'Sura', false)).toBe('2026-11-15 20-06-12');
  });

  it('takes the picture in OBS, serves it once to the overlay and saves the finished snap without replacing files', async () => {
    const { instance, folder, capture, discordPost } = await studio();
    const first = await instance.capture({ target: 'source', sourceName: 'Camera', fileName: '2026-11-15 20-06-12 - Sura', discord: { webhookId: 'hook-1', content: 'snap', username: 'Snap' } });
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ app: 'obs', target: 'source', sourceName: 'Camera' }));
    expect(first.photoUrl).toBe(`/overlay/snap/photo/${first.photoId}.png`);
    expect(await instance.photo(first.photoId)).toEqual(PNG);
    const image = `data:image/png;base64,${PNG.toString('base64')}`;
    await expect(instance.finish({ photoId: first.photoId, token: 'f'.repeat(32), image })).rejects.toBeInstanceOf(SnapStudioError);
    expect(await instance.finish({ photoId: first.photoId, token: first.token, image })).toEqual({ savedAs: '2026-11-15 20-06-12 - Sura.png', kind: 'snap' });
    await expect(instance.finish({ photoId: first.photoId, token: first.token, image })).rejects.toThrow('already saved');
    const second = await instance.capture({ target: 'source', sourceName: 'Camera', fileName: '2026-11-15 20-06-12 - Sura' });
    expect((await instance.finish({ photoId: second.photoId, token: second.token, image })).savedAs).toBe('2026-11-15 20-06-12 - Sura (2).png');
    expect((await readdir(folder)).sort()).toEqual(['2026-11-15 20-06-12 - Sura (2).png', '2026-11-15 20-06-12 - Sura.png']);
    await vi.waitFor(() => expect(discordPost).toHaveBeenCalledWith('hook-1', expect.objectContaining({ files: [expect.objectContaining({ name: '2026-11-15 20-06-12 - Sura.png' })] })));
    await instance.stop();
  });

  it('refuses anything but a PNG', async () => {
    const { instance } = await studio();
    const shot = await instance.capture({ target: 'scene', fileName: 'x' });
    await expect(instance.finish({ photoId: shot.photoId, token: shot.token, image: `data:image/png;base64,${Buffer.from('not a png').toString('base64')}` })).rejects.toThrow('not a PNG');
    await instance.stop();
  });

  it('saves the plain photo when the overlay never sends the finished snap', async () => {
    const { instance, folder } = await studio({ finishWindowMs: 20 });
    await instance.capture({ target: 'source', sourceName: 'Camera', fileName: 'plain' });
    await vi.waitFor(async () => expect(await readFile(join(folder, 'plain.png'))).toEqual(PNG));
    await instance.stop();
  });

  it('explains when OBS cannot take the picture or no source was chosen', async () => {
    const failing = await studio({ fail: true });
    await expect(failing.instance.capture({ target: 'source', sourceName: 'Camera', fileName: 'x' })).rejects.toThrow('OBS is not connected');
    await expect(failing.instance.capture({ target: 'source', sourceName: '', fileName: 'x' })).rejects.toThrow('Choose which OBS source');
    await expect(failing.instance.capture({ target: 'scene', folder: 'relative/folder', fileName: 'x' })).rejects.toThrow('full folder path');
  });
});
