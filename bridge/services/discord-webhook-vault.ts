import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { CredentialProtector } from './broadcast-connection-vault-service.js';
import type { Logger } from './logger.js';

// Discord webhooks are saved once, here, and every Discord feature (screenshots and add-ons) picks one by
// its ID. Webhook URLs are secrets: they are stored only as Windows-protected text and never logged or
// returned. Callers see an ID, the creator's name for it and a non-secret hint.

export const MAXIMUM_DISCORD_WEBHOOKS = 25;
export const DISCORD_WEBHOOK_ID = /^[a-z0-9-]{1,64}$/u;
const WEBHOOK_PATTERN = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d{1,2}\/)?webhooks\/(\d{5,30})\/[A-Za-z0-9_-]{20,200}$/u;
const SNOWFLAKE = /^\d{5,30}$/u;
const MAXIMUM_FILE_BYTES = 10 * 1024 * 1024;

const storedWebhookSchema = z.object({ id: z.string().regex(DISCORD_WEBHOOK_ID), name: z.string().min(1).max(60), protectedUrl: z.string().min(1).max(16_384), enabled: z.boolean() }).strict();
const storedSchema = z.object({ version: z.literal(1), webhooks: z.array(storedWebhookSchema).max(MAXIMUM_DISCORD_WEBHOOKS) }).strict();
type StoredWebhook = z.infer<typeof storedWebhookSchema>;
// Discord screenshots saved its own webhook list before the shared vault existed; only that list is read.
const legacyScreenshotSchema = z.object({ webhooks: z.array(storedWebhookSchema).max(MAXIMUM_DISCORD_WEBHOOKS) }).loose();

const configureSchema = z.object({
  webhooks: z.array(z.object({ id: z.string().regex(DISCORD_WEBHOOK_ID).optional(), name: z.string().trim().min(1).max(60), url: z.string().trim().max(512).optional(), enabled: z.boolean().default(true) }).strict()).max(MAXIMUM_DISCORD_WEBHOOKS),
}).strict();

export class DiscordWebhookError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

export interface DiscordWebhookSummary { readonly id: string; readonly name: string }
export interface DiscordWebhookStatus extends DiscordWebhookSummary { readonly enabled: boolean; readonly hint: string; readonly ready: boolean }
export interface DiscordPostFile { readonly name: string; readonly bytes: Uint8Array; readonly contentType: string }
export interface DiscordPostRequest {
  readonly content?: string;
  readonly username?: string;
  readonly avatarUrl?: string;
  readonly embeds?: readonly Readonly<Record<string, unknown>>[];
  /** Posts into an existing thread or forum post. */
  readonly threadId?: string;
  /** Starts a new forum post with this title. Only for webhooks created on a forum channel. */
  readonly threadName?: string;
  /** Forum tag IDs for a new forum post. */
  readonly forumTagIds?: readonly string[];
  /** Role IDs the creator chose to ping. Everything else in the text stays a plain, silent mention. */
  readonly mentionRoleIds?: readonly string[];
  readonly files?: readonly DiscordPostFile[];
}
export interface DiscordPostResult { readonly ok: boolean; readonly messageId?: string; readonly threadId?: string; readonly error?: string }
export interface DiscordWebhookTestResult { readonly id: string; readonly name: string; readonly ok: boolean; readonly error?: string }

