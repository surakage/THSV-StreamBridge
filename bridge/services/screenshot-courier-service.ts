import { randomUUID } from 'node:crypto';
import { watch as watchFolder, type FSWatcher } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, win32 } from 'node:path';
import { z } from 'zod';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { CredentialProtector } from './broadcast-connection-vault-service.js';
import type { Logger } from './logger.js';

// Discord screenshots: every new picture saved in the creator's chosen folders is posted to their Discord
// webhooks. A channel point reward or chat command can name who asked, so the post can appear as that viewer.
// Webhook URLs are secrets: they are stored only as Windows-protected text and never logged or returned.

export const SCREENSHOT_EXTENSIONS = Object.freeze(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
export const MAXIMUM_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export const DEFAULT_SCREENSHOT_TEMPLATE = '📸 Screenshot by [user] on [platform]: [fileName]';
const MAXIMUM_FOLDERS = 5;
const MAXIMUM_WEBHOOKS = 5;
const WEBHOOK_PATTERN = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d{1,2}\/)?webhooks\/(\d{5,30})\/[A-Za-z0-9_-]{20,200}$/u;
const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' });
const PLATFORM_NAMES: Readonly<Record<string, string>> = Object.freeze({ twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok', facebook: 'Facebook' });

const storedWebhookSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/u), name: z.string().min(1).max(60), protectedUrl: z.string().min(1).max(16_384), enabled: z.boolean() }).strict();
const storedSchema = z.object({
  version: z.literal(1), enabled: z.boolean(), folders: z.array(z.string().min(1).max(260)).max(MAXIMUM_FOLDERS), webhooks: z.array(storedWebhookSchema).max(MAXIMUM_WEBHOOKS),
  defaultUsername: z.string().max(80), defaultAvatarUrl: z.string().max(2_048), messageTemplate: z.string().max(1_000), postAsViewer: z.boolean(),
  rewardTitles: z.array(z.string().min(1).max(100)).max(10), commandName: z.string().max(40), requestWindowSeconds: z.number().int().min(5).max(600), takeObsScreenshot: z.boolean(),
}).strict();
type StoredSettings = z.infer<typeof storedSchema>;

const configureSchema = z.object({
  enabled: z.boolean(),
  folders: z.array(z.string().trim().min(1).max(260)).max(MAXIMUM_FOLDERS),
  webhooks: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/u).optional(), name: z.string().trim().min(1).max(60), url: z.string().trim().max(512).optional(), enabled: z.boolean().default(true) }).strict()).max(MAXIMUM_WEBHOOKS),
  defaultUsername: z.string().trim().max(80).default(''),
  defaultAvatarUrl: z.string().trim().max(2_048).default(''),
  messageTemplate: z.string().trim().max(1_000).default(''),
  postAsViewer: z.boolean().default(true),
  rewardTitles: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  commandName: z.string().trim().max(40).default(''),
  requestWindowSeconds: z.number().int().min(5).max(600).default(30),
  takeObsScreenshot: z.boolean().default(false),
}).strict();

export class ScreenshotCourierError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

export interface ScreenshotRequester { readonly user: string; readonly platform: string; readonly avatarUrl?: string; readonly expiresAt: number }
export interface ScreenshotWebhookResult { readonly name: string; readonly ok: boolean; readonly error?: string }
export interface ScreenshotCourierDependencies {
  readonly protector: CredentialProtector;
  readonly logger: Logger;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  /** Saves the current OBS program scene to this file. Absent when OBS is not reachable directly. */
  readonly obsScreenshot?: (filePath: string) => Promise<void>;
  readonly watch?: (folder: string, listener: (fileName: string) => void) => FSWatcher | { close(): void };
  /** How long a new file's size must stay unchanged before it is posted. */
  readonly settleMs?: number;
}

export function isDiscordWebhookUrl(value: string): boolean { return WEBHOOK_PATTERN.test(value); }

/** A non-secret label for a saved webhook: the last four digits of its numeric ID. */
export function webhookHint(url: string): string { const id = WEBHOOK_PATTERN.exec(url)?.[1] ?? ''; return id ? `webhook …${id.slice(-4)}` : 'webhook'; }

