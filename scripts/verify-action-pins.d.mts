export interface ActionPin {
  repository: string;
  sha: string;
  tag: string;
  files: string[];
}

export function collectPinnedActions(root: string): Promise<ActionPin[]>;
export function resolveTagCommit(repository: string, tag: string, fetcher?: typeof fetch, token?: string): Promise<string>;
export function verifyPinnedActions(options?: { root?: string; fetcher?: typeof fetch; token?: string; cachePath?: string; now?: number; cacheMaxAgeMs?: number; retryDelaysMs?: number[] }): Promise<{ schemaVersion: number; checkedAt: string; approvedPublishers: string[]; cachedResolutions: number; pins: Array<ActionPin & { resolvedSha: string; resolutionSource: string; verified: boolean }>; verified: boolean }>;