export interface DiscordWebhookVaultDependencies {
  readonly protector: CredentialProtector;
  readonly logger: Logger;
  readonly fetcher?: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export function isDiscordWebhookUrl(value: string): boolean { return WEBHOOK_PATTERN.test(value); }

/** A non-secret label for a saved webhook: the last four digits of its numeric ID. */
export function webhookHint(url: string): string { const id = WEBHOOK_PATTERN.exec(url)?.[1] ?? ''; return id ? `webhook …${id.slice(-4)}` : 'webhook'; }

/** Discord rejects webhook names that contain "discord" or "clyde" and names over 80 characters. */
export function discordSafeUsername(value: string, fallback: string): string {
  const cleaned = value.replace(/[\p{Cc}]+/gu, ' ').replace(/discord/giu, 'd1scord').replace(/clyde/giu, 'clyd3').trim();
  return Array.from(cleaned || fallback).slice(0, 80).join('');
}

function limited(value: string, maximum: number): string { return Array.from(value).slice(0, maximum).join(''); }
function httpsUrl(value: string): boolean { try { return new URL(value).protocol === 'https:' && value.length <= 2_048; } catch { return false; } }

/** Builds Discord's execute-webhook body. Mentions are disabled, so posted text pings only the roles the caller names. */
export function discordWebhookBody(request: DiscordPostRequest): Record<string, unknown> {
  const content = limited(request.content ?? '', 2_000);
  const roles = [...new Set((request.mentionRoleIds ?? []).filter((role) => SNOWFLAKE.test(role)))].slice(0, 3);
  const embeds = (request.embeds ?? []).slice(0, 10);
  const threadName = request.threadId === undefined ? limited((request.threadName ?? '').replace(/[\p{Cc}]+/gu, ' ').trim(), 100) : '';
  const tags = threadName === '' ? [] : [...new Set((request.forumTagIds ?? []).filter((tag) => SNOWFLAKE.test(tag)))].slice(0, 5);
  return {
    ...(content === '' ? {} : { content }),
    ...(request.username === undefined || request.username.trim() === '' ? {} : { username: discordSafeUsername(request.username, 'StreamBridge') }),
    ...(request.avatarUrl !== undefined && httpsUrl(request.avatarUrl) ? { avatar_url: request.avatarUrl } : {}),
    ...(embeds.length === 0 ? {} : { embeds }),
    ...(threadName === '' ? {} : { thread_name: threadName }),
    ...(tags.length === 0 ? {} : { applied_tags: tags }),
    allowed_mentions: roles.length === 0 ? { parse: [] } : { parse: [], roles },
  };
}

export class DiscordWebhookVault {
  private readonly path: string;
  private readonly legacyScreenshotPath: string;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private webhooks: StoredWebhook[] = [];
  private urls = new Map<string, string>();
  private loaded: Promise<void> | undefined;
  private loadError: string | undefined;
  private readonly listeners = new Set<() => void>();