export function renderScreenshotMessage(template: string, values: { readonly user: string; readonly platform: string; readonly fileName: string }): string {
  const text = (template || DEFAULT_SCREENSHOT_TEMPLATE)
    .replace(/\[user\]/giu, values.user).replace(/\[platform\]/giu, values.platform).replace(/\[fileName\]/giu, values.fileName);
  return Array.from(text).slice(0, 2_000).join('');
}

/** Discord rejects webhook names that contain "discord" or "clyde" and names over 80 characters. */
export function discordSafeUsername(value: string, fallback: string): string {
  const cleaned = value.replace(/[\p{Cc}]+/gu, ' ').replace(/discord/giu, 'd1scord').replace(/clyde/giu, 'clyd3').trim();
  return Array.from(cleaned || fallback).slice(0, 80).join('');
}

function isImage(fileName: string): boolean { return SCREENSHOT_EXTENSIONS.includes(extname(fileName).toLowerCase()); }
function absoluteFolder(value: string): boolean { return (isAbsolute(value) || win32.isAbsolute(value)) && !/[\p{Cc}]/u.test(value); }
function httpsUrl(value: string): boolean { try { return value === '' || (new URL(value).protocol === 'https:' && value.length <= 2_048); } catch { return false; } }
function defaultSettings(): StoredSettings {
  return { version: 1, enabled: false, folders: [], webhooks: [], defaultUsername: 'StreamBridge', defaultAvatarUrl: '', messageTemplate: DEFAULT_SCREENSHOT_TEMPLATE, postAsViewer: true, rewardTitles: [], commandName: '', requestWindowSeconds: 30, takeObsScreenshot: false };
}

export class ScreenshotCourierService {
  private readonly settingsPath: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly settleMs: number;
  private settings: StoredSettings = defaultSettings();
  private urls = new Map<string, string>();
  private watchers: Array<{ close(): void }> = [];
  private readonly seen = new Set<string>();
  private readonly pendingFiles = new Set<string>();
  private requester: ScreenshotRequester | undefined;
  private startedAt = 0;
  private running = false;
  private loadError: string | undefined;
  private lastPostedAt: string | undefined;
  private lastError: string | undefined;
  private posted = 0;
  private work: Promise<void> = Promise.resolve();

  public constructor(dataRoot: string, private readonly dependencies: ScreenshotCourierDependencies) {
    this.settingsPath = join(dataRoot, 'secrets', 'screenshot-courier.json');
    this.fetcher = dependencies.fetcher ?? fetch;
    this.now = dependencies.now ?? Date.now;
    this.sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.settleMs = dependencies.settleMs ?? 700;
  }

  public async start(): Promise<void> {
    this.running = true;
    this.startedAt = this.now();
    await this.load();
    this.watchFolders();
  }

  public async stop(): Promise<void> {
    this.running = false;
    this.closeWatchers();
    this.requester = undefined;
    await this.work;
  }

  /** Resolves once every picture already noticed has been handled. */
  public idle(): Promise<void> { return this.work; }

  public status(): Readonly<Record<string, unknown>> {
    const settings = this.settings;
    const problem = this.lastError ?? this.loadError;
    return {
      enabled: settings.enabled, folders: settings.folders, defaultUsername: settings.defaultUsername, defaultAvatarUrl: settings.defaultAvatarUrl,
      messageTemplate: settings.messageTemplate, postAsViewer: settings.postAsViewer, rewardTitles: settings.rewardTitles, commandName: settings.commandName,
      requestWindowSeconds: settings.requestWindowSeconds, takeObsScreenshot: settings.takeObsScreenshot,
      configured: settings.webhooks.length > 0 && settings.folders.length > 0,
      webhooks: settings.webhooks.map((webhook) => ({ id: webhook.id, name: webhook.name, enabled: webhook.enabled, hint: webhookHint(this.urls.get(webhook.id) ?? ''), ready: this.urls.has(webhook.id) })),
      watching: this.watchers.length, posted: this.posted, obsScreenshotAvailable: this.dependencies.obsScreenshot !== undefined,
      ...(this.lastPostedAt === undefined ? {} : { lastPostedAt: this.lastPostedAt }),
      ...(problem === undefined ? {} : { lastError: problem }),
      ...(this.requester !== undefined && this.requester.expiresAt > this.now() ? { waitingFor: { user: this.requester.user, platform: this.requester.platform } } : {}),
    };
  }

