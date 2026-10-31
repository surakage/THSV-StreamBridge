import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { CredentialProtector } from './broadcast-connection-vault-service.js';
import type { Logger } from './logger.js';

// Console games cannot be seen from the PC, so Category Pilot can ask Xbox (through OpenXBL) and
// PlayStation (through PSN's web API) which game the creator is playing. The OpenXBL key and the
// PSN NPSSO are secrets: they are stored only as Windows-protected text, never logged and never
// sent back to the browser. Callers only learn whether one is saved.

export const CONSOLE_PLATFORMS = ['xbox', 'playstation'] as const;
export type ConsolePlatform = typeof CONSOLE_PLATFORMS[number];

export class ConsolePresenceError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

const OPENXBL_PRESENCE_URL = 'https://xbl.io/api/v2/presence';
// The PSN app's public client, as used by the open-source psn-api library. Sony does not document it.
const PSN_AUTH_BASE_URL = 'https://ca.account.sony.com/api/authz/v3/oauth';
const PSN_CLIENT_ID = '09515159-7237-4370-9b40-3806e67c0891';
const PSN_CLIENT_BASIC = 'MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=';
const PSN_REDIRECT_URI = 'com.scee.psxandroid.scecompcall://redirect';
const PSN_SCOPE = 'psn:mobile.v2.core psn:clientapp';
const PSN_PRESENCE_URL = 'https://m.np.playstation.com/api/userProfile/v1/internal/users/me/basicPresences?type=primary';
const REQUEST_TIMEOUT_MS = 10_000;
const MAXIMUM_RESPONSE_BYTES = 256 * 1024;
const MAXIMUM_BACKOFF_MS = 15 * 60_000;
// Xbox reports the dashboard and apps as titles too. These are never a game.
const XBOX_NON_GAME_TITLES = new Set(['home', 'online', 'xbox app', 'xbox', 'settings', 'microsoft store', 'store', 'youtube', 'netflix', 'twitch', 'spotify', 'party', 'guide']);

const storedSchema = z.object({ version: z.literal(1), xbox: z.string().min(1).max(16_384).optional(), playstation: z.string().min(1).max(16_384).optional() }).strict();
const configureSchema = z.object({
  xboxApiKey: z.string().max(512).optional(),
  playstationNpsso: z.string().max(2_048).optional(),
  clear: z.array(z.enum(CONSOLE_PLATFORMS)).max(2).optional(),
}).strict();

function cleanTitle(value: unknown): string {
  return typeof value === 'string' ? Array.from(value.replace(/[\p{Cc}]+/gu, ' ').replace(/\s+/gu, ' ').trim()).slice(0, 100).join('') : '';
}

/** The same game name, whatever the case, spacing or trademark signs. */
export function consoleTitleKey(value: unknown): string {
  return cleanTitle(value).replace(/[™®©]/gu, '').replace(/\s+/gu, ' ').trim().toLowerCase();
}

/** The game in the foreground of the creator's own Xbox presence, or '' when none. */
export function xboxTitleFromPresence(body: unknown): string {
  const people = Array.isArray(body) ? body : body !== null && typeof body === 'object' ? [body] : [];
  const titles: Array<Record<string, unknown>> = [];
  for (const person of people.slice(0, 4)) {
    if (person === null || typeof person !== 'object') continue;
    const devices = (person as Record<string, unknown>)['devices'];
    if (!Array.isArray(devices)) continue;
    for (const device of devices.slice(0, 8)) {
      const deviceTitles = device !== null && typeof device === 'object' ? (device as Record<string, unknown>)['titles'] : undefined;
      if (Array.isArray(deviceTitles)) for (const title of deviceTitles.slice(0, 16)) if (title !== null && typeof title === 'object') titles.push(title as Record<string, unknown>);
    }
  }
  const candidates = titles.filter((title) => {
    const name = cleanTitle(title['name']);
    const state = typeof title['state'] === 'string' ? title['state'].toLowerCase() : 'active';
    return name !== '' && state === 'active' && !XBOX_NON_GAME_TITLES.has(consoleTitleKey(name));
  });
  const full = candidates.find((title) => typeof title['placement'] === 'string' && title['placement'].toLowerCase() === 'full');
  return cleanTitle((full ?? candidates[0])?.['name']);
}

