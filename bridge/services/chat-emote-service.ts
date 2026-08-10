import type { NormalizedEvent } from '../../schemas/event.js';
import type { Logger } from './logger.js';

type EmoteProvider = 'bttv' | 'ffz' | '7tv';
interface CatalogEmote { readonly name: string; readonly imageUrl: string; readonly provider: EmoteProvider }
interface CacheEntry { readonly emotes: ReadonlyMap<string, CatalogEmote>; readonly expiresAt: number }

const CACHE_MS = 30 * 60_000;
const REQUEST_TIMEOUT_MS = 3_000;
const COLD_MESSAGE_WAIT_MS = 1_250;
const MAX_CATALOG_EMOTES = 20_000;
const SUPPORTED = new Set(['twitch', 'youtube', 'kick']);

/** Adds third-party emotes without sending viewer names or message text to any provider. */
export class ChatEmoteService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly warming = new Map<string, Promise<void>>();

  public constructor(private readonly logger: Logger, private readonly fetcher: typeof fetch = fetch) {}

  public enrich(event: NormalizedEvent): NormalizedEvent {
    if (event.eventType !== 'chat.message' || !SUPPORTED.has(event.platform)) return event;
    const message = event.payload['message'];
    if (typeof message !== 'string') return event;
    const catalog = this.cache.get(cacheKey(event));
    if (catalog === undefined) return event;
    const nativeFragments = event.payload['fragments'];
    const fragments = Array.isArray(nativeFragments)
      ? enrichExistingFragments(nativeFragments, catalog.emotes)
      : catalogFragments(message, catalog.emotes);
    return fragments === undefined ? event : { ...event, payload: { ...event.payload, fragments } };
  }

  public async enrichAfterWarm(event: NormalizedEvent): Promise<NormalizedEvent> {
    if (event.eventType !== 'chat.message' || !SUPPORTED.has(event.platform)) {
      void this.warm(event);
      return event;
    }
    await waitAtMost(this.warm(event), COLD_MESSAGE_WAIT_MS);
    return this.enrich(event);
  }

  public warm(event: NormalizedEvent): Promise<void> {
    if (!SUPPORTED.has(event.platform) || (event.eventType !== 'chat.message' && event.eventType !== 'stream.online')) return Promise.resolve();
    const key = cacheKey(event);
    const cached = this.cache.get(key);
    if (cached !== undefined && cached.expiresAt > Date.now()) return Promise.resolve();
    const existing = this.warming.get(key);
    if (existing !== undefined) return existing;
    const task = this.load(event).then((emotes) => {
      this.cache.set(key, { emotes, expiresAt: Date.now() + CACHE_MS });
      this.logger.info('Chat emote catalog refreshed', { platform: event.platform, channelId: event.channel.id ?? '', emotes: emotes.size });
    }).catch((error: unknown) => this.logger.warn('Chat emote catalog refresh failed; plain text remains available', { platform: event.platform, error }))
      .finally(() => this.warming.delete(key));
    this.warming.set(key, task);
    return task;
  }

  private async load(event: NormalizedEvent): Promise<ReadonlyMap<string, CatalogEmote>> {
    const channelId = event.channel.id?.trim() ?? '';
    const jobs: Promise<CatalogEmote[]>[] = [this.loadSevenTv(event.platform, channelId)];
    if (event.platform === 'twitch' || event.platform === 'youtube') jobs.push(this.loadBttv(event.platform, channelId));
    if (event.platform === 'twitch') jobs.push(this.loadFfz(channelId));
    const settled = await Promise.allSettled(jobs);
    const catalog = new Map<string, CatalogEmote>();
    // Provider order is deterministic; channel-specific values returned later by each loader win.
    for (const result of settled) if (result.status === 'fulfilled') {
      for (const emote of result.value) if (catalog.size < MAX_CATALOG_EMOTES || catalog.has(emote.name)) catalog.set(emote.name, emote);
    }
    if (catalog.size === 0 && settled.every((result) => result.status === 'rejected')) throw new Error('All configured emote providers were unavailable.');
    return catalog;
  }

  private async loadBttv(platform: 'twitch' | 'youtube', channelId: string): Promise<CatalogEmote[]> {
    const payloads = await this.getAvailable(['https://api.betterttv.net/3/cached/emotes/global', ...(channelId === '' ? [] : [`https://api.betterttv.net/3/cached/users/${platform}/${encodeURIComponent(channelId)}`])]);
    const values = payloads.flatMap((payload) => unknownArray(payload) ?? objectArray(payload, 'sharedEmotes').concat(objectArray(payload, 'channelEmotes')));
    return values.flatMap((value) => {
      const item = record(value); const id = string(item?.['id']); const name = string(item?.['code']);
      return id && name ? [{ name, imageUrl: `https://cdn.betterttv.net/emote/${id}/2x.webp`, provider: 'bttv' as const }] : [];
    });
  }

  private async loadFfz(channelId: string): Promise<CatalogEmote[]> {
    const payloads = await this.getAvailable(['https://api.frankerfacez.com/v1/set/global', ...(channelId === '' ? [] : [`https://api.frankerfacez.com/v1/room/id/${encodeURIComponent(channelId)}`])]);
    return payloads.flatMap(ffzEmotes);
  }

  private async loadSevenTv(platform: string, channelId: string): Promise<CatalogEmote[]> {
    const payloads = await this.getAvailable(['https://7tv.io/v3/emote-sets/global', ...(channelId === '' ? [] : [`https://7tv.io/v3/users/${encodeURIComponent(platform)}/${encodeURIComponent(channelId)}`])]);
    return payloads.flatMap(sevenTvEmotes);
  }

  private async getJson(url: string): Promise<unknown> {
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { accept: 'application/json', 'user-agent': 'THSV-StreamBridge/3.5' } });
    if (!response.ok) throw new Error(`Emote provider returned HTTP ${String(response.status)}.`);
    return await response.json() as unknown;
  }

  private async getAvailable(urls: readonly string[]): Promise<unknown[]> {
    const settled = await Promise.allSettled(urls.map((url) => this.getJson(url)));
    const available = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (available.length === 0) throw new Error('Provider endpoints were unavailable.');
    return available;
  }
}

