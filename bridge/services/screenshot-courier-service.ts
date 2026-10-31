import { randomUUID } from 'node:crypto';
import { watch as watchFolder, type FSWatcher } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, win32 } from 'node:path';
import { z } from 'zod';
import type { NormalizedEvent } from '../../schemas/event.js';
import { DISCORD_WEBHOOK_ID, MAXIMUM_DISCORD_WEBHOOKS, discordSafeUsername, type DiscordWebhookVault } from './discord-webhook-vault.js';
import type { Logger } from './logger.js';

export { discordSafeUsername, isDiscordWebhookUrl, webhookHint } from './discord-webhook-vault.js';

// Discord screenshots: every new picture saved in the creator's chosen folders is posted to their Discord
// webhooks. A channel point reward or chat command can name who asked, so the post can appear as that viewer.
// The webhooks live in the shared Discord webhook list; this feature saves only which ones it posts to.

export const SCREENSHOT_EXTENSIONS = Object.freeze(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
export const MAXIMUM_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export const DEFAULT_SCREENSHOT_TEMPLATE = '📸 Screenshot by [user] on [platform]: [fileName]';
const MAXIMUM_FOLDERS = 5;
const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' });
const PLATFORM_NAMES: Readonly<Record<string, string>> = Object.freeze({ twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok', facebook: 'Facebook' });

const storedSchema = z.object({
  version: z.literal(2), enabled: z.boolean(), folders: z.array(z.string().min(1).max(260)).max(MAXIMUM_FOLDERS), webhookIds: z.array(z.string().regex(DISCORD_WEBHOOK_ID)).max(MAXIMUM_DISCORD_WEBHOOKS),
  defaultUsername: z.string().max(80), defaultAvatarUrl: z.string().max(2_048), messageTemplate: z.string().max(1_000), postAsViewer: z.boolean(),
  rewardTitles: z.array(z.string().min(1).max(100)).max(10), commandName: z.string().max(40), requestWindowSeconds: z.number().int().min(5).max(600), takeObsScreenshot: z.boolean(),
}).strict();
type StoredSettings = z.infer<typeof storedSchema>;
// Version 1 kept its own protected webhook entries. The shared vault moves those entries over with the
// same IDs, so only the IDs are kept here.
const legacySchema = storedSchema.omit({ version: true, webhookIds: true }).extend({ version: z.literal(1), webhooks: z.array(z.object({ id: z.string().regex(DISCORD_WEBHOOK_ID) }).loose()).max(MAXIMUM_DISCORD_WEBHOOKS) }).strict();

const configureSchema = z.object({
  enabled: z.boolean(),
  folders: z.array(z.string().trim().min(1).max(260)).max(MAXIMUM_FOLDERS),
  webhookIds: z.array(z.string().regex(DISCORD_WEBHOOK_ID)).max(MAXIMUM_DISCORD_WEBHOOKS).default([]),
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
  readonly vault: DiscordWebhookVault;
  readonly logger: Logger;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  /** Saves the current OBS program scene to this file. Absent when OBS is not reachable directly. */
  readonly obsScreenshot?: (filePath: string) => Promise<void>;
  readonly watch?: (folder: string, listener: (fileName: string) => void) => FSWatcher | { close(): void };
  /** How long a new file's size must stay unchanged before it is posted. */
  readonly settleMs?: number;
}

export function renderScreenshotMessage(template: string, values: { readonly user: string; readonly platform: string; readonly fileName: string }): string {
  const text = (template || DEFAULT_SCREENSHOT_TEMPLATE)
    .replace(/\[user\]/giu, values.user).replace(/\[platform\]/giu, values.platform).replace(/\[fileName\]/giu, values.fileName);
  return Array.from(text).slice(0, 2_000).join('');
}

function isImage(fileName: string): boolean { return SCREENSHOT_EXTENSIONS.includes(extname(fileName).toLowerCase()); }
function absoluteFolder(value: string): boolean { return (isAbsolute(value) || win32.isAbsolute(value)) && !/[\p{Cc}]/u.test(value); }
function httpsUrl(value: string): boolean { try { return value === '' || (new URL(value).protocol === 'https:' && value.length <= 2_048); } catch { return false; } }
function defaultSettings(): StoredSettings {
  return { version: 2, enabled: false, folders: [], webhookIds: [], defaultUsername: 'StreamBridge', defaultAvatarUrl: '', messageTemplate: DEFAULT_SCREENSHOT_TEMPLATE, postAsViewer: true, rewardTitles: [], commandName: '', requestWindowSeconds: 30, takeObsScreenshot: false };
}

export class ScreenshotCourierService {
  private readonly settingsPath: string;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly settleMs: number;
  private settings: StoredSettings = defaultSettings();
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
    this.now = dependencies.now ?? Date.now;
    this.sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.settleMs = dependencies.settleMs ?? 700;
  }

  public async start(): Promise<void> {
    this.running = true;
    this.startedAt = this.now();
    await this.dependencies.vault.start();
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
      configured: this.activeWebhookIds().length > 0 && settings.folders.length > 0,
      webhookIds: settings.webhookIds,
      webhooks: this.dependencies.vault.status().webhooks.map((webhook) => ({ ...webhook, selected: settings.webhookIds.includes(webhook.id) })),
      watching: this.watchers.length, posted: this.posted, obsScreenshotAvailable: this.dependencies.obsScreenshot !== undefined,
      ...(this.lastPostedAt === undefined ? {} : { lastPostedAt: this.lastPostedAt }),
      ...(problem === undefined ? {} : { lastError: problem }),
      ...(this.requester !== undefined && this.requester.expiresAt > this.now() ? { waitingFor: { user: this.requester.user, platform: this.requester.platform } } : {}),
    };
  }

  /** Saves the creator's settings. Webhooks are chosen by ID from the shared Discord webhook list. */
  public async configure(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const parsed = configureSchema.safeParse(input);
    if (!parsed.success) throw new ScreenshotCourierError(400, 'Check the screenshot settings: up to five folders, and webhooks chosen from your Discord webhooks.');
    const request = parsed.data;
    const folders = [...new Set(request.folders)];
    for (const folder of folders) {
      if (!absoluteFolder(folder)) throw new ScreenshotCourierError(400, `Use a full folder path, such as C:\\Users\\You\\Videos: ${folder}`);
      const info = await stat(folder).catch(() => undefined);
      if (!info?.isDirectory()) throw new ScreenshotCourierError(400, `This folder was not found on this PC: ${folder}`);
    }
    if (!httpsUrl(request.defaultAvatarUrl)) throw new ScreenshotCourierError(400, 'The default picture must be an https:// image link.');
    const webhookIds = [...new Set(request.webhookIds)];
    if (webhookIds.some((id) => this.dependencies.vault.name(id) === undefined)) throw new ScreenshotCourierError(400, 'One of the chosen webhooks was removed. Refresh and choose again.');
    const next: StoredSettings = {
      version: 2, enabled: request.enabled, folders, webhookIds,
      defaultUsername: request.defaultUsername || 'StreamBridge', defaultAvatarUrl: request.defaultAvatarUrl, messageTemplate: request.messageTemplate || DEFAULT_SCREENSHOT_TEMPLATE,
      postAsViewer: request.postAsViewer, rewardTitles: [...new Set(request.rewardTitles)], commandName: request.commandName.replace(/^!+/u, '').toLowerCase(),
      requestWindowSeconds: request.requestWindowSeconds, takeObsScreenshot: request.takeObsScreenshot,
    };
    await this.save(next);
    this.settings = next; this.loadError = undefined; this.lastError = undefined;
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
    const files = [{ name: fileName, bytes, contentType: CONTENT_TYPES[extname(fileName).toLowerCase()] ?? 'application/octet-stream' }];
    const results: ScreenshotWebhookResult[] = [];
    for (const id of this.activeWebhookIds()) {
      const result = await this.dependencies.vault.post(id, { content, username, ...(avatarUrl ? { avatarUrl } : {}), files });
      results.push({ name: this.dependencies.vault.name(id) ?? 'webhook', ok: result.ok, ...(result.error === undefined ? {} : { error: result.error }) });
    }
    if (results.some((result) => result.ok)) { this.posted += 1; this.lastPostedAt = new Date(this.now()).toISOString(); }
    const failed = results.filter((result) => !result.ok);
    this.lastError = failed.length === 0 ? undefined : failed.map((result) => `${result.name}: ${result.error ?? 'failed'}`).join(' · ');
    return results;
  }

  /** Posts a text-only test message to every chosen webhook. */
  public async sendTest(): Promise<readonly ScreenshotWebhookResult[]> {
    const ids = this.activeWebhookIds();
    if (ids.length === 0) throw new ScreenshotCourierError(409, 'Choose at least one webhook that is on first.');
    const results = await this.dependencies.vault.test(ids, 'StreamBridge screenshot test: new screenshots will be posted here.');
    return results.map((result) => ({ name: result.name, ok: result.ok, ...(result.error === undefined ? {} : { error: result.error }) }));
  }

  /** Chosen webhooks that are still in the shared list and turned on. */
  private activeWebhookIds(): readonly string[] {
    const available = new Set(this.dependencies.vault.status().webhooks.filter((webhook) => webhook.enabled).map((webhook) => webhook.id));
    return this.settings.webhookIds.filter((id) => available.has(id));
  }

  private watchFolders(): void {
    if (!this.settings.enabled || this.settings.webhookIds.length === 0) return;
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
      const raw = JSON.parse(await readFile(this.settingsPath, 'utf8')) as unknown;
      const legacy = legacySchema.safeParse(raw);
      if (legacy.success) {
        const { webhooks, ...rest } = legacy.data;
        this.settings = { ...rest, version: 2, webhookIds: webhooks.map((webhook) => webhook.id) };
        await this.save(this.settings);
      } else this.settings = storedSchema.parse(raw);
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
