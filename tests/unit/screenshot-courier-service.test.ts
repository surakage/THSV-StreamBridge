import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SCREENSHOT_TEMPLATE, MAXIMUM_SCREENSHOT_BYTES, ScreenshotCourierService, discordSafeUsername, isDiscordWebhookUrl, renderScreenshotMessage } from '../../bridge/services/screenshot-courier-service.js';
import { DiscordWebhookVault } from '../../bridge/services/discord-webhook-vault.js';
import type { NormalizedEvent } from '../../schemas/event.js';

const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABCDEFG-123';
const SECOND = 'https://ptb.discordapp.com/api/webhooks/987654321098765432/ZYXWVUTSRQPONMLKJIHGFEDCBA_zyxwv-987';
const silent = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
const protector = { protect: async (value: string) => `protected:${Buffer.from(value).toString('base64')}`, unprotect: async (value: string) => Buffer.from(value.replace(/^protected:/u, ''), 'base64').toString('utf8') };

interface Sent { readonly url: string; readonly body: FormData | string | undefined }
let folders: string[] = [];
afterEach(async () => { for (const path of folders) await rm(path, { recursive: true, force: true }); folders = []; });
async function folder(): Promise<string> { const path = await mkdtemp(join(tmpdir(), 'thsv-shots-')); folders.push(path); return path; }

async function harness(responses: Array<() => Response> = []) {
  const dataRoot = await folder();
  const shots = await folder();
  const sent: Sent[] = [];
  const waits: number[] = [];
  let now = Date.now();
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: url instanceof Request ? url.url : String(url), body: init?.body as FormData | string | undefined });
    return (responses.shift() ?? (() => new Response(null, { status: 204 })))();
  }) as typeof fetch;
  const vault = new DiscordWebhookVault(dataRoot, { protector, logger: silent, fetcher, sleep: async (ms) => { waits.push(ms); } });
  const service = new ScreenshotCourierService(dataRoot, { vault, logger: silent, now: () => now, sleep: async (ms) => { waits.push(ms); }, settleMs: 0, watch: () => ({ close: () => undefined }) });
  await service.start();
  const ids = (await vault.configure({ webhooks: [{ name: 'Clips', url: WEBHOOK }, { name: 'Off', url: SECOND, enabled: false }] })).webhooks.map((webhook) => webhook.id);
  await service.configure({ enabled: true, folders: [shots], webhookIds: ids, rewardTitles: ['Take a Screenshot'], commandName: '!Shot', requestWindowSeconds: 30, defaultAvatarUrl: 'https://example.com/me.png' });
  return { service, vault, ids, dataRoot, shots, sent, waits, advance: (ms: number) => { now += ms; } };
}

function reward(title: string, user = 'Cozy Sloth'): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `r-${title}`, eventType: 'reward.redemption', platform: 'twitch', source: { adapter: 'test', eventId: 'r1', eventName: 'TwitchRewardRedemption' },
    receivedAt: '2026-10-31T12:00:00Z', channel: { name: 'Twitch' }, user: { name: 'cozysloth', displayName: user, actorType: 'human', roles: [], avatarUrl: 'https://example.com/sloth.png' },
    payload: { rewardTitle: title }, metadata: { simulated: false },
  };
}
function payloadOf(sent: Sent | undefined): Record<string, unknown> { const value = (sent?.body as FormData).get('payload_json'); return JSON.parse(typeof value === 'string' ? value : '{}') as Record<string, unknown>; }