async function waitAtMost(task: Promise<void>, timeoutMs: number): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task,
      new Promise<void>((resolve) => { timeout = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function cacheKey(event: NormalizedEvent): string { return `${event.platform}:${event.channel.id ?? event.channel.name}`.toLocaleLowerCase('en-US'); }

function catalogFragments(message: string, catalog: ReadonlyMap<string, CatalogEmote>): Record<string, string>[] | undefined {
  const fragments: Record<string, string>[] = [];
  let cursor = 0; let found = false;
  for (const match of message.matchAll(/\S+/gu)) {
    const token = match[0]; const start = match.index; const emote = catalog.get(token);
    if (emote === undefined) continue;
    if (start > cursor) fragments.push({ type: 'text', text: message.slice(cursor, start) });
    fragments.push({ type: 'emote', name: token, imageUrl: emote.imageUrl, provider: emote.provider });
    cursor = start + token.length; found = true;
  }
  if (!found) return undefined;
  if (cursor < message.length) fragments.push({ type: 'text', text: message.slice(cursor) });
  return fragments;
}

function enrichExistingFragments(raw: unknown[], catalog: ReadonlyMap<string, CatalogEmote>): Record<string, string>[] | undefined {
  const result: Record<string, string>[] = []; let changed = false;
  for (const value of raw.slice(0, 200)) {
    const fragment = record(value);
    if (fragment?.['type'] === 'text' && typeof fragment['text'] === 'string') {
      const enriched = catalogFragments(fragment['text'], catalog);
      if (enriched !== undefined) { result.push(...enriched); changed = true; }
      else result.push({ type: 'text', text: fragment['text'] });
    } else if (fragment?.['type'] === 'emote' && typeof fragment['name'] === 'string' && typeof fragment['imageUrl'] === 'string' && typeof fragment['provider'] === 'string') {
      result.push({ type: 'emote', name: fragment['name'], imageUrl: fragment['imageUrl'], provider: fragment['provider'] });
    }
  }
  return changed ? result : undefined;
}

function ffzEmotes(payload: unknown): CatalogEmote[] {
  const sets = record(record(payload)?.['sets']); if (sets === undefined) return [];
  const result: CatalogEmote[] = [];
  for (const set of Object.values(sets)) for (const value of objectArray(set, 'emoticons')) {
    const item = record(value); const name = string(item?.['name']); const animated = record(item?.['animated']); const urls = record(item?.['urls']);
    const imageUrl = httpsUrl(string(animated?.['2']) || string(animated?.['1']) || string(urls?.['2']) || string(urls?.['1']));
    if (name && imageUrl) result.push({ name, imageUrl, provider: 'ffz' });
  }
  return result;
}

function sevenTvEmotes(payload: unknown): CatalogEmote[] {
  const root = record(payload); const set = record(root?.['emote_set']) ?? root;
  return objectArray(set, 'emotes').flatMap((value) => {
    const item = record(value); const name = string(item?.['name']); const data = record(item?.['data']); const host = record(data?.['host']); const base = string(host?.['url']);
    const files = objectArray(host, 'files').map(record).filter((file): file is Record<string, unknown> => file !== undefined);
    const preferred = files.find((file) => string(file['name']) === '2x.webp') ?? files.find((file) => string(file['format']).toUpperCase() === 'WEBP') ?? files[0];
    const filename = string(preferred?.['name']); const imageUrl = httpsUrl(base && filename ? `${base.startsWith('//') ? 'https:' : base}/${filename}` : '');
    return name && imageUrl ? [{ name, imageUrl, provider: '7tv' as const }] : [];
  });
}

function record(value: unknown): Record<string, unknown> | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function objectArray(value: unknown, key: string): unknown[] { const items = record(value)?.[key]; return Array.isArray(items) ? items.map((item: unknown) => item) : []; }
function unknownArray(value: unknown): unknown[] | undefined { return Array.isArray(value) ? value.map((item: unknown) => item) : undefined; }
function string(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function httpsUrl(value: string): string { try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : ''; } catch { return ''; } }
