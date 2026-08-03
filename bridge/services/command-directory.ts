import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { BridgeConfig } from '../../schemas/config.js';
import type { ModuleRegistry, CommandDirectoryModuleSource } from '../core/module-registry.js';

const PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok'] as const;
type CommandPlatform = (typeof PLATFORMS)[number];

export interface PublicCommandEntry {
  readonly id: string;
  readonly command: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly category: string;
  readonly source: string;
  readonly platforms: readonly CommandPlatform[];
  readonly minimumRole: 'viewer' | 'subscriber';
  readonly usage: string;
}

export interface PublicCommandCatalogue {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly catalogHash: string;
  readonly prefix: string;
  readonly commandCount: number;
  readonly categories: readonly Readonly<{ name: string; commands: readonly PublicCommandEntry[] }>[];
  readonly privacy: 'public-command-metadata-only';
}

export interface CommandDirectoryPublicationStatus {
  readonly enabled: boolean;
  readonly state: 'disabled' | 'ready' | 'published' | 'unchanged' | 'removed' | 'failed';
  readonly publicUrl?: string;
  readonly catalogHash?: string;
  readonly updatedAt?: string;
  readonly error?: string;
}

export interface CommandDirectoryPublishOptions {
  readonly publishUrl?: string;
  readonly tokenFile?: string;
  readonly request?: typeof fetch;
}

interface CommandMetadata {
  readonly category?: string;
  readonly description?: string;
  readonly usage?: string;
  readonly platforms?: readonly CommandPlatform[];
  readonly hidden?: boolean;
}

const METADATA: Readonly<Record<string, CommandMetadata>> = Object.freeze({
  'automated-shoutouts.shoutout': { category: 'Community', description: 'Share another creator with chat.', usage: 'so <channel>', platforms: ['twitch'] },
  'chat-guard.trust-viewer': { hidden: true },
  'clip-courier.create': { category: 'Clips', description: 'Create and deliver a clip from the current Twitch stream.', usage: 'clip', platforms: ['twitch'] },
  'fan-crown.claim': { category: 'Rewards', description: 'Claim the current Fan Crown when the configured entry method allows it.', usage: 'fancrown' },
  'first-five.claim': { category: 'Rewards', description: 'Claim the next available First Five place.', usage: 'firstfive' },
  'free-game-check.command': { category: 'Community', description: 'Get the current free-games information and Discord direction.', usage: 'freegames' },
  'prize-wheel.spin': { category: 'Games', description: 'Spin the configured prize wheel.', usage: 'spinwheel' },
  'raid-scout.suggest': { category: 'Community', description: 'Suggest a Twitch channel for the current stream raid list.', usage: 'raidsuggest <channel>', platforms: ['twitch'] },
  'user-translate.generic': { category: 'Accessibility', description: 'Translate text into the configured language.', usage: 'translate <text>' },
  'user-translate.language-code': { category: 'Accessibility', description: 'Translate text with a language command such as en, es, or fr.', usage: '<language> <text>' },
  'viewer-foundation.balance': { category: 'Points', description: 'Show your current viewer-points balance.', usage: 'points' },
  'viewer-spotlight.card': { category: 'Community', description: 'Request your Viewer Spotlight card.', usage: 'card' },
  'village-roll-call.checkin': { category: 'Community', description: 'Check in for the current Village Roll Call season.', usage: 'checkin' },
  'village-voice.speak': { category: 'Accessibility', description: 'Spend the configured reward or points to speak a message.', usage: 'speak <message>' },
  'village-draw.manage': { hidden: true },
  'quote-vault.add': { hidden: true },
  'quote-vault.approve': { hidden: true },
  'quote-vault.reject': { hidden: true },
  'quote-vault.pending': { hidden: true },
  'quote-vault.edit': { hidden: true },
  'quote-vault.delete': { hidden: true },
  'quote-vault.restore': { hidden: true },
  'quote-vault.stats': { hidden: true },
  'subathon-timer.start': { hidden: true },
  'subathon-timer.pause': { hidden: true },
  'subathon-timer.resume': { hidden: true },
  'subathon-timer.reset': { hidden: true },
  'subathon-timer.add-time': { hidden: true },
});