  /** Saves the creator's settings. A webhook keeps its saved URL unless a new one is pasted; webhooks left out are removed. */
  public async configure(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const parsed = configureSchema.safeParse(input);
    if (!parsed.success) throw new ScreenshotCourierError(400, 'Check the screenshot settings: up to five folders and five webhooks, each with a name.');
    const request = parsed.data;
    const folders = [...new Set(request.folders)];
    for (const folder of folders) {
      if (!absoluteFolder(folder)) throw new ScreenshotCourierError(400, `Use a full folder path, such as C:\\Users\\You\\Videos: ${folder}`);
      const info = await stat(folder).catch(() => undefined);
      if (!info?.isDirectory()) throw new ScreenshotCourierError(400, `This folder was not found on this PC: ${folder}`);
    }
    if (!httpsUrl(request.defaultAvatarUrl)) throw new ScreenshotCourierError(400, 'The default picture must be an https:// image link.');
    const webhooks: StoredSettings['webhooks'] = [];
    const urls = new Map<string, string>();
    for (const entry of request.webhooks) {
      const previous = entry.id === undefined ? undefined : this.settings.webhooks.find((webhook) => webhook.id === entry.id);
      if (entry.url !== undefined && entry.url !== '') {
        if (!isDiscordWebhookUrl(entry.url)) throw new ScreenshotCourierError(400, `"${entry.name}" is not a Discord webhook link. Copy it from Discord: Channel settings, Integrations, Webhooks, Copy Webhook URL.`);
        const id = previous?.id ?? randomUUID();
        webhooks.push({ id, name: entry.name, enabled: entry.enabled, protectedUrl: await this.dependencies.protector.protect(entry.url) });
        urls.set(id, entry.url);
      } else if (previous !== undefined) {
        webhooks.push({ ...previous, name: entry.name, enabled: entry.enabled });
        const saved = this.urls.get(previous.id); if (saved !== undefined) urls.set(previous.id, saved);
      } else throw new ScreenshotCourierError(400, `Paste the webhook link for "${entry.name}".`);
    }
    const next: StoredSettings = {
      version: 1, enabled: request.enabled, folders, webhooks,
      defaultUsername: request.defaultUsername || 'StreamBridge', defaultAvatarUrl: request.defaultAvatarUrl, messageTemplate: request.messageTemplate || DEFAULT_SCREENSHOT_TEMPLATE,
      postAsViewer: request.postAsViewer, rewardTitles: [...new Set(request.rewardTitles)], commandName: request.commandName.replace(/^!+/u, '').toLowerCase(),
      requestWindowSeconds: request.requestWindowSeconds, takeObsScreenshot: request.takeObsScreenshot,
    };
    await this.save(next);
    this.settings = next; this.urls = urls; this.loadError = undefined; this.lastError = undefined;
    if (this.running) { this.closeWatchers(); this.watchFolders(); }
    return this.status();
  }

  /** Remembers who asked for a screenshot through a matching reward or command. */
  public observe(event: NormalizedEvent): void {
    const settings = this.settings;
    if (!settings.enabled) return;
    let matched = false;
    if (event.eventType === 'reward.redemption') {
      const title = typeof event.payload['rewardTitle'] === 'string' ? event.payload['rewardTitle'].trim().toLowerCase() : '';
      matched = title !== '' && settings.rewardTitles.some((reward) => reward.toLowerCase() === title);
    } else if (event.eventType === 'command.received' && settings.commandName !== '') {
      const command = typeof event.payload['command'] === 'string' ? event.payload['command'].replace(/^!+/u, '').toLowerCase() : '';
      matched = command === settings.commandName;
    }
    if (!matched) return;
    const user = event.user?.displayName ?? event.user?.name ?? 'A viewer';
    this.requester = { user, platform: PLATFORM_NAMES[event.platform] ?? event.platform, ...(event.user?.avatarUrl === undefined ? {} : { avatarUrl: event.user.avatarUrl }), expiresAt: this.now() + settings.requestWindowSeconds * 1_000 };
    const capture = this.dependencies.obsScreenshot;
    const folder = settings.folders[0];
    if (settings.takeObsScreenshot && capture !== undefined && folder !== undefined) {
      const fileName = `stream-${new Date(this.now()).toISOString().replace(/[:.]/gu, '-')}.png`;
      capture(join(folder, fileName)).catch((error: unknown) => {
        this.lastError = 'OBS could not save the screenshot.';
        this.dependencies.logger.warn('OBS screenshot for a viewer request failed', { error });
      });
    }
  }