  public constructor(dataRoot: string, private readonly dependencies: DiscordWebhookVaultDependencies) {
    this.path = join(dataRoot, 'secrets', 'discord-webhooks.json');
    this.legacyScreenshotPath = join(dataRoot, 'secrets', 'screenshot-courier.json');
    this.fetcher = dependencies.fetcher ?? fetch;
    this.sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  /** Loads saved webhooks once. The first load also brings over webhooks saved by Discord screenshots. */
  public start(): Promise<void> {
    this.loaded ??= this.load();
    return this.loaded;
  }

  /** Called after the creator saves the list, so features can drop choices that were removed. */
  public onChange(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  public status(): { readonly webhooks: readonly DiscordWebhookStatus[]; readonly maximum: number; readonly lastError?: string } {
    return {
      webhooks: this.webhooks.map((webhook) => ({ id: webhook.id, name: webhook.name, enabled: webhook.enabled, hint: webhookHint(this.urls.get(webhook.id) ?? ''), ready: this.urls.has(webhook.id) })),
      maximum: MAXIMUM_DISCORD_WEBHOOKS,
      ...(this.loadError === undefined ? {} : { lastError: this.loadError }),
    };
  }

  /** Webhooks that are on and unlocked on this PC, by ID and name only. This is all add-ons ever see. */
  public options(): readonly DiscordWebhookSummary[] {
    return this.webhooks.filter((webhook) => webhook.enabled && this.urls.has(webhook.id)).map((webhook) => Object.freeze({ id: webhook.id, name: webhook.name }));
  }

  public name(id: string): string | undefined { return this.webhooks.find((webhook) => webhook.id === id)?.name; }

  /** Saves the creator's list. A webhook keeps its saved URL unless a new one is pasted; webhooks left out are removed. */
  public async configure(input: unknown): Promise<ReturnType<DiscordWebhookVault['status']>> {
    await this.start();
    const parsed = configureSchema.safeParse(input);
    if (!parsed.success) throw new DiscordWebhookError(400, `Check the webhooks: up to ${String(MAXIMUM_DISCORD_WEBHOOKS)}, each with a name.`);
    const webhooks: StoredWebhook[] = [];
    const urls = new Map<string, string>();
    for (const entry of parsed.data.webhooks) {
      const previous = entry.id === undefined ? undefined : this.webhooks.find((webhook) => webhook.id === entry.id);
      if (entry.url !== undefined && entry.url !== '') {
        if (!isDiscordWebhookUrl(entry.url)) throw new DiscordWebhookError(400, `"${entry.name}" is not a Discord webhook link. Copy it from Discord: Channel settings, Integrations, Webhooks, Copy Webhook URL.`);
        const id = previous?.id ?? randomUUID();
        webhooks.push({ id, name: entry.name, enabled: entry.enabled, protectedUrl: await this.dependencies.protector.protect(entry.url) });
        urls.set(id, entry.url);
      } else if (previous !== undefined) {
        webhooks.push({ ...previous, name: entry.name, enabled: entry.enabled });
        const saved = this.urls.get(previous.id); if (saved !== undefined) urls.set(previous.id, saved);
      } else throw new DiscordWebhookError(400, `Paste the webhook link for "${entry.name}".`);
    }
    await this.save(webhooks);
    this.webhooks = webhooks; this.urls = urls; this.loadError = undefined;
    for (const listener of this.listeners) { try { listener(); } catch (error) { this.dependencies.logger.warn('Discord webhook change listener failed', { error }); } }
    return this.status();
  }

  /** Posts one message to one saved webhook. Never returns or logs the URL. */
  public async post(id: string, request: DiscordPostRequest, signal?: AbortSignal): Promise<DiscordPostResult> {
    await this.start();
    const webhook = this.webhooks.find((entry) => entry.id === id);
    if (webhook === undefined) return { ok: false, error: 'This Discord webhook was removed. Choose another one.' };
    if (!webhook.enabled) return { ok: false, error: `The Discord webhook "${webhook.name}" is turned off.` };
    const url = this.urls.get(id);
    if (url === undefined) return { ok: false, error: `Paste the Discord webhook "${webhook.name}" again on this PC.` };
    const files = request.files ?? [];
    if (files.length > 10 || files.some((file) => file.bytes.byteLength > MAXIMUM_FILE_BYTES)) return { ok: false, error: 'The picture is too large for Discord.' };
    const payload = discordWebhookBody(request);
    if (payload['content'] === undefined && payload['embeds'] === undefined && files.length === 0) return { ok: false, error: 'There was nothing to post.' };
    const query = new URLSearchParams({ wait: 'true' });
    if (request.threadId !== undefined && SNOWFLAKE.test(request.threadId)) query.set('thread_id', request.threadId);
    const json = JSON.stringify(payload);
    const body = files.length === 0 ? () => json : () => {
      const form = new FormData();
      form.append('payload_json', json);
      files.forEach((file, index) => form.append(`files[${String(index)}]`, new Blob([new Uint8Array(file.bytes)], { type: file.contentType }), file.name));
      return form;
    };
    const result = await this.send(`${url}?${query.toString()}`, body, files.length === 0 ? { 'content-type': 'application/json' } : {}, signal);
    if (!result.ok) return result;
    const threaded = query.has('thread_id') || payload['thread_name'] !== undefined;
    return { ok: true, ...(result.messageId === undefined ? {} : { messageId: result.messageId }), ...(threaded && result.channelId !== undefined ? { threadId: result.channelId } : {}) };
  }

  /** Posts a short test message to the chosen webhooks, or to every webhook that is on. */
  public async test(ids?: readonly string[], content = 'StreamBridge test: this webhook works.'): Promise<readonly DiscordWebhookTestResult[]> {
    await this.start();
    const chosen = this.webhooks.filter((webhook) => (ids === undefined ? webhook.enabled : ids.includes(webhook.id)));
    if (chosen.length === 0) throw new DiscordWebhookError(409, 'Add and turn on at least one webhook first.');
    const results: DiscordWebhookTestResult[] = [];
    for (const webhook of chosen) {
      const result = await this.post(webhook.id, { content, username: 'StreamBridge' });
      results.push({ id: webhook.id, name: webhook.name, ok: result.ok, ...(result.error === undefined ? {} : { error: result.error }) });
    }
    return results;
  }

  private async send(url: string, body: () => FormData | string, headers: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<{ ok: boolean; messageId?: string; channelId?: string; error?: string }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      const timeout = AbortSignal.timeout(30_000);
      try { response = await this.fetcher(url, { method: 'POST', headers, body: body(), signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]) }); }
      catch { return { ok: false, error: 'Discord could not be reached.' }; }
      if (response.ok) {
        const message = await response.json().catch(() => undefined) as { id?: unknown; channel_id?: unknown } | undefined;
        return { ok: true, ...(typeof message?.id === 'string' ? { messageId: message.id } : {}), ...(typeof message?.channel_id === 'string' ? { channelId: message.channel_id } : {}) };
      }
      if (response.status === 429 && attempt === 0) {
        const retry = await response.json().then((value: unknown) => (typeof value === 'object' && value !== null && 'retry_after' in value ? Number(value.retry_after) : 1)).catch(() => 1);
        await this.sleep(Math.min(Math.max(Number.isFinite(retry) ? retry : 1, 0.5), 10) * 1_000);
        continue;
      }
      return { ok: false, error: response.status === 429 ? 'Discord is rate limiting this webhook.' : response.status === 404 || response.status === 401 ? 'Discord says this webhook no longer exists.' : response.status === 413 ? 'The picture is too large for Discord.' : response.status === 400 ? 'Discord did not accept this post. Check that a forum webhook is used for forum posts.' : `Discord answered ${String(response.status)}.` };
    }
    return { ok: false, error: 'Discord is rate limiting this webhook.' };
  }

