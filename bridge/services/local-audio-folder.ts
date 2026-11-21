import { randomBytes } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize } from 'node:path';

// Sound folders on this PC, for extensions such as Random Sound. An extension names a folder; StreamBridge lists
// the sound files directly inside it (not subfolders) and gives each one a private address on the overlay server.
// Only files a listing returned can be played, and only by their random token, so the page can never ask for
// any other file on the PC.

export const LOCAL_AUDIO_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
  '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.webm': 'audio/webm',
});
export const LOCAL_AUDIO_ROUTE = /^\/overlay\/local-audio\/([a-f0-9]{32})\.(mp3|wav|ogg|oga|opus|flac|m4a|webm)$/u;
const MAXIMUM_FILES = 500;
const MAXIMUM_FILE_BYTES = 52_428_800;
const MAXIMUM_TOKENS = 5_000;

export interface LocalAudioFile { readonly name: string; readonly url: string; readonly bytes: number }
export interface LocalAudioListing { readonly folder: string; readonly files: readonly LocalAudioFile[]; readonly skipped: number }

export class LocalAudioFolderError extends Error {}

export class LocalAudioFolderService {
  private readonly tokens = new Map<string, string>();
  private readonly paths = new Map<string, string>();

  /** Lists the sound files directly inside an absolute folder path. Files over 50 MB and other file types are skipped. */
  public async list(folder: string): Promise<LocalAudioListing> {
    const path = cleanFolder(folder);
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new LocalAudioFolderError(code === 'ENOENT' ? 'That folder does not exist on this PC.' : code === 'ENOTDIR' ? 'That path is a file, not a folder.' : code === 'EACCES' || code === 'EPERM' ? 'StreamBridge is not allowed to open that folder.' : 'StreamBridge could not open that folder.');
    }
    const files: LocalAudioFile[] = [];
    let skipped = 0;
    const names = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true }));
    for (const name of names) {
      const extension = extname(name).toLowerCase();
      if (LOCAL_AUDIO_TYPES[extension] === undefined) continue;
      if (files.length >= MAXIMUM_FILES) { skipped += 1; continue; }
      const full = join(path, name);
      const size = await stat(full).then((info) => info.size, () => -1);
      if (size <= 0 || size > MAXIMUM_FILE_BYTES) { skipped += 1; continue; }
      files.push({ name, url: `/overlay/local-audio/${this.tokenFor(full)}${extension}`, bytes: size });
    }
    return { folder: path, files, skipped };
  }

  /** The file a token stands for, if a listing gave it out and its extension matches. */
  public resolve(token: string, extension: string): { readonly path: string; readonly contentType: string } | undefined {
    const path = this.paths.get(token);
    if (path === undefined || extname(path).toLowerCase() !== `.${extension.toLowerCase()}`) return undefined;
    const contentType = LOCAL_AUDIO_TYPES[`.${extension.toLowerCase()}`];
    return contentType === undefined ? undefined : { path, contentType };
  }

  private tokenFor(path: string): string {
    const known = this.tokens.get(path);
    if (known !== undefined) return known;
    if (this.tokens.size >= MAXIMUM_TOKENS) {
      const oldest = this.tokens.keys().next().value;
      if (oldest !== undefined) { this.paths.delete(this.tokens.get(oldest) ?? ''); this.tokens.delete(oldest); }
    }
    const token = randomBytes(16).toString('hex');
    this.tokens.set(path, token); this.paths.set(token, path);
    return token;
  }
}

export function cleanFolder(folder: unknown): string {
  const text = typeof folder === 'string' ? folder.trim().replace(/^"(.*)"$/u, '$1').trim() : '';
  if (text === '' || text.length > 400 || /\p{Cc}/u.test(text)) throw new LocalAudioFolderError('Type the full path of a folder on this PC, for example C:\\Users\\You\\Music\\Sounds.');
  if (/^[\\/]{2}/u.test(text)) throw new LocalAudioFolderError('Network folders are not supported. Copy the sounds to a folder on this PC.');
  const windowsPath = /^[A-Za-z]:[\\/]/u.test(text);
  if (!windowsPath && !isAbsolute(text)) throw new LocalAudioFolderError('Type the full path of the folder, starting with its drive, for example C:\\Users\\You\\Music\\Sounds.');
  return normalize(text);
}