  /** Posts one picture to every enabled webhook. Returns the per-webhook result, never a URL. */
  public async postFile(filePath: string): Promise<readonly ScreenshotWebhookResult[]> {
    const size = (await stat(filePath)).size;
    if (size > MAXIMUM_SCREENSHOT_BYTES) {
      this.dependencies.logger.warn('Screenshot skipped because it is larger than Discord allows', { fileName: basename(filePath), bytes: size });
      this.lastError = `${basename(filePath)} is over 10 MB, so it was not posted.`;
      return [];
    }
    const bytes = await readFile(filePath);
    const requester = this.requester !== undefined && this.requester.expiresAt > this.now() ? this.requester : undefined;
    this.requester = undefined;
    const settings = this.settings;
    const fileName = basename(filePath);
    const asViewer = settings.postAsViewer && requester !== undefined;
    const content = renderScreenshotMessage(settings.messageTemplate, { user: requester?.user ?? settings.defaultUsername, platform: requester?.platform ?? 'stream', fileName });
    const username = discordSafeUsername(asViewer ? requester.user : settings.defaultUsername, 'StreamBridge');
    const avatarUrl = asViewer && requester.avatarUrl !== undefined ? requester.avatarUrl : settings.defaultAvatarUrl;
    const payload = JSON.stringify({ content, username, ...(avatarUrl ? { avatar_url: avatarUrl } : {}), allowed_mentions: { parse: [] } });
    const results = await this.deliver(() => {
      const form = new FormData();
      form.append('payload_json', payload);
      form.append('files[0]', new Blob([bytes], { type: CONTENT_TYPES[extname(fileName).toLowerCase()] ?? 'application/octet-stream' }), fileName);
      return form;
    });
    if (results.some((result) => result.ok)) { this.posted += 1; this.lastPostedAt = new Date(this.now()).toISOString(); }
    const failed = results.filter((result) => !result.ok);
    this.lastError = failed.length === 0 ? undefined : failed.map((result) => `${result.name}: ${result.error ?? 'failed'}`).join(' · ');
    return results;
  }

  /** Posts a text-only test message to every enabled webhook. */
  public async sendTest(): Promise<readonly ScreenshotWebhookResult[]> {
    const settings = this.settings;
    const body = JSON.stringify({ content: 'StreamBridge screenshot test: new screenshots will be posted here.', username: discordSafeUsername(settings.defaultUsername, 'StreamBridge'), ...(settings.defaultAvatarUrl ? { avatar_url: settings.defaultAvatarUrl } : {}), allowed_mentions: { parse: [] } });
    const results = await this.deliver(() => body, { 'content-type': 'application/json' });
    if (results.length === 0) throw new ScreenshotCourierError(409, 'Add and turn on at least one webhook first.');
    return results;
  }

  private async deliver(body: () => FormData | string, headers: Readonly<Record<string, string>> = {}): Promise<ScreenshotWebhookResult[]> {
    const results: ScreenshotWebhookResult[] = [];
    for (const webhook of this.settings.webhooks) {
      if (!webhook.enabled) continue;
      const url = this.urls.get(webhook.id);
      if (url === undefined) { results.push({ name: webhook.name, ok: false, error: 'Paste this webhook again on this PC.' }); continue; }
      results.push({ name: webhook.name, ...await this.send(url, body, headers) });
    }
    return results;
  }

