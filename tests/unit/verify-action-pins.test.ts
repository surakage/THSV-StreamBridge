import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { collectPinnedActions, resolveTagCommit, verifyPinnedActions } from '../../scripts/verify-action-pins.mjs';

describe('immutable GitHub Action tag verification', () => {
  it('collects tagged SHA pins and ignores container references', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-action-pins-'));
    await mkdir(join(root, '.github', 'workflows'), { recursive: true });
    await writeFile(join(root, '.github', 'workflows', 'ci.yml'), `steps:\n  - uses: actions/checkout@${'a'.repeat(40)} # v7\n  - uses: docker://example/tool:1@sha256:${'b'.repeat(64)}\n`);
    await expect(collectPinnedActions(root)).resolves.toEqual([{ repository: 'actions/checkout', sha: 'a'.repeat(40), tag: 'v7', files: ['ci.yml'] }]);
  });

  it('dereferences annotated tags to their exact commit', async () => {
    const responses = [
      { object: { type: 'tag', sha: 'b'.repeat(40) } },
      { object: { type: 'commit', sha: 'a'.repeat(40) } },
    ];
    const fetcher = async () => new Response(JSON.stringify(responses.shift()), { status: 200 });
    await expect(resolveTagCommit('actions/example', 'v1.2.3', fetcher)).resolves.toBe('a'.repeat(40));
  });

  it('rejects an immutable pin that omits its upstream version comment', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-action-pins-'));
    await mkdir(join(root, '.github', 'workflows'), { recursive: true });
    await writeFile(join(root, '.github', 'workflows', 'ci.yml'), `steps:\n  - uses: actions/checkout@${'a'.repeat(40)}\n`);
    await expect(collectPinnedActions(root)).rejects.toThrow('documented upstream version tag');
  });

  it('rejects Actions from publishers outside the approved allowlist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-action-pins-'));
    await mkdir(join(root, '.github', 'workflows'), { recursive: true });
    await writeFile(join(root, '.github', 'workflows', 'ci.yml'), `steps:\n  - uses: unknown/example@${'a'.repeat(40)} # v1\n`);
    await expect(collectPinnedActions(root)).rejects.toThrow('publisher allowlist');
  });

  it('rejects a documented tag that resolves to a different commit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-action-pins-'));
    await mkdir(join(root, '.github', 'workflows'), { recursive: true });
    await writeFile(join(root, '.github', 'workflows', 'ci.yml'), `steps:\n  - uses: actions/checkout@${'a'.repeat(40)} # v7\n`);
    const fetcher = async () => new Response(JSON.stringify({ object: { type: 'commit', sha: 'b'.repeat(40) } }), { status: 200 });
    await expect(verifyPinnedActions({ root, fetcher })).rejects.toThrow('that tag resolves to');
  });

  it('uses a recent verified tag cache only after bounded live retries fail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-action-pins-')); const cachePath = join(root, 'tag-cache.json'); const now = Date.parse('2026-08-28T12:00:00.000Z');
    await mkdir(join(root, '.github', 'workflows'), { recursive: true });
    await writeFile(join(root, '.github', 'workflows', 'ci.yml'), `steps:\n  - uses: actions/checkout@${'a'.repeat(40)} # v7\n`);
    await writeFile(cachePath, JSON.stringify({ schemaVersion: 1, entries: { 'actions/checkout@v7': { sha: 'a'.repeat(40), verifiedAt: '2026-08-28T11:00:00.000Z' } } }));
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('temporary network outage'));
    await expect(verifyPinnedActions({ root, fetcher, cachePath, now, retryDelaysMs: [0, 0] })).resolves.toMatchObject({ cachedResolutions: 1, pins: [{ resolutionSource: 'verified-cache', verified: true }] });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects a stale tag cache after live resolution fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-action-pins-')); const cachePath = join(root, 'tag-cache.json');
    await mkdir(join(root, '.github', 'workflows'), { recursive: true });
    await writeFile(join(root, '.github', 'workflows', 'ci.yml'), `steps:\n  - uses: actions/checkout@${'a'.repeat(40)} # v7\n`);
    await writeFile(cachePath, JSON.stringify({ schemaVersion: 1, entries: { 'actions/checkout@v7': { sha: 'a'.repeat(40), verifiedAt: '2026-08-01T00:00:00.000Z' } } }));
    await expect(verifyPinnedActions({ root, cachePath, now: Date.parse('2026-08-28T12:00:00.000Z'), fetcher: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')), retryDelaysMs: [] })).rejects.toThrow('offline');
  });

  it('does not hide a permanent missing-tag response behind the cache', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-action-pins-')); const cachePath = join(root, 'tag-cache.json');
    await mkdir(join(root, '.github', 'workflows'), { recursive: true });
    await writeFile(join(root, '.github', 'workflows', 'ci.yml'), `steps:\n  - uses: actions/checkout@${'a'.repeat(40)} # v7\n`);
    await writeFile(cachePath, JSON.stringify({ schemaVersion: 1, entries: { 'actions/checkout@v7': { sha: 'a'.repeat(40), verifiedAt: new Date().toISOString() } } }));
    await expect(verifyPinnedActions({ root, cachePath, fetcher: async () => new Response('{}', { status: 404 }), retryDelaysMs: [] })).rejects.toThrow('GitHub tag lookup failed (404)');
  });

  it('uses a recent verified cache during GitHub secondary rate limiting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-action-pins-')); const cachePath = join(root, 'tag-cache.json'); const now = Date.parse('2026-08-28T12:00:00.000Z');
    await mkdir(join(root, '.github', 'workflows'), { recursive: true });
    await writeFile(join(root, '.github', 'workflows', 'ci.yml'), `steps:\n  - uses: actions/checkout@${'a'.repeat(40)} # v7\n`);
    await writeFile(cachePath, JSON.stringify({ schemaVersion: 1, entries: { 'actions/checkout@v7': { sha: 'a'.repeat(40), verifiedAt: '2026-08-28T11:00:00.000Z' } } }));
    await expect(verifyPinnedActions({ root, cachePath, now, fetcher: async () => new Response('{}', { status: 403 }), retryDelaysMs: [] })).resolves.toMatchObject({ cachedResolutions: 1 });
  });
});
