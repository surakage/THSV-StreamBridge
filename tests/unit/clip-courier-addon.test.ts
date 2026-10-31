import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import clipCourier, { validClip, withinObservedStream } from '../../addons/clip-courier/dist/index.js';
// @ts-expect-error add-on migrations are intentionally plain JavaScript
import { migrate } from '../../addons/clip-courier/migrations/001-current-stream-only.mjs';

describe('Clip Courier', () => {
  it('uses the observed start when a provider timestamp is incorrectly in the future', async () => {
    let stored: Record<string, unknown> = {};
    const context = { settings: { enabled: true }, state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } } };
    await clipCourier.onEvent({ eventType: 'stream.online', platform: 'twitch', receivedAt: '2026-10-04T16:09:30.000Z', payload: { startedAt: '2026-10-04T21:09:24.000Z' } }, context);
    expect(stored['stream']).toMatchObject({ startedAt: '2026-10-04T16:09:30.000Z', active: true });
  });

  it('keeps discovery open after an empty offline scan so delayed clips can arrive', async () => {
    let stored: Record<string, unknown> = { stream: { startedAt: '2026-10-04T16:00:00.000Z', endedAt: '2026-10-04T18:00:00.000Z', active: false, finalized: false } };
    const calls: unknown[] = [];
    const context = { settings: { enabled: true, automaticCurrentStreamClips: true, webhookId: 'clips' }, state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } }, discord: { post: async (request: unknown) => { calls.push(request); return { ok: true, messageId: '123456789' }; } } };
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-library-cache.snapshot', receivedAt: '2026-10-04T18:01:00.000Z', payload: { clips: [] } }, context);
    expect(stored['stream']).toMatchObject({ finalized: false });
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-library-cache.snapshot', receivedAt: '2026-10-04T18:16:00.000Z', payload: { clips: [{ id: 'DelayedClip', url: 'https://clips.twitch.tv/DelayedClip', createdAt: '2026-10-04T17:59:00.000Z' }] } }, context);
    expect(calls).toHaveLength(1);
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-library-cache.snapshot', receivedAt: '2026-10-04T18:21:00.000Z', payload: { clips: [] } }, context);
    expect(stored['stream']).toMatchObject({ finalized: true });
  });

  it('routes the intake-owned Twitch clip command to the approved create helper once', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [] };
    const calls: Array<{ id: string; arguments: Record<string, unknown> }> = [];
    const context = {
      settings: { enabled: true },
      state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } },
      streamerbot: { runApprovedAction: async (id: string, arguments_: Record<string, unknown>) => { calls.push({ id, arguments: arguments_ }); } },
    };
    await clipCourier.onEvent({ eventType: 'command.received', platform: 'twitch', metadata: { simulated: false }, user: { id: 'viewer-1', name: 'viewer', displayName: 'Viewer', actorType: 'human' }, payload: { command: 'clip' } }, context);
    expect(calls).toEqual([{ id: '6cd2c22e-631c-4b78-91bd-c67169ce989b', arguments: { commandSource: 'twitch', userId: 'viewer-1', userName: 'Viewer' } }]);
  });

  it('migrates 2.5.0 scan settings to the current-stream-only model', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'clip-courier-migration-'));
    await writeFile(join(storageRoot, 'settings.json'), JSON.stringify({ enabled: true, scanMinutes: 15, clipCount: 20, publishExistingOnFirstScan: false, messageTemplate: 'A â€” B' }));
    await migrate({ storageRoot, fromVersion: '2.5.0', toVersion: '2.5.1', moduleId: 'thsv.clip-courier' });
    const settings = JSON.parse(await readFile(join(storageRoot, 'settings.json'), 'utf8')) as Record<string, unknown>;
    expect(settings).toEqual({ enabled: true, automaticCurrentStreamClips: false, messageTemplate: 'A — B' });
  });

  it('accepts stable Twitch clips and rejects arbitrary URLs', () => {
    expect(validClip({ id: 'Clip_123', url: 'https://clips.twitch.tv/Clip_123', title: 'Nice', creatorName: 'Alex', createdAt: '2026-07-30T01:00:00.000Z' })?.id).toBe('Clip_123');
    expect(validClip({ id: 'Clip_123', url: 'https://evil.example/clip' })).toBeUndefined();
  });

  it('publishes a command-created clip immediately without scanning the clip library', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [] };
    const calls: Array<Record<string, unknown>> = [];
    const actions: unknown[] = [];
    const context = {
      settings: { enabled: true, destinationMode: 'channel', maximumHistory: 300, webhookId: 'clips', messageTemplate: '{title} - clipped by {creator}\n{url}' },
      state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } },
      streamerbot: { runApprovedAction: async (...arguments_: unknown[]) => { actions.push(arguments_); } },
      discord: { post: async (request: Record<string, unknown>) => { calls.push(request); return { ok: true, messageId: '42' }; } },
    };
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-courier.clip-created', receivedAt: '2026-07-30T01:00:01.000Z', metadata: { simulated: false }, payload: { id: 'CommandClip', url: 'https://clips.twitch.tv/CommandClip', title: 'Viewer clip', creatorName: 'HelpfulViewer', createdAt: '2026-07-30T01:00:00.000Z', durationSeconds: 30, source: 'command' } }, context);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ webhookId: 'clips', content: expect.stringContaining('HelpfulViewer') as string });
    expect(calls[0]).not.toHaveProperty('threadName');
    expect(actions).toEqual([]);
    expect(stored['published']).toEqual([expect.objectContaining({ clipId: 'CommandClip', messageId: '42' })]);
  });

  it('accepts automatic clips only inside the observed Twitch stream window', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [] };
    const calls: Array<{ content: string }> = [];
    const context = {
      settings: { enabled: true, automaticCurrentStreamClips: true, destinationMode: 'channel', maximumHistory: 300, webhookId: 'clips' },
      state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } },
      discord: { post: async (request: { content: string }) => { calls.push(request); return { ok: true, messageId: '1' }; } },
    };
    await clipCourier.onEvent({ eventType: 'stream.online', platform: 'twitch', receivedAt: '2026-07-30T02:00:00.000Z', metadata: { simulated: false }, payload: { streamId: 'stream-1', startedAt: '2026-07-30T01:55:00.000Z' } }, context);
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-library-cache.snapshot', receivedAt: '2026-07-30T02:10:00.000Z', metadata: { simulated: false }, payload: { clips: [
      { id: 'OldClip', url: 'https://clips.twitch.tv/OldClip', title: 'Old', creatorName: 'Viewer', createdAt: '2026-07-29T20:00:00.000Z' },
      { id: 'CurrentClip', url: 'https://clips.twitch.tv/CurrentClip', title: 'Current', creatorName: 'Viewer', createdAt: '2026-07-30T02:05:00.000Z' },
    ] } }, context);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.content).toContain('Current');
    expect(calls[0]?.content).not.toContain('Old');
    expect(withinObservedStream(validClip({ id: 'OldClip', url: 'https://clips.twitch.tv/OldClip', createdAt: '2026-07-29T20:00:00.000Z' }), (stored['stream'] as object))).toBe(false);
  });

  it('fails closed when no Twitch stream boundary was observed', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [] };
    const calls: unknown[] = [];
    const context = {
      settings: { enabled: true, automaticCurrentStreamClips: true, webhookId: 'clips' },
      state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } },
      discord: { post: async (request: unknown) => { calls.push(request); return { ok: true }; } },
    };
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-library-cache.snapshot', receivedAt: '2026-07-30T02:10:00.000Z', metadata: { simulated: false }, payload: { clips: [{ id: 'UnknownSession', url: 'https://clips.twitch.tv/UnknownSession', createdAt: '2026-07-30T02:05:00.000Z' }] } }, context);
    expect(calls).toHaveLength(0);
  });

  it('starts a forum post per clip and stores the confirmed Discord identities', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [] };
    const calls: Array<Record<string, unknown>> = [];
    const context = { settings: { enabled: true, destinationMode: 'forum', forumTagIds: ['111111111111111111'], maximumHistory: 300, webhookId: 'clips' }, state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } }, discord: { post: async (request: Record<string, unknown>) => { calls.push(request); return { ok: true, messageId: '123456789', threadId: '987654321' }; } } };
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-courier.clip-created', receivedAt: '2026-07-27T12:00:00.000Z', metadata: { simulated: false }, payload: { id: 'Clip_123', url: 'https://clips.twitch.tv/Clip_123', title: 'Big play', creatorName: 'Viewer', createdAt: '2026-07-27T11:59:59.000Z', source: 'command' } }, context);
    expect(calls[0]).toMatchObject({ webhookId: 'clips', threadName: 'Big play' });
    expect(stored['published']).toEqual([expect.objectContaining({ clipId: 'Clip_123', messageId: '123456789', threadId: '987654321' })]);
    expect(JSON.stringify(stored)).not.toContain('webhook');
  });

  it('keeps a clip queued with a readable error when Discord refuses it', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [] };
    const context = { settings: { enabled: true, maximumHistory: 300, webhookId: 'clips' }, state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } }, discord: { post: async () => ({ ok: false, error: 'Discord says this webhook no longer exists.' }) } };
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-courier.clip-created', receivedAt: '2026-07-27T12:00:00.000Z', metadata: { simulated: false }, payload: { id: 'Clip_9', url: 'https://clips.twitch.tv/Clip_9', title: 'Retry me', creatorName: 'Viewer', createdAt: '2026-07-27T11:59:59.000Z', source: 'command' } }, context);
    expect(stored).toMatchObject({ pending: null, published: [], lastError: 'Discord says this webhook no longer exists.' });
    expect((stored['queue'] as Array<{ id: string }>).map((clip) => clip.id)).toEqual(['Clip_9']);
  });

  it('asks the creator to choose a webhook instead of posting', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [] };
    const calls: unknown[] = [];
    const context = { settings: { enabled: true }, state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } }, discord: { post: async (request: unknown) => { calls.push(request); return { ok: true }; } } };
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-courier.clip-created', receivedAt: '2026-07-27T12:00:00.000Z', metadata: { simulated: false }, payload: { id: 'Clip_7', url: 'https://clips.twitch.tv/Clip_7', creatorName: 'Viewer', createdAt: '2026-07-27T11:59:59.000Z', source: 'command' } }, context);
    expect(calls).toEqual([]);
    expect(stored['lastError']).toBe('Choose a Discord webhook in Clip Courier settings.');
  });
});
