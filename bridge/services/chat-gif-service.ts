import type { NormalizedEvent } from '../../schemas/event.js';

// Twitch chat GIFs. Twitch sends a GIF as its own message part with a GIPHY link, but Streamer.bot's chat
// action only passes the text ("[Some GIF by Someone]"). Streamer.bot's own WebSocket chat event does carry the
// parts, so StreamBridge listens to it, remembers the GIF by message ID, and puts the GIF back into the chat
// message before it reaches the overlay.

const REMEMBER_MS = 60_000;
const MAXIMUM_REMEMBERED = 300;
/** How long a chat message that looks like a GIF waits for Streamer.bot's event, which can arrive a moment later. */
const GIF_WAIT_MS = 1_500;
const GIF_PLACEHOLDER = /\[[^\]]{1,300}\bGIF\b[^\]]{0,300}\]/u;

export type ChatGifFragment =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'gif'; readonly url: string; readonly text: string };

interface Remembered { readonly fragments: readonly ChatGifFragment[]; readonly at: number }

/** Only GIPHY's own media hosts are shown, over HTTPS, as an image. */
export function trustedGifUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^(?:media\d*|i)\.giphy\.com$/u.test(url.hostname) && url.pathname.startsWith('/media/') && value.length <= 2_048;
  } catch { return false; }
}

/** The fragments of one Streamer.bot Twitch ChatMessage event, or undefined when it has no GIF. */
export function gifFragmentsFrom(message: Readonly<Record<string, unknown>>): { readonly messageId: string; readonly fragments: readonly ChatGifFragment[] } | undefined {
  const event = record(message['event']);
  if (event?.['source'] !== 'Twitch' || event['type'] !== 'ChatMessage') return undefined;
  const data = record(message['data']);
  const messageId = typeof data?.['messageId'] === 'string' ? data['messageId'].slice(0, 200) : '';
  const parts = Array.isArray(data?.['parts']) ? data['parts'].slice(0, 100) : [];
  if (messageId === '' || parts.length === 0) return undefined;
  const fragments: ChatGifFragment[] = [];
  let gifs = 0;
  for (const value of parts) {
    const part = record(value); if (part === undefined) continue;
    const text = typeof part['text'] === 'string' ? part['text'].replace(/\p{Cc}+/gu, ' ').slice(0, 500) : '';
    if (part['type'] === 'gif' && typeof part['url'] === 'string' && trustedGifUrl(part['url'])) { fragments.push({ type: 'gif', url: part['url'], text }); gifs += 1; }
    else if (text.length > 0) fragments.push({ type: 'text', text });
  }
  return gifs > 0 ? { messageId, fragments } : undefined;
}

export class ChatGifService {
  private readonly remembered = new Map<string, Remembered>();
  private readonly waiting = new Map<string, Array<() => void>>();

  public constructor(private readonly now: () => number = Date.now) {}

  /** Receives every Streamer.bot WebSocket broadcast; keeps only Twitch chat messages that contain a GIF. */
  public observe(message: Readonly<Record<string, unknown>>): void {
    const found = gifFragmentsFrom(message); if (found === undefined) return;
    this.prune();
    this.remembered.set(found.messageId, { fragments: found.fragments, at: this.now() });
    while (this.remembered.size > MAXIMUM_REMEMBERED) { const oldest = this.remembered.keys().next().value; if (oldest === undefined) break; this.remembered.delete(oldest); }
    for (const wake of this.waiting.get(found.messageId) ?? []) wake();
    this.waiting.delete(found.messageId);
  }

  /** Puts a remembered GIF into a Twitch chat message. A message that looks like a GIF waits briefly for it. */
  public async enrich(event: NormalizedEvent, waitMs = GIF_WAIT_MS): Promise<NormalizedEvent> {
    if (event.eventType !== 'chat.message' || event.platform !== 'twitch') return event;
    const messageId = event.source.eventId ?? '';
    const message = event.payload['message'];
    if (messageId === '' || typeof message !== 'string') return event;
    if (!this.remembered.has(messageId) && GIF_PLACEHOLDER.test(message) && waitMs > 0) await this.waitFor(messageId, waitMs);
    const found = this.remembered.get(messageId);
    if (found === undefined) return event;
    this.remembered.delete(messageId);
    return { ...event, payload: { ...event.payload, fragments: found.fragments.map((fragment) => ({ ...fragment })) } };
  }

  private waitFor(messageId: string, waitMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => { clearTimeout(timer); this.waiting.delete(messageId); resolve(); };
      const timer = setTimeout(done, waitMs);
      const list = this.waiting.get(messageId) ?? [];
      list.push(done); this.waiting.set(messageId, list);
    });
  }

  private prune(): void {
    const cutoff = this.now() - REMEMBER_MS;
    for (const [messageId, entry] of this.remembered) if (entry.at < cutoff) this.remembered.delete(messageId);
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
}