const MODULE_CATEGORIES: Readonly<Record<string, string>> = Object.freeze({
  'thsv.chat-play-pack': 'Games', 'thsv.village-jukebox': 'Music', 'thsv.quote-vault': 'Quotes',
  'thsv.viewer-lobby': 'Viewer Queue', 'thsv.village-draw': 'Giveaway', 'thsv.village-polls': 'Community',
  'thsv.custom-counter': 'Community', 'thsv.free-game-check': 'Community',
});

export class CommandDirectoryService {
  private publication: CommandDirectoryPublicationStatus;
  private readonly publishUrl: URL | undefined;
  private readonly tokenFile: string | undefined;
  private readonly request: typeof fetch;

  public constructor(
    private readonly config: BridgeConfig,
    private readonly modules: ModuleRegistry,
    options: CommandDirectoryPublishOptions = {},
  ) {
    this.publishUrl = safePublishUrl(options.publishUrl ?? process.env['THSV_COMMAND_DIRECTORY_PUBLISH_URL']);
    this.tokenFile = nonEmpty(options.tokenFile ?? process.env['THSV_COMMAND_DIRECTORY_PUBLISH_TOKEN_FILE']);
    this.request = options.request ?? fetch;
    const enabled = this.publishUrl !== undefined && this.tokenFile !== undefined;
    this.publication = { enabled, state: enabled ? 'ready' : 'disabled' };
  }

  public catalogue(now = new Date()): PublicCommandCatalogue {
    const entries = [...this.coreCommands(), ...this.addOnCommands(this.modules.commandDirectorySources())]
      .sort((left, right) => left.category.localeCompare(right.category) || left.command.localeCompare(right.command));
    const grouped = new Map<string, PublicCommandEntry[]>();
    for (const entry of entries) {
      const commands = grouped.get(entry.category) ?? [];
      commands.push(entry);
      grouped.set(entry.category, commands);
    }
    const categories = [...grouped.entries()].map(([name, commands]) => Object.freeze({ name, commands: Object.freeze(commands) }));
    const stable = JSON.stringify({ schemaVersion: 1, prefix: this.config.commands.prefix, categories, privacy: 'public-command-metadata-only' });
    return Object.freeze({
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      catalogHash: createHash('sha256').update(stable).digest('hex'),
      prefix: this.config.commands.prefix,
      commandCount: entries.length,
      categories: Object.freeze(categories),
      privacy: 'public-command-metadata-only',
    });
  }

