import { readFile } from 'node:fs/promises';
import { bridgeConfigSchema } from '../../schemas/config.js';
import { writeJsonAtomic } from './atomic-state.js';
import type { ViewerLinkRemoval } from '../core/viewer-progression.js';

export interface ViewerLinkStore {
  remove(viewerId: string): Promise<ViewerLinkRemoval>;
}

export class FileViewerLinkStore implements ViewerLinkStore {
  public constructor(private readonly configPath: string) {}

  public async remove(viewerId: string): Promise<ViewerLinkRemoval> {
    const original = JSON.parse(await readFile(this.configPath, 'utf8')) as unknown;
    const parsed = bridgeConfigSchema.parse(original);
    const removed = parsed.viewerIdentity.links.filter((link) => link.viewerId === viewerId);
    const next = structuredClone(original) as Record<string, unknown>;
    const viewerIdentity = next['viewerIdentity'] as Record<string, unknown> | undefined;
    if (viewerIdentity === undefined) throw new Error('Configuration does not contain viewerIdentity settings.');
    viewerIdentity['links'] = parsed.viewerIdentity.links.filter((link) => link.viewerId !== viewerId);
    bridgeConfigSchema.parse(next);
    await writeJsonAtomic(this.configPath, next);
    return {
      removedLinks: removed.length,
      removedAccounts: removed.reduce((total, link) => total + link.accounts.length, 0),
      rollback: async () => writeJsonAtomic(this.configPath, original),
    };
  }
}

export class NoopViewerLinkStore implements ViewerLinkStore {
  public async remove(): Promise<ViewerLinkRemoval> {
    return { removedLinks: 0, removedAccounts: 0, rollback: () => Promise.resolve() };
  }
}
