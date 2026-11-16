import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, win32 } from 'node:path';
import { z } from 'zod';
import type { Logger } from './logger.js';
import type { ScreenshotRequest, ScreenshotResult } from './direct-scene-connection-manager.js';
import type { DiscordPostRequest, DiscordPostResult } from './discord-webhook-vault.js';

// Snap: an instant photo on stream. The add-on asks for a picture; OBS saves it here, the overlay shows it printing out of
// the camera, draws the finished photo with its frame and caption, and sends that back to be saved in the creator's
// folder. If the overlay never sends it (closed, hidden or reloading), the plain photo is saved instead, so no snap is lost.

export const SNAP_PHOTO_ID = /^[a-f0-9]{32}$/u;
const MAXIMUM_PENDING = 20;
const PHOTO_LIFETIME_MS = 60 * 60_000;
const FINISH_WINDOW_MS = 90_000;
export const MAXIMUM_SNAP_BYTES = 15 * 1024 * 1024;
const DISCORD_MAXIMUM_BYTES = 10 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const snapCaptureRequestSchema = z.object({
  target: z.enum(['source', 'scene', 'named-scene']).default('source'),
  sourceName: z.string().trim().max(256).default(''),
  folder: z.string().trim().max(260).default(''),
  fileName: z.string().trim().min(1).max(120),
  discord: z.object({
    webhookId: z.string().regex(/^[a-z0-9-]{1,64}$/u),
    content: z.string().max(1_900).default(''),
    username: z.string().trim().max(80).default('Snap'),
  }).strict().optional(),
}).strict();
export type SnapCaptureRequest = z.input<typeof snapCaptureRequestSchema>;
export interface SnapCaptureResult { readonly photoId: string; readonly photoUrl: string; readonly token: string }
export interface SnapSaveResult { readonly savedAs: string; readonly kind: 'snap' | 'photo' }

export class SnapStudioError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

interface PendingSnap {
  readonly photoId: string;
  readonly token: string;
  readonly folder: string;
  readonly fileName: string;
  readonly photoPath: string;
  readonly createdAt: number;
  readonly discord?: z.infer<typeof snapCaptureRequestSchema>['discord'];
  saved: boolean;
  timer?: NodeJS.Timeout;
}

export interface SnapStudioDependencies {
  readonly capture: (request: ScreenshotRequest) => Promise<ScreenshotResult>;
  readonly logger: Logger;
  readonly discordPost?: (webhookId: string, request: DiscordPostRequest) => Promise<DiscordPostResult>;
  readonly defaultFolder?: string;
  readonly now?: () => number;
  readonly finishWindowMs?: number;
}

/** Turns a viewer's name and the time into a Windows-safe file name without an extension. */
export function snapFileName(when: Date, viewer: string, includeViewer: boolean): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp = `${String(when.getFullYear())}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}-${pad(when.getMinutes())}-${pad(when.getSeconds())}`;
  const name = safeFilePart(viewer).slice(0, 40).trim();
  return includeViewer && name ? `${stamp} - ${name}` : stamp;
}