  private async load(): Promise<void> {
    let stored: StoredWebhook[];
    try {
      if ((await stat(this.path)).size > 262_144) throw new Error('Oversized webhook list');
      stored = storedSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))).webhooks;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.loadError = 'Saved Discord webhooks could not be read. Add them again.';
        this.dependencies.logger.warn('Discord webhooks could not be loaded', { error: error instanceof Error ? error.message : 'unknown' });
        return;
      }
      stored = await this.migrateScreenshotWebhooks();
    }
    const urls = new Map<string, string>();
    for (const webhook of stored) {
      try { const url = await this.dependencies.protector.unprotect(webhook.protectedUrl); if (isDiscordWebhookUrl(url)) urls.set(webhook.id, url); }
      catch { this.loadError = 'A saved webhook could not be unlocked on this PC. Paste it again.'; }
    }
    this.webhooks = stored; this.urls = urls;
  }

  /** Copies the still-protected webhook entries Discord screenshots saved, keeping their IDs so its choices still match. */
  private async migrateScreenshotWebhooks(): Promise<StoredWebhook[]> {
    let legacy: StoredWebhook[];
    try { legacy = legacyScreenshotSchema.parse(JSON.parse(await readFile(this.legacyScreenshotPath, 'utf8'))).webhooks; }
    catch { return []; }
    if (legacy.length === 0) return [];
    await this.save(legacy);
    this.dependencies.logger.info('Discord screenshot webhooks moved to the shared Discord webhook list', { webhooks: legacy.length });
    return legacy;
  }

  private async save(webhooks: readonly StoredWebhook[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, webhooks }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.path);
  }
}
