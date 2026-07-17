import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileViewerLinkStore } from '../../bridge/services/viewer-link-store.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe('viewer link store', () => {
  it('atomically removes and can roll back creator-configured links', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-viewer-links-'));
    directories.push(directory);
    const path = join(directory, 'bridge.local.json');
    const config = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as Record<string, unknown>;
    const viewerIdentity = config['viewerIdentity'] as Record<string, unknown>;
    viewerIdentity['enabled'] = true;
    viewerIdentity['links'] = [{ viewerId: 'village-friend', accounts: [{ platform: 'twitch', userId: 'one' }, { platform: 'youtube', userId: 'two' }] }];
    await writeFile(path, JSON.stringify(config), 'utf8');
    const removal = await new FileViewerLinkStore(path).remove('village-friend');
    expect(removal).toMatchObject({ removedLinks: 1, removedAccounts: 2 });
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ viewerIdentity: { links: [] } });
    await removal.rollback();
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ viewerIdentity: { links: [{ viewerId: 'village-friend' }] } });
  });
});