function safeFilePart(value: string): string {
  return value.replace(/[\p{Cc}<>:"/\\|?*]+/gu, '').replace(/\s+/gu, ' ').replace(/^[.\s]+|[.\s]+$/gu, '').trim();
}

function absoluteFolder(value: string): boolean { return (isAbsolute(value) || win32.isAbsolute(value)) && !/[\p{Cc}]/u.test(value); }

export class SnapStudio {
  private readonly pending = new Map<string, PendingSnap>();
  private readonly photoDirectory: string;
  private saved = 0;
  private lastSavedAs: string | undefined;
  private lastError: string | undefined;

  public constructor(dataRoot: string, private readonly dependencies: SnapStudioDependencies) {
    this.photoDirectory = join(dataRoot, 'runtime', 'snap-photos');
  }

  private now(): number { return this.dependencies.now?.() ?? Date.now(); }

  public defaultFolder(): string { return this.dependencies.defaultFolder ?? join(homedir(), 'Pictures', 'StreamBridge Snaps'); }

  public status(): Readonly<Record<string, unknown>> {
    return { saved: this.saved, ...(this.lastSavedAs === undefined ? {} : { lastSavedAs: this.lastSavedAs }), ...(this.lastError === undefined ? {} : { lastError: this.lastError }), defaultFolder: this.defaultFolder() };
  }

  /** Takes the picture in OBS now and keeps it ready for the overlay. */
  public async capture(input: SnapCaptureRequest): Promise<SnapCaptureResult> {
    const parsed = snapCaptureRequestSchema.safeParse(input);
    if (!parsed.success) throw new SnapStudioError(400, 'Check the Snap settings: the source name, folder or file name is not valid.');
    const request = parsed.data;
    if (request.target !== 'scene' && request.sourceName === '') throw new SnapStudioError(400, request.target === 'source' ? 'Choose which source Snap takes the picture of.' : 'Choose which scene Snap takes the picture of.');
    const folder = request.folder || this.defaultFolder();
    if (!absoluteFolder(folder)) throw new SnapStudioError(400, `Use a full folder path for Snap pictures, such as C:\\Users\\You\\Pictures: ${folder}`);
    const fileName = safeFilePart(request.fileName);
    if (fileName === '') throw new SnapStudioError(400, 'The Snap file name is empty.');
    await mkdir(this.photoDirectory, { recursive: true });
    await this.prune();
    const photoId = randomBytes(16).toString('hex');
    const token = randomBytes(16).toString('hex');
    const photoPath = join(this.photoDirectory, `${photoId}.png`);
    try {
      // OBS or SprigCast, whichever answers: the screen on air, one source (a camera) or one named scene (bloom).
      await this.dependencies.capture({ app: 'auto', target: request.target, ...(request.target === 'scene' ? {} : { sourceName: request.sourceName }), filePath: photoPath });
      const information = await stat(photoPath).catch(() => undefined);
      if (information === undefined || information.size === 0) throw new Error('The streaming app did not save the picture.');
    } catch (error) {
      this.lastError = `The picture could not be taken: ${error instanceof Error ? error.message : String(error)}`;
      this.dependencies.logger.warn('Snap picture failed', { error });
      throw new SnapStudioError(502, this.lastError);
    }
    const entry: PendingSnap = { photoId, token, folder, fileName, photoPath, createdAt: this.now(), saved: false, ...(request.discord === undefined ? {} : { discord: request.discord }) };
    // If the overlay is not open, the plain photo is saved after a short wait.
    entry.timer = setTimeout(() => { void this.saveFallback(photoId); }, this.dependencies.finishWindowMs ?? FINISH_WINDOW_MS);
    entry.timer.unref();
    this.pending.set(photoId, entry);
    return { photoId, photoUrl: `/overlay/snap/photo/${photoId}.png`, token };
  }

  /** The plain photo for the overlay, while it is still fresh. */
  public async photo(photoId: string): Promise<Buffer | undefined> {
    if (!SNAP_PHOTO_ID.test(photoId)) return undefined;
    const entry = this.pending.get(photoId);
    if (entry === undefined || this.now() - entry.createdAt > PHOTO_LIFETIME_MS) return undefined;
    return await readFile(entry.photoPath).catch(() => undefined);
  }

  /** Saves the finished picture the overlay drew (a PNG data URL) once per snap. */
  public async finish(input: unknown): Promise<SnapSaveResult> {
    const parsed = z.object({ photoId: z.string().regex(SNAP_PHOTO_ID), token: z.string().regex(/^[a-f0-9]{32}$/u), image: z.string().max(Math.ceil(MAXIMUM_SNAP_BYTES / 3) * 4 + 64) }).strict().safeParse(input);
    if (!parsed.success) throw new SnapStudioError(400, 'That snap could not be read.');
    const entry = this.pending.get(parsed.data.photoId);
    if (entry === undefined || entry.token !== parsed.data.token) throw new SnapStudioError(404, 'That snap is no longer waiting to be saved.');
    if (entry.saved) throw new SnapStudioError(409, 'That snap was already saved.');
    const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/u.exec(parsed.data.image);
    const bytes = match?.[1] === undefined ? Buffer.alloc(0) : Buffer.from(match[1], 'base64');
    if (bytes.length < PNG_SIGNATURE.length || bytes.length > MAXIMUM_SNAP_BYTES || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new SnapStudioError(400, 'The finished snap is not a PNG picture.');
    entry.saved = true;
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    try {
      const savedAs = await this.write(entry, async (target) => { await writeFile(target, bytes, { flag: 'wx' }); });
      void this.postDiscord(entry, bytes, savedAs);
      return { savedAs, kind: 'snap' };
    } catch (error) { entry.saved = false; throw error; }
  }

  private async saveFallback(photoId: string): Promise<void> {
    const entry = this.pending.get(photoId);
    if (entry === undefined || entry.saved) return;
    entry.saved = true;
    try {
      const savedAs = await this.write(entry, async (target) => { await copyFile(entry.photoPath, target, 1 /* COPYFILE_EXCL */); });
      this.dependencies.logger.info('Snap overlay did not send the finished picture; the plain photo was saved', { savedAs });
      const bytes = await readFile(entry.photoPath).catch(() => undefined);
      if (bytes !== undefined) void this.postDiscord(entry, bytes, savedAs);
    } catch (error) { this.dependencies.logger.warn('Snap photo could not be saved', { error }); }
  }

  private async write(entry: PendingSnap, save: (target: string) => Promise<void>): Promise<string> {
    try {
      await mkdir(entry.folder, { recursive: true });
      // Never replace an earlier picture: two snaps in the same second get (2), (3) and so on.
      for (let attempt = 1; attempt <= 50; attempt += 1) {
        const name = `${entry.fileName}${attempt === 1 ? '' : ` (${String(attempt)})`}.png`;
        try { await save(join(entry.folder, name)); this.saved += 1; this.lastSavedAs = name; this.lastError = undefined; return name; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      }
      throw new Error('Too many pictures with the same name.');
    } catch (error) {
      this.lastError = `The snap could not be saved in ${entry.folder}: ${error instanceof Error ? error.message : String(error)}`;
      throw new SnapStudioError(500, this.lastError);
    }
  }

  private async postDiscord(entry: PendingSnap, bytes: Buffer, savedAs: string): Promise<void> {
    if (entry.discord === undefined || this.dependencies.discordPost === undefined || bytes.length > DISCORD_MAXIMUM_BYTES) return;
    try {
      const result = await this.dependencies.discordPost(entry.discord.webhookId, { content: entry.discord.content, username: entry.discord.username || 'Snap', files: [{ name: basename(savedAs), bytes, contentType: 'image/png' }] });
      if (!result.ok) this.dependencies.logger.warn('Snap Discord post failed', { error: result.error });
    } catch (error) { this.dependencies.logger.warn('Snap Discord post failed', { error }); }
  }

  /** Forgets old snaps and removes their plain photos from the working folder. */
  private async prune(): Promise<void> {
    const now = this.now();
    const entries = [...this.pending.values()].sort((left, right) => left.createdAt - right.createdAt);
    for (const [index, entry] of entries.entries()) {
      const expired = now - entry.createdAt > PHOTO_LIFETIME_MS;
      if (!expired && entries.length - index < MAXIMUM_PENDING) continue;
      if (!entry.saved) await this.saveFallback(entry.photoId);
      if (entry.timer !== undefined) clearTimeout(entry.timer);
      this.pending.delete(entry.photoId);
      await rm(entry.photoPath, { force: true }).catch(() => undefined);
    }
    // Photos left over from an earlier run.
    const known = new Set([...this.pending.values()].map((entry) => `${entry.photoId}.png`));
    for (const name of await readdir(this.photoDirectory).catch(() => [] as string[])) {
      if (known.has(name) || !/^[a-f0-9]{32}\.png$/u.test(name)) continue;
      const information = await stat(join(this.photoDirectory, name)).catch(() => undefined);
      if (information !== undefined && now - information.mtimeMs > PHOTO_LIFETIME_MS) await rm(join(this.photoDirectory, name), { force: true }).catch(() => undefined);
    }
  }

  /** On shutdown, any snap the overlay has not sent back yet is saved as its plain photo. */
  public async stop(): Promise<void> {
    for (const entry of [...this.pending.values()]) {
      if (entry.timer !== undefined) clearTimeout(entry.timer);
      if (!entry.saved) await this.saveFallback(entry.photoId);
    }
  }
}