describe('Discord screenshots', () => {
  it('accepts only real Discord webhook links and renders the message tokens', () => {
    expect(isDiscordWebhookUrl(WEBHOOK)).toBe(true);
    expect(isDiscordWebhookUrl(SECOND)).toBe(true);
    expect(isDiscordWebhookUrl('https://discord.com.evil.example/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz')).toBe(false);
    expect(isDiscordWebhookUrl('http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz')).toBe(false);
    expect(renderScreenshotMessage(DEFAULT_SCREENSHOT_TEMPLATE, { user: 'Ada', platform: 'Kick', fileName: 'shot.png' })).toBe('📸 Screenshot by Ada on Kick: shot.png');
    expect(discordSafeUsername('Discord Fan', 'x')).toBe('d1scord Fan');
  });

  it('saves only webhook IDs and never returns webhook links', async () => {
    const { service, dataRoot, ids } = await harness();
    const saved = await readFile(join(dataRoot, 'secrets', 'screenshot-courier.json'), 'utf8');
    const status = JSON.stringify(service.status());
    for (const text of [saved, status]) { expect(text).not.toContain('abcdefghijklmnopqrstuvwxyz'); expect(text).not.toContain('discord.com/api'); expect(text).not.toContain('protected:'); }
    expect(JSON.parse(saved)).toMatchObject({ version: 2, webhookIds: ids });
    expect(service.status()).toMatchObject({ enabled: true, commandName: 'shot', webhooks: [{ name: 'Clips', hint: 'webhook …5678', ready: true, selected: true }, { name: 'Off', enabled: false, selected: true }] });
    await expect(service.configure({ enabled: true, folders: [], webhookIds: ['gone'] })).rejects.toThrow('was removed');
    await expect(service.configure({ enabled: true, folders: ['relative/folder'], webhookIds: [] })).rejects.toThrow('full folder path');
  });

  it('moves webhooks saved by the first version into the shared list and keeps posting to them', async () => {
    const dataRoot = await folder();
    const shots = await folder();
    await mkdir(join(dataRoot, 'secrets'), { recursive: true });
    const legacy = { version: 1, enabled: true, folders: [shots], webhooks: [{ id: 'old-hook', name: 'Old clips', protectedUrl: await protector.protect(WEBHOOK), enabled: true }], defaultUsername: 'StreamBridge', defaultAvatarUrl: '', messageTemplate: DEFAULT_SCREENSHOT_TEMPLATE, postAsViewer: true, rewardTitles: [], commandName: '', requestWindowSeconds: 30, takeObsScreenshot: false };
    await writeFile(join(dataRoot, 'secrets', 'screenshot-courier.json'), JSON.stringify(legacy));
    const urls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => { urls.push(url instanceof Request ? url.url : String(url)); return new Response(null, { status: 204 }); }) as typeof fetch;
    const vault = new DiscordWebhookVault(dataRoot, { protector, logger: silent, fetcher });
    const service = new ScreenshotCourierService(dataRoot, { vault, logger: silent, watch: () => ({ close: () => undefined }) });
    await service.start();
    expect(vault.status().webhooks).toEqual([{ id: 'old-hook', name: 'Old clips', enabled: true, hint: 'webhook …5678', ready: true }]);
    expect(JSON.parse(await readFile(join(dataRoot, 'secrets', 'screenshot-courier.json'), 'utf8'))).toMatchObject({ version: 2, webhookIds: ['old-hook'] });
    expect(await service.sendTest()).toEqual([{ name: 'Old clips', ok: true }]);
    expect(urls).toEqual([`${WEBHOOK}?wait=true`]);
    await service.stop();
  });

  it('posts a new picture as the viewer who asked, with the file attached and mentions off', async () => {
    const { service, shots, sent } = await harness();
    service.observe(reward('take a screenshot'));
    expect(service.status()['waitingFor']).toEqual({ user: 'Cozy Sloth', platform: 'Twitch' });
    const file = join(shots, 'shot.png');
    await writeFile(file, Buffer.from([137, 80, 78, 71]));
    expect(await service.postFile(file)).toEqual([{ name: 'Clips', ok: true }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(`${WEBHOOK}?wait=true`);
    expect(payloadOf(sent[0])).toEqual({ content: '📸 Screenshot by Cozy Sloth on Twitch: shot.png', username: 'Cozy Sloth', avatar_url: 'https://example.com/sloth.png', allowed_mentions: { parse: [] } });
    const attached = (sent[0]?.body as FormData).get('files[0]') as File;
    expect([attached.name, attached.type, attached.size]).toEqual(['shot.png', 'image/png', 4]);
  });

  it('falls back to the default name once the request window has passed', async () => {
    const { service, shots, sent, advance } = await harness();
    service.observe(reward('Take a Screenshot'));
    advance(31_000);
    const file = join(shots, 'late.jpg');
    await writeFile(file, 'x');
    await service.postFile(file);
    expect(payloadOf(sent[0])).toMatchObject({ content: '📸 Screenshot by StreamBridge on stream: late.jpg', username: 'StreamBridge', avatar_url: 'https://example.com/me.png' });
    service.observe(reward('Some other reward'));
    expect(service.status()['waitingFor']).toBeUndefined();
  });

  it('skips pictures over 10 MB and retries once after a rate limit', async () => {
    const { service, shots, sent, waits } = await harness([() => new Response(JSON.stringify({ retry_after: 2 }), { status: 429 })]);
    const big = join(shots, 'big.png');
    await writeFile(big, Buffer.alloc(MAXIMUM_SCREENSHOT_BYTES + 1));
    expect(await service.postFile(big)).toEqual([]);
    expect(sent).toHaveLength(0);
    expect(service.status()['lastError']).toContain('over 10 MB');
    const small = join(shots, 'small.webp');
    await writeFile(small, 'x');
    expect(await service.postFile(small)).toEqual([{ name: 'Clips', ok: true }]);
    expect(sent).toHaveLength(2);
    expect(waits).toContain(2_000);
  });

  it('posts a watched file once, after it settles', async () => {
    const { service, shots, sent } = await harness();
    const file = join(shots, 'watched.png');
    await writeFile(file, 'png');
    service.schedule(file); service.schedule(file);
    await service.idle();
    expect(sent).toHaveLength(1);
    service.schedule(file);
    await service.idle();
    expect(sent).toHaveLength(1);
  });
});