/** The game in the creator's own PSN basic presence, or '' when none. */
export function playstationTitleFromPresence(body: unknown): string {
  const presence = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)['basicPresence'] : undefined;
  if (presence === null || typeof presence !== 'object') return '';
  const list = (presence as Record<string, unknown>)['gameTitleInfoList'];
  if (!Array.isArray(list)) return '';
  for (const entry of list.slice(0, 8)) {
    const name = entry !== null && typeof entry === 'object' ? cleanTitle((entry as Record<string, unknown>)['titleName']) : '';
    if (name !== '') return name;
  }
  return '';
}

/** Accepts the bare NPSSO or the whole {"npsso":"..."} answer from Sony's page. */
export function normalizeNpsso(value: string): string {
  const trimmed = value.trim();
  const fromJson = /"npsso"\s*:\s*"([A-Za-z0-9]+)"/u.exec(trimmed)?.[1];
  const candidate = fromJson ?? trimmed;
  if (!/^[A-Za-z0-9]{32,128}$/u.test(candidate)) throw new ConsolePresenceError(400, 'That does not look like an NPSSO. Copy only the long code from Sony\'s page.');
  return candidate;
}

export function normalizeOpenXblKey(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(trimmed)) throw new ConsolePresenceError(400, 'That does not look like an OpenXBL API key. Copy the key from your xbl.io profile.');
  return trimmed;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (Buffer.byteLength(text) > MAXIMUM_RESPONSE_BYTES) throw new ConsolePresenceError(502, 'The answer was too large.');
  try { return JSON.parse(text) as unknown; } catch { throw new ConsolePresenceError(502, 'The answer was not valid JSON.'); }
}

export class XboxPresenceClient {
  public constructor(private readonly fetcher: typeof fetch = fetch) {}