  private async send(url: string, body: () => FormData | string, headers: Readonly<Record<string, string>>): Promise<{ ok: boolean; error?: string }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try { response = await this.fetcher(url, { method: 'POST', headers, body: body(), signal: AbortSignal.timeout(30_000) }); }
      catch { return { ok: false, error: 'Discord could not be reached.' }; }
      if (response.ok) return { ok: true };
      if (response.status === 429 && attempt === 0) {
        const retry = await response.json().then((value: unknown) => (typeof value === 'object' && value !== null && 'retry_after' in value ? Number(value.retry_after) : 1)).catch(() => 1);
        await this.sleep(Math.min(Math.max(Number.isFinite(retry) ? retry : 1, 0.5), 10) * 1_000);
        continue;
      }
      return { ok: false, error: response.status === 404 || response.status === 401 ? 'Discord says this webhook no longer exists.' : response.status === 413 ? 'The picture is too large for Discord.' : `Discord answered ${String(response.status)}.` };
    }
    return { ok: false, error: 'Discord is rate limiting this webhook.' };
  }

  private watchFolders(): void {
    if (!this.settings.enabled || this.settings.webhooks.length === 0) return;
    const watch = this.dependencies.watch ?? ((folder: string, listener: (fileName: string) => void) => watchFolder(folder, { persistent: false }, (_type, name) => { if (name) listener(name); }));
    for (const folder of this.settings.folders) {
      try {
        const watcher = watch(folder, (fileName) => { if (isImage(fileName)) this.schedule(join(folder, fileName)); });
        if ('on' in watcher && typeof watcher.on === 'function') watcher.on('error', (error: unknown) => this.dependencies.logger.warn('Screenshot folder watch stopped', { folder, error }));
        this.watchers.push(watcher);
      } catch (error) {
        this.lastError = `This folder cannot be watched: ${folder}`;
        this.dependencies.logger.warn('Screenshot folder could not be watched', { folder, error });
      }
    }
  }

  private closeWatchers(): void { for (const watcher of this.watchers) watcher.close(); this.watchers = []; }

  /** Waits until a new file stops growing, then posts it once. */
  public schedule(filePath: string): void {
    if (this.seen.has(filePath) || this.pendingFiles.has(filePath)) return;
    this.pendingFiles.add(filePath);
    this.work = this.work.then(async () => {
      try {
        let previous = -1;
        for (let check = 0; check < 40; check += 1) {
          const info = await stat(filePath).catch(() => undefined);
          if (info === undefined || !info.isFile()) return;
          // Only pictures saved after StreamBridge started; never the folder's history.
          if (info.mtimeMs < this.startedAt - 1_000) { this.remember(filePath); return; }
          if (info.size > 0 && info.size === previous) break;
          previous = info.size;
          await this.sleep(this.settleMs);
        }
        if (!this.running) return;
        this.remember(filePath);
        await this.postFile(filePath);
      } catch (error) {
        this.lastError = 'A screenshot could not be posted.';
        this.dependencies.logger.warn('Screenshot post failed', { fileName: basename(filePath), error });
      } finally { this.pendingFiles.delete(filePath); }
    });
  }

  private remember(filePath: string): void {
    this.seen.add(filePath);
    if (this.seen.size > 500) { const oldest = this.seen.values().next().value; if (oldest !== undefined) this.seen.delete(oldest); }
  }

  private async load(): Promise<void> {
    try {
      if ((await stat(this.settingsPath)).size > 131_072) throw new Error('Oversized settings');
      const stored = storedSchema.parse(JSON.parse(await readFile(this.settingsPath, 'utf8')));
      const urls = new Map<string, string>();
      for (const webhook of stored.webhooks) {
        try { const url = await this.dependencies.protector.unprotect(webhook.protectedUrl); if (isDiscordWebhookUrl(url)) urls.set(webhook.id, url); }
        catch { this.loadError = 'A saved webhook could not be unlocked on this PC. Paste it again.'; }
      }
      this.settings = stored; this.urls = urls;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.loadError = 'Screenshot settings could not be read. Save them again.';
        this.dependencies.logger.warn('Screenshot courier settings could not be loaded', { error: error instanceof Error ? error.message : 'unknown' });
      }
    }
  }

  private async save(settings: StoredSettings): Promise<void> {
    await mkdir(dirname(this.settingsPath), { recursive: true });
    const temporary = `${this.settingsPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.settingsPath);
  }
}
