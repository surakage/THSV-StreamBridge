import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DiscordWebhookVault, discordWebhookBody } from '../../bridge/services/discord-webhook-vault.js';

const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABCDEFG-123';
const FORUM = 'https://discord.com/api/webhooks/987654321098765432/ZYXWVUTSRQPONMLKJIHGFEDCBA_zyxwv-987';
const silent = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
const protector = { protect: async (value: string) => `protected:${Buffer.from(value).toString('base64')}`, unprotect: async (value: string) => Buffer.from(value.replace(/^protected:/u, ''), 'base64').toString('utf8') };

interface Sent { readonly url: string; readonly body: FormData | string | undefined; readonly headers: HeadersInit | undefined }
let folders: string[] = [];
afterEach(async () => { for (const path of folders) await rm(path, { recursive: true, force: true }); folders = []; });

async function harness(responses: Array<() => Response> = []) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'thsv-hooks-')); folders.push(dataRoot);
  const sent: Sent[] = [];
  const waits: number[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: url instanceof Request ? url.url : String(url), body: init?.body as FormData | string | undefined, headers: init?.headers });
    return (responses.shift() ?? (() => Response.json({ id: '1111111111', channel_id: '2222222222' })))();
  }) as typeof fetch;
  const vault = new DiscordWebhookVault(dataRoot, { protector, logger: silent, fetcher, sleep: async (ms) => { waits.push(ms); } });
  await vault.start();
  return { vault, dataRoot, sent, waits };
}
const bodyOf = (sent: Sent | undefined): Record<string, unknown> => JSON.parse(typeof sent?.body === 'string' ? sent.body : '{}') as Record<string, unknown>;