  public async currentTitle(apiKey: string): Promise<string> {
    const response = await this.fetcher(OPENXBL_PRESENCE_URL, { headers: { 'X-Authorization': apiKey, accept: 'application/json', 'accept-language': 'en-US' }, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (response.status === 401 || response.status === 403) throw new ConsolePresenceError(401, 'OpenXBL refused the API key. Save a new key.');
    if (response.status === 429) throw new ConsolePresenceError(429, 'OpenXBL says too many requests. It will try again later.');
    if (!response.ok) throw new ConsolePresenceError(502, `OpenXBL answered ${String(response.status)}.`);
    return xboxTitleFromPresence(await readJson(response));
  }
}

interface PsnTokens { readonly accessToken: string; readonly accessExpiresAt: number; readonly refreshToken: string; readonly refreshExpiresAt: number }

export class PlayStationPresenceClient {
  private tokens: PsnTokens | undefined;
  private tokensFor = '';

  public constructor(private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = () => Date.now(), private readonly redact?: (value: string) => void) {}

  /** Forgets the tokens, for example after a new NPSSO is saved. */
  public reset(): void { this.tokens = undefined; this.tokensFor = ''; }

  public async currentTitle(npsso: string): Promise<string> {
    const accessToken = await this.accessToken(npsso);
    let response = await this.presence(accessToken);
    if (response.status === 401) {
      // The access token was revoked early. Start again from the NPSSO once.
      this.reset();
      response = await this.presence(await this.accessToken(npsso));
    }
    if (response.status === 401 || response.status === 403) throw new ConsolePresenceError(401, 'PlayStation refused the sign-in. Save a new NPSSO.');
    if (response.status === 429) throw new ConsolePresenceError(429, 'PlayStation says too many requests. It will try again later.');
    if (!response.ok) throw new ConsolePresenceError(502, `PlayStation answered ${String(response.status)}.`);
    return playstationTitleFromPresence(await readJson(response));
  }

  private async presence(accessToken: string): Promise<Response> {
    return await this.fetcher(PSN_PRESENCE_URL, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  }

  private async accessToken(npsso: string): Promise<string> {
    const now = this.now();
    if (this.tokens !== undefined && this.tokensFor === npsso) {
      if (this.tokens.accessExpiresAt - 60_000 > now) return this.tokens.accessToken;
      if (this.tokens.refreshExpiresAt - 60_000 > now) {
        try { return this.store(npsso, await this.tokenRequest({ refresh_token: this.tokens.refreshToken, grant_type: 'refresh_token', token_format: 'jwt', scope: PSN_SCOPE })); }
        catch { this.reset(); }
      }
    }
    const code = await this.accessCode(npsso);
    return this.store(npsso, await this.tokenRequest({ code, redirect_uri: PSN_REDIRECT_URI, grant_type: 'authorization_code', token_format: 'jwt' }));
  }

  private async accessCode(npsso: string): Promise<string> {
    const query = new URLSearchParams({ access_type: 'offline', client_id: PSN_CLIENT_ID, redirect_uri: PSN_REDIRECT_URI, response_type: 'code', scope: PSN_SCOPE });
    const response = await this.fetcher(`${PSN_AUTH_BASE_URL}/authorize?${query.toString()}`, { headers: { cookie: `npsso=${npsso}` }, redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const location = response.headers.get('location') ?? '';
    const code = /[?&]code=([^&]+)/u.exec(location)?.[1];
    if (code === undefined) throw new ConsolePresenceError(401, 'PlayStation did not accept the NPSSO. Sign in on playstation.com and save a new one.');
    const decoded = decodeURIComponent(code);
    this.redact?.(decoded);
    return decoded;
  }

  private async tokenRequest(fields: Readonly<Record<string, string>>): Promise<PsnTokens> {
    const response = await this.fetcher(`${PSN_AUTH_BASE_URL}/token`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${PSN_CLIENT_BASIC}` },
      body: new URLSearchParams(fields).toString(),
    });
    if (!response.ok) throw new ConsolePresenceError(401, 'PlayStation did not give a sign-in token. Save a new NPSSO.');
    const body = await readJson(response) as Record<string, unknown>;
    const accessToken = typeof body['access_token'] === 'string' ? body['access_token'] : '';
    const refreshToken = typeof body['refresh_token'] === 'string' ? body['refresh_token'] : '';
    if (accessToken === '') throw new ConsolePresenceError(401, 'PlayStation did not give a sign-in token. Save a new NPSSO.');
    this.redact?.(accessToken);
    if (refreshToken !== '') this.redact?.(refreshToken);
    const seconds = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
    const now = this.now();
    return { accessToken, refreshToken, accessExpiresAt: now + seconds(body['expires_in'], 3_600) * 1_000, refreshExpiresAt: refreshToken === '' ? 0 : now + seconds(body['refresh_token_expires_in'], 0) * 1_000 };
  }

  private store(npsso: string, tokens: PsnTokens): string { this.tokens = tokens; this.tokensFor = npsso; return tokens.accessToken; }
}

export interface ConsolePresenceVaultDependencies { readonly protector: CredentialProtector; readonly redact?: (value: string) => void }

/** The saved OpenXBL key and PSN NPSSO, Windows-protected at rest. */
export class ConsolePresenceVault {
  private readonly path: string;
  private stored: z.infer<typeof storedSchema> = { version: 1 };
  private readonly plain = new Map<ConsolePlatform, string>();
  private loaded = false;

  public constructor(dataRoot: string, private readonly dependencies: ConsolePresenceVaultDependencies) { this.path = join(dataRoot, 'secrets', 'console-presence.json'); }

  public async start(): Promise<void> {
    if (this.loaded) return;
    try {
      if ((await stat(this.path)).size > 65_536) throw new Error('Oversized console sign-in file');
      this.stored = storedSchema.parse(JSON.parse(await readFile(this.path, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.loaded = true;
  }

  public saved(platform: ConsolePlatform): boolean { return this.stored[platform] !== undefined; }

  public status(): Readonly<Record<ConsolePlatform, { readonly saved: boolean }>> {
    return { xbox: { saved: this.saved('xbox') }, playstation: { saved: this.saved('playstation') } };
  }

  /** Returns the platforms whose secret changed. */
  public async configure(input: unknown): Promise<readonly ConsolePlatform[]> {
    await this.start();
    const checked = configureSchema.safeParse(input);
    if (!checked.success) throw new ConsolePresenceError(400, 'Paste an OpenXBL API key or an NPSSO, or choose one to remove.');
    const parsed = checked.data;
    const next = { ...this.stored };
    const changed: ConsolePlatform[] = [];
    for (const platform of parsed.clear ?? []) { if (platform === 'xbox') delete next.xbox; else delete next.playstation; this.plain.delete(platform); changed.push(platform); }
    if (parsed.xboxApiKey !== undefined && parsed.xboxApiKey.trim() !== '') {
      const key = normalizeOpenXblKey(parsed.xboxApiKey);
      next.xbox = await this.dependencies.protector.protect(key); this.plain.set('xbox', key); this.dependencies.redact?.(key); changed.push('xbox');
    }
    if (parsed.playstationNpsso !== undefined && parsed.playstationNpsso.trim() !== '') {
      const npsso = normalizeNpsso(parsed.playstationNpsso);
      next.playstation = await this.dependencies.protector.protect(npsso); this.plain.set('playstation', npsso); this.dependencies.redact?.(npsso); changed.push('playstation');
    }
    if (changed.length === 0) return [];
    this.stored = next;
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.stored, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.path);
    return [...new Set(changed)];
  }

  public async secret(platform: ConsolePlatform): Promise<string | undefined> {
    await this.start();
    const cached = this.plain.get(platform);
    if (cached !== undefined) return cached;
    const protectedValue = this.stored[platform];
    if (protectedValue === undefined) return undefined;
    const value = (await this.dependencies.protector.unprotect(protectedValue)).trim();
    this.dependencies.redact?.(value);
    this.plain.set(platform, value);
    return value;
  }
}

export interface ConsolePresenceSettings {
  readonly enabled: boolean;
  readonly requireLive: boolean;
  readonly intervalSeconds: number;
  readonly xbox: boolean;
  readonly playstation: boolean;
}

export interface ConsoleDetection { readonly platform: ConsolePlatform; readonly titleName: string }

export interface ConsolePlatformStatus {
  readonly saved: boolean;
  readonly enabled: boolean;
  readonly polling: boolean;
  readonly titleName: string;
  readonly checkedAt?: string;
  readonly error?: string;
}

export interface ConsolePresenceServiceDependencies {
  readonly vault: ConsolePresenceVault;
  readonly xbox: Pick<XboxPresenceClient, 'currentTitle'>;
  readonly playstation: Pick<PlayStationPresenceClient, 'currentTitle'> & { reset?(): void };
  /** Category Pilot's running settings, or undefined when it is not running. */
  readonly settings: () => ConsolePresenceSettings | undefined;
  readonly isLive: () => boolean;
  readonly emit: (detection: ConsoleDetection) => Promise<void>;
  readonly logger: Logger;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
  readonly now?: () => Date;
}

interface PlatformRuntime { timer: unknown; failures: number; lastEmitted: string | undefined; titleName: string; checkedAt?: string; error?: string | undefined; running: boolean }

/**
 * Asks Xbox and PlayStation which game is running, only while Category Pilot wants it (on, the
 * platform switched on, a key saved and, by default, while live). A changed game is handed to
 * Category Pilot, which suggests or applies the matching profile like a PC game. Errors back off.
 */
export class ConsolePresenceService {
  private readonly runtime: Record<ConsolePlatform, PlatformRuntime> = {
    xbox: { timer: undefined, failures: 0, lastEmitted: undefined, titleName: '', running: false },
    playstation: { timer: undefined, failures: 0, lastEmitted: undefined, titleName: '', running: false },
  };
  private stopped = true;

  public constructor(private readonly dependencies: ConsolePresenceServiceDependencies) {}

  public start(): void { this.stopped = false; this.refresh(); }

  private isStopped(): boolean { return this.stopped; }

  public stop(): void {
    this.stopped = true;
    for (const platform of CONSOLE_PLATFORMS) this.cancel(platform);
  }

  /** Re-checks whether each platform should poll, for example after going live or saving a key. */
  public refresh(): void {
    if (this.stopped) return;
    for (const platform of CONSOLE_PLATFORMS) {
      const wanted = this.wanted(platform);
      if (!wanted) { this.cancel(platform); this.runtime[platform].lastEmitted = undefined; this.runtime[platform].failures = 0; continue; }
      if (this.runtime[platform].timer === undefined && !this.runtime[platform].running) this.schedule(platform, 1_000);
    }
  }

  /** Forgets cached state for a platform whose secret changed. */
  public secretChanged(platform: ConsolePlatform): void {
    if (platform === 'playstation') this.dependencies.playstation.reset?.();
    const runtime = this.runtime[platform];
    this.cancel(platform);
    runtime.failures = 0; runtime.error = undefined; runtime.lastEmitted = undefined; runtime.titleName = '';
    this.refresh();
  }

  public status(): Readonly<Record<ConsolePlatform, ConsolePlatformStatus>> {
    const settings = this.dependencies.settings();
    const entry = (platform: ConsolePlatform): ConsolePlatformStatus => {
      const runtime = this.runtime[platform];
      return {
        saved: this.dependencies.vault.saved(platform),
        enabled: settings?.enabled === true && settings[platform],
        polling: runtime.timer !== undefined || runtime.running,
        titleName: runtime.titleName,
        ...(runtime.checkedAt === undefined ? {} : { checkedAt: runtime.checkedAt }),
        ...(runtime.error === undefined ? {} : { error: runtime.error }),
      };
    };
    return { xbox: entry('xbox'), playstation: entry('playstation') };
  }

  /** One check right now, for the Wizard's Test button. Does not change Category Pilot. */
  public async test(platform: ConsolePlatform): Promise<{ readonly ok: boolean; readonly titleName: string; readonly error?: string }> {
    const secret = await this.dependencies.vault.secret(platform);
    if (secret === undefined) return { ok: false, titleName: '', error: platform === 'xbox' ? 'Save an OpenXBL API key first.' : 'Save an NPSSO first.' };
    try { return { ok: true, titleName: await this.client(platform).currentTitle(secret) }; }
    catch (error) { return { ok: false, titleName: '', error: safeMessage(error) }; }
  }

  private wanted(platform: ConsolePlatform): boolean {
    const settings = this.dependencies.settings();
    if (settings === undefined || !settings.enabled || !settings[platform]) return false;
    if (!this.dependencies.vault.saved(platform)) return false;
    return !settings.requireLive || this.dependencies.isLive();
  }

  private client(platform: ConsolePlatform): Pick<XboxPresenceClient, 'currentTitle'> { return platform === 'xbox' ? this.dependencies.xbox : this.dependencies.playstation; }

  private intervalMs(): number {
    const seconds = this.dependencies.settings()?.intervalSeconds ?? 20;
    // OpenXBL's free plan allows a limited number of calls an hour, so never ask faster than every 30 seconds.
    return Math.min(300, Math.max(30, seconds)) * 1_000;
  }

  private schedule(platform: ConsolePlatform, delayMs: number): void {
    this.cancel(platform);
    const setTimer = this.dependencies.setTimer ?? ((callback: () => void, ms: number) => { const timer = setTimeout(callback, ms); timer.unref(); return timer; });
    this.runtime[platform].timer = setTimer(() => { this.runtime[platform].timer = undefined; void this.tick(platform); }, delayMs);
  }

  private cancel(platform: ConsolePlatform): void {
    const runtime = this.runtime[platform];
    if (runtime.timer === undefined) return;
    (this.dependencies.clearTimer ?? ((handle: unknown) => clearTimeout(handle as NodeJS.Timeout)))(runtime.timer);
    runtime.timer = undefined;
  }

  /** Runs one check. Exposed for tests. */
  public async tick(platform: ConsolePlatform): Promise<void> {
    const runtime = this.runtime[platform];
    if (this.stopped || runtime.running || !this.wanted(platform)) return;
    runtime.running = true;
    let nextDelay = this.intervalMs();
    try {
      const secret = await this.dependencies.vault.secret(platform);
      if (secret === undefined) return;
      const titleName = await this.client(platform).currentTitle(secret);
      runtime.failures = 0; runtime.error = undefined; runtime.titleName = titleName;
      runtime.checkedAt = (this.dependencies.now?.() ?? new Date()).toISOString();
      if (titleName !== runtime.lastEmitted && this.wanted(platform)) {
        runtime.lastEmitted = titleName;
        await this.dependencies.emit({ platform, titleName });
      }
    } catch (error) {
      runtime.failures += 1;
      runtime.error = safeMessage(error);
      const refused = error instanceof ConsolePresenceError && error.statusCode === 401;
      nextDelay = refused ? MAXIMUM_BACKOFF_MS : Math.min(MAXIMUM_BACKOFF_MS, nextDelay * 2 ** Math.min(runtime.failures, 6));
      this.dependencies.logger.warn('Console game check failed', { platform, failures: runtime.failures, retryInSeconds: Math.round(nextDelay / 1_000), reason: runtime.error });
    } finally {
      runtime.running = false;
      // stop() may have run while this check was waiting.
      if (!this.isStopped() && this.wanted(platform)) this.schedule(platform, nextDelay);
    }
  }
}

function safeMessage(error: unknown): string {
  if (error instanceof ConsolePresenceError) return error.message;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'The check timed out.';
  return 'The check could not reach the service.';
}