  public html(catalogue = this.catalogue()): string {
    const commandCards = catalogue.categories.map((category) => `<section><h2>${escapeHtml(category.name)} <span>${String(category.commands.length)}</span></h2><div class="commands">${category.commands.map((entry) => `<article><div class="command"><code>${escapeHtml(catalogue.prefix + entry.command)}</code>${entry.aliases.length > 0 ? `<small>Aliases: ${escapeHtml(entry.aliases.map((alias) => catalogue.prefix + alias).join(', '))}</small>` : ''}</div><p>${escapeHtml(entry.description)}</p><dl><div><dt>Usage</dt><dd><code>${escapeHtml(catalogue.prefix + entry.usage)}</code></dd></div><div><dt>Platforms</dt><dd>${escapeHtml(entry.platforms.map(platformLabel).join(' · '))}</dd></div></dl></article>`).join('')}</div></section>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stream Commands</title><style>${PAGE_STYLES}</style></head><body><main><header><p class="eyebrow">THSV STREAMBRIDGE</p><h1>Stream commands</h1><p>Commands currently available on this stream, grouped so they are easy to find.</p><div class="summary"><strong>${String(catalogue.commandCount)}</strong> public commands <span>Updated ${escapeHtml(catalogue.generatedAt)}</span></div></header>${commandCards || '<p class="empty">No public viewer commands are currently enabled.</p>'}<footer>Only public command names, usage, and platform availability are included. Private settings and creator controls are never published.</footer></main></body></html>`;
  }

  public publicationStatus(): CommandDirectoryPublicationStatus { return this.publication; }

  public async publish(): Promise<CommandDirectoryPublicationStatus> {
    if (this.publishUrl === undefined || this.tokenFile === undefined) return this.publication;
    try {
      const token = (await readFile(this.tokenFile, 'utf8')).trim();
      if (token.length < 32 || token.length > 256) throw new Error('The command-directory publish token must contain 32-256 characters.');
      const catalogue = this.catalogue();
      const response = await this.request(this.publishUrl, {
        method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(catalogue),
      });
      const body = await boundedJson(response, 16_384);
      if (!response.ok || body['accepted'] !== true) throw new Error(responseMessage(response, body));
      const publicUrl = resolvedPublicUrl(this.publishUrl, body['publicUrl']);
      this.publication = {
        enabled: true, state: body['changed'] === false ? 'unchanged' : 'published', publicUrl,
        catalogHash: catalogue.catalogHash, updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.publication = { enabled: true, state: 'failed', updatedAt: new Date().toISOString(), error: safePublicationError(error) };
    }
    return this.publication;
  }

  public async removePublished(): Promise<CommandDirectoryPublicationStatus> {
    if (this.publishUrl === undefined || this.tokenFile === undefined) return this.publication;
    try {
      const token = (await readFile(this.tokenFile, 'utf8')).trim();
      if (token.length < 32 || token.length > 256) throw new Error('The command-directory publish token must contain 32-256 characters.');
      const response = await this.request(this.publishUrl, {
        method: 'DELETE', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${token}` },
      });
      const body = await boundedJson(response, 16_384);
      if (!response.ok || body['deleted'] !== true) throw new Error(responseMessage(response, body));
      this.publication = { enabled: true, state: 'removed', updatedAt: new Date().toISOString() };
    } catch (error) {
      this.publication = { enabled: true, state: 'failed', updatedAt: new Date().toISOString(), error: safePublicationError(error) };
    }
    return this.publication;
  }

  private coreCommands(): PublicCommandEntry[] {
    if (!this.config.commands.enabled) return [];
    return this.config.commands.definitions.flatMap((definition, index) => {
      if (definition.minimumRole === 'moderator' || definition.minimumRole === 'broadcaster') return [];
      return [Object.freeze({
        id: `core.${String(index)}.${definition.name}`, command: definition.name, aliases: Object.freeze([...definition.aliases]),
        description: 'Creator-configured stream command.', category: 'Stream Commands', source: 'Command Sync',
        platforms: PLATFORMS, minimumRole: definition.minimumRole, usage: definition.name,
      })];
    });
  }

  private addOnCommands(sources: readonly CommandDirectoryModuleSource[]): PublicCommandEntry[] {
    return sources.flatMap((source) => {
      if (source.status === 'failed') return [];
      return source.commandsProvided.flatMap((provided) => {
        const metadata = METADATA[provided.id] ?? {};
        if (metadata.hidden === true || isCreatorControl(provided.id, provided.name)) return [];
        const command = commandFromName(provided.name);
        if (command.length === 0) return [];
        const category = metadata.category ?? MODULE_CATEGORIES[source.moduleId] ?? source.moduleName;
        return [Object.freeze({
          id: `${source.moduleId}.${provided.id}`, command, aliases: Object.freeze([]),
          description: metadata.description ?? `Use the ${source.moduleName} ${humanize(command)} command.`,
          category, source: source.moduleName, platforms: metadata.platforms ?? PLATFORMS,
          minimumRole: 'viewer' as const, usage: metadata.usage ?? command,
        })];
      });
    });
  }
}

function commandFromName(name: string): string {
  return (name.trim().match(/^!?([a-z][a-z0-9-]{0,63})/iu)?.[1] ?? '').toLowerCase();
}

function isCreatorControl(id: string, name: string): boolean {
  return /(?:^|[.-])(admin|approve|reject|delete|restore|edit|pending|reset|start|pause|resume|manage|skip|add-time|add)$/iu.test(id)
    || /\b(?:moderator|trusted|creator|admin)\b/iu.test(name);
}

function humanize(value: string): string { return value.replaceAll('-', ' '); }
function platformLabel(value: CommandPlatform): string { return ({ twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok' } as const)[value]; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character); }

function nonEmpty(value: string | undefined): string | undefined { const trimmed = value?.trim(); return trimmed ? trimmed : undefined; }
function safePublishUrl(value: string | undefined): URL | undefined {
  const normalized = nonEmpty(value); if (normalized === undefined) return undefined;
  try {
    const url = new URL(normalized);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return undefined;
    if (url.username || url.password || url.hash) return undefined;
    return url;
  } catch { return undefined; }
}
async function boundedJson(response: Response, maximumBytes: number): Promise<Record<string, unknown>> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error('The command-directory publisher returned an oversized response.');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maximumBytes) throw new Error('The command-directory publisher returned an oversized response.');
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('The command-directory publisher returned an invalid response.');
  return value as Record<string, unknown>;
}
function responseMessage(response: Response, body: Record<string, unknown>): string {
  const detail = typeof body['error'] === 'string' ? body['error'].slice(0, 240) : `HTTP ${String(response.status)}`;
  return `Command-directory publication failed: ${detail}`;
}
function resolvedPublicUrl(publishUrl: URL, value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048) throw new Error('The publisher did not return a valid public URL.');
  const resolved = new URL(value, publishUrl.origin);
  if (resolved.protocol !== 'https:' && !(resolved.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(resolved.hostname))) throw new Error('The publisher returned an unsafe public URL.');
  return resolved.toString();
}
function safePublicationError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'The command-directory publisher timed out after 10 seconds.';
  return error instanceof Error ? error.message.slice(0, 300) : 'Command-directory publication failed.';
}

const PAGE_STYLES = `:root{color-scheme:dark;--bg:#08121a;--panel:#101f2a;--line:#294353;--text:#f4f7f8;--muted:#a9bbc6;--accent:#4bd6c8}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#17313d 0,#08121a 42rem);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}main{width:min(1100px,calc(100% - 32px));margin:auto;padding:48px 0}header{padding:28px;border:1px solid var(--line);border-radius:22px;background:rgba(16,31,42,.9)}.eyebrow{margin:0;color:var(--accent);font-size:.78rem;font-weight:800;letter-spacing:.16em}h1{font-size:clamp(2.2rem,7vw,4.4rem);line-height:1;margin:.25rem 0 1rem}header>p:not(.eyebrow){max-width:650px;color:var(--muted)}.summary{display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap}.summary strong{font-size:1.8rem;color:var(--accent)}.summary span{margin-left:auto;color:var(--muted);font-size:.82rem}section{margin-top:34px}h2{display:flex;gap:.6rem;align-items:center}h2 span{display:inline-grid;place-items:center;min-width:1.8rem;height:1.8rem;border-radius:999px;background:var(--accent);color:#06201e;font-size:.85rem}.commands{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:14px}article{padding:20px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}article p{color:var(--muted);min-height:3em}.command{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.command>code{font-size:1.08rem;color:var(--accent);font-weight:800}.command small{color:var(--muted);text-align:right}dl{margin:0;display:grid;gap:8px}dl div{display:grid;grid-template-columns:74px 1fr;gap:8px}dt{color:var(--muted);font-size:.82rem}dd{margin:0;font-size:.9rem}code{overflow-wrap:anywhere}footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}.empty{padding:24px;border:1px dashed var(--line);border-radius:14px}@media(max-width:520px){main{width:min(100% - 20px,1100px);padding-top:20px}header{padding:20px}.summary span{width:100%;margin:0}}`;