describe('Discord webhook vault', () => {
  it('stores links encrypted, returns only IDs, names and hints, and keeps a link when renamed', async () => {
    const { vault, dataRoot } = await harness();
    const status = await vault.configure({ webhooks: [{ name: 'Clips', url: WEBHOOK }, { name: 'Forum', url: FORUM, enabled: false }] });
    const saved = await readFile(join(dataRoot, 'secrets', 'discord-webhooks.json'), 'utf8');
    for (const text of [saved, JSON.stringify(status), JSON.stringify(vault.options())]) { expect(text).not.toContain('abcdefghijklmnopqrstuvwxyz'); expect(text).not.toContain('discord.com/api'); }
    expect(status.webhooks).toMatchObject([{ name: 'Clips', enabled: true, hint: 'webhook …5678', ready: true }, { name: 'Forum', enabled: false, hint: 'webhook …5432' }]);
    expect(vault.options()).toEqual([{ id: status.webhooks[0]?.id, name: 'Clips' }]);
    const id = status.webhooks[0]?.id ?? '';
    await vault.configure({ webhooks: [{ id, name: 'Renamed' }] });
    const reloaded = new DiscordWebhookVault(dataRoot, { protector, logger: silent, fetcher: (async () => Response.json({ id: '1' })) });
    await reloaded.start();
    expect(reloaded.options()).toEqual([{ id, name: 'Renamed' }]);
    expect(await reloaded.post(id, { content: 'hi' })).toEqual({ ok: true, messageId: '1' });
    await expect(vault.configure({ webhooks: [{ name: 'Bad', url: 'https://example.com/hook' }] })).rejects.toThrow('not a Discord webhook link');
    await expect(vault.configure({ webhooks: [{ name: 'Missing link' }] })).rejects.toThrow('Paste the webhook link');
  });

  it('moves webhooks saved by Discord screenshots on first load, with the same IDs', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'thsv-hooks-')); folders.push(dataRoot);
    await mkdir(join(dataRoot, 'secrets'), { recursive: true });
    await writeFile(join(dataRoot, 'secrets', 'screenshot-courier.json'), JSON.stringify({ version: 1, enabled: true, folders: [], webhooks: [{ id: 'shots', name: 'Shots', protectedUrl: await protector.protect(WEBHOOK), enabled: true }] }));
    const vault = new DiscordWebhookVault(dataRoot, { protector, logger: silent });
    await vault.start();
    expect(vault.options()).toEqual([{ id: 'shots', name: 'Shots' }]);
    const saved = JSON.parse(await readFile(join(dataRoot, 'secrets', 'discord-webhooks.json'), 'utf8')) as { webhooks: Array<{ id: string; protectedUrl: string }> };
    expect(saved.webhooks).toEqual([{ id: 'shots', name: 'Shots', protectedUrl: await protector.protect(WEBHOOK), enabled: true }]);
  });

  it('posts JSON with mentions off, waits for the message ID and supports threads and forum posts', async () => {
    const { vault, sent } = await harness();
    const [webhook] = (await vault.configure({ webhooks: [{ name: 'Forum', url: FORUM }] })).webhooks;
    const id = webhook?.id ?? '';
    const forum = await vault.post(id, { content: '@everyone new clip', username: 'Discord Bot', avatarUrl: 'https://example.com/a.png', embeds: [{ title: 'Clip' }], threadName: 'Great clip', forumTagIds: ['12345678', 'bad', '12345678'] });
    expect(forum).toEqual({ ok: true, messageId: '1111111111', threadId: '2222222222' });
    expect(sent[0]?.url).toBe(`${FORUM}?wait=true`);
    expect(sent[0]?.headers).toEqual({ 'content-type': 'application/json' });
    expect(bodyOf(sent[0])).toEqual({ content: '@everyone new clip', username: 'd1scord Bot', avatar_url: 'https://example.com/a.png', embeds: [{ title: 'Clip' }], thread_name: 'Great clip', applied_tags: ['12345678'], allowed_mentions: { parse: [] } });
    const reply = await vault.post(id, { content: 'more', threadId: '2222222222', threadName: 'ignored', forumTagIds: ['12345678'] });
    expect(reply).toEqual({ ok: true, messageId: '1111111111', threadId: '2222222222' });
    expect(sent[1]?.url).toBe(`${FORUM}?wait=true&thread_id=2222222222`);
    expect(bodyOf(sent[1])).toEqual({ content: 'more', allowed_mentions: { parse: [] } });
    const plain = await vault.post(id, { content: 'channel post' });
    expect(plain).toEqual({ ok: true, messageId: '1111111111' });
  });

  it('attaches files as multipart and refuses empty posts', async () => {
    const { vault, sent } = await harness();
    const id = (await vault.configure({ webhooks: [{ name: 'Clips', url: WEBHOOK }] })).webhooks[0]?.id ?? '';
    expect(await vault.post(id, {})).toEqual({ ok: false, error: 'There was nothing to post.' });
    expect(await vault.post(id, { files: [{ name: 'a.png', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' }] })).toMatchObject({ ok: true });
    const form = sent[0]?.body as FormData;
    expect(JSON.parse(form.get('payload_json') as string)).toEqual({ allowed_mentions: { parse: [] } });
    expect((form.get('files[0]') as File).size).toBe(3);
  });

  it('retries once after a rate limit and reports a deleted webhook in plain words', async () => {
    const { vault, sent, waits } = await harness([
      () => Response.json({ retry_after: 2.5 }, { status: 429 }),
      () => Response.json({ id: '5' }),
      () => new Response(null, { status: 404 }),
      () => Response.json({ retry_after: 1 }, { status: 429 }),
      () => Response.json({ retry_after: 1 }, { status: 429 }),
    ]);
    const id = (await vault.configure({ webhooks: [{ name: 'Clips', url: WEBHOOK }] })).webhooks[0]?.id ?? '';
    expect(await vault.post(id, { content: 'x' })).toEqual({ ok: true, messageId: '5' });
    expect(waits).toEqual([2_500]);
    expect(await vault.post(id, { content: 'x' })).toEqual({ ok: false, error: 'Discord says this webhook no longer exists.' });
    expect(await vault.post(id, { content: 'x' })).toEqual({ ok: false, error: 'Discord is rate limiting this webhook.' });
    expect(sent).toHaveLength(5);
    expect(await vault.post('removed', { content: 'x' })).toMatchObject({ ok: false, error: expect.stringContaining('removed') as string });
  });

  it('builds a bounded body without blank fields', () => {
    expect(discordWebhookBody({ content: 'x'.repeat(2_100), username: ' ', avatarUrl: 'http://insecure.example/a.png' })).toEqual({ content: 'x'.repeat(2_000), allowed_mentions: { parse: [] } });
  });
});
