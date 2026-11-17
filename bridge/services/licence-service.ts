import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { CredentialProtector } from './broadcast-connection-vault-service.js';
import { cleanFreePlatformChoice, FREE_PLATFORM_LIMIT, licencePlan, STREAMING_PLATFORM_IDS, type LicencePlan, type PlanAtStart } from './licence-plan.js';
import type { Logger } from './logger.js';

// The StreamBridge licence: a Polar licence key the creator activates once on this PC.
//
// While StreamBridge is in beta every feature stays free, so a missing or expired licence never turns anything
// off; this only records whether the PC holds a valid licence. The key is a secret: it is stored only as
// Windows-protected text and never logged or returned, callers see the last four characters.
// Polar's customer-portal licence API needs no account secret (it is made for desktop apps), so the bridge talks to it directly.

export const LICENCE_API_BASE = 'https://api.polar.sh/v1/customer-portal/license-keys';
/**
 * The SlothBloom organization on Polar. Keys are looked up only inside it. When empty,
 * activation explains that licences are not on sale yet, and nothing is locked.
 */
export const LICENCE_ORGANIZATION_ID: string = '6ea53400-98e6-4a16-94d6-23b623b52015';
/**
 * The Polar licence-key benefits that count as StreamBridge Pro, with the plan name shown on the Licence card.
 * Once any are listed, keys from other benefits are refused.
 */
export const LICENCE_BENEFITS: Readonly<Record<string, string>> = {};
/**
 * Where creators buy a licence and read its terms and privacy notice. The Wizard shows only the links that are
 * set. The buy link is added once the live checkout exists.
 */
export const LICENCE_LINKS: Readonly<{ buy: string; terms: string; privacy: string }> = {
  buy: '',
  terms: 'https://www.slothbloom.com/terms',
  privacy: 'https://www.slothbloom.com/projects/thsv-streambridge/privacy',
};
/** A licence that could not be re-checked (offline) stays valid this long after its last successful check. */
export const LICENCE_OFFLINE_GRACE_DAYS = 14;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/u;

const storedSchema = z.object({
  version: z.literal(2),
  protectedKey: z.string().min(1).max(16_384),
  keyHint: z.string().max(16),
  activationId: z.string().min(1).max(256),
  instanceName: z.string().max(256),
  benefitId: z.string().max(256).optional(),
  status: z.enum(['active', 'expired', 'disabled', 'inactive']),
  productName: z.string().max(200).optional(),
  customerName: z.string().max(200).optional(),
  expiresAt: z.string().max(64).nullable().optional(),
  activatedAt: z.string().max(64),
  lastCheckedAt: z.string().max(64),
  lastError: z.string().max(300).optional(),
}).strict();
type StoredLicence = z.infer<typeof storedSchema>;

const licenceKeySchema = z.object({
  benefit_id: z.string().optional(),
  expires_at: z.string().nullable().optional(),
  customer: z.object({ name: z.string().nullable().optional() }).loose().nullable().optional(),
}).loose();
type PolarLicenceKey = z.infer<typeof licenceKeySchema>;
const activationSchema = z.object({ id: z.string().min(1), license_key: licenceKeySchema }).loose();
const errorSchema = z.object({ error: z.string().optional(), detail: z.unknown().optional() }).loose();

interface PolarReply { readonly status: number; readonly body: unknown }

export class LicenceError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

export interface LicenceStatus {
  readonly beta: true;
  /** True when this PC holds a licence that is active (or was, within the offline grace period). */
  readonly licensed: boolean;
  readonly state: 'none' | 'active' | 'expired' | 'disabled' | 'inactive' | 'unchecked';
  readonly keyHint?: string;
  readonly productName?: string;
  readonly customerName?: string;
  readonly expiresAt?: string | null;
  readonly activatedAt?: string;
  readonly lastCheckedAt?: string;
  readonly lastError?: string;
  /** The free or Pro plan of this PC and the list of Pro extensions. Nothing is locked while `plan.enforced` is false. */
  readonly plan: LicencePlan;
  /** The streaming platforms the creator picked to keep on the free plan, in order. Empty means the first ones turned on. */
  readonly freePlatforms: readonly string[];
  /** The plan this run started with and what it left off. A newly bought or ended licence applies at the next start. */
  readonly startedWith?: PlanAtStart;
  /** Buy, terms and privacy pages; only https links that are set. */
  readonly links?: Readonly<Partial<Record<'buy' | 'terms' | 'privacy', string>>>;
}

export interface LicenceServiceDependencies {
  readonly protector: CredentialProtector;
  readonly logger: Logger;
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
  readonly instanceName?: string;
  /** The Polar organization; defaults to LICENCE_ORGANIZATION_ID. */
  readonly organizationId?: string;
  /** Benefit id to plan name; defaults to LICENCE_BENEFITS. */
  readonly benefits?: Readonly<Record<string, string>>;
  readonly links?: Readonly<Partial<Record<'buy' | 'terms' | 'privacy', string>>>;
}

export function licenceKeyHint(key: string): string { return `…${key.slice(-4).toUpperCase()}`; }

export class LicenceService {
  private readonly path: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private licence: StoredLicence | undefined;
  private loaded: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private startedWith: PlanAtStart | undefined;
  private readonly freePlatformsPath: string;
  private freePlatforms: readonly string[] = [];

  public constructor(dataRoot: string, private readonly dependencies: LicenceServiceDependencies) {
    this.path = join(dataRoot, 'secrets', 'licence.json');
    this.freePlatformsPath = join(dataRoot, 'state', 'free-platforms.json');
    this.fetcher = dependencies.fetcher ?? fetch;
    this.now = dependencies.now ?? (() => new Date());
  }

  public start(): Promise<void> {
    this.loaded ??= this.load();
    return this.loaded;
  }

  /** Re-checks the saved licence now and then once a day. Failures are logged; nothing is ever turned off. */
  public startDailyCheck(): void {
    if (this.timer !== undefined) return;
    const run = (): void => { void this.check().catch((error: unknown) => { this.dependencies.logger.warn('Licence check failed', { error: error instanceof Error ? error.message : String(error) }); }); };
    run();
    this.timer = setInterval(run, CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  /** Records the plan the bridge started with, so the Wizard can say what is off and that a change needs a restart. */
  public noteStart(started: PlanAtStart): void { this.startedWith = started; }

  public stop(): void { if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined; }

  public status(): LicenceStatus {
    const status = { ...this.currentStatus(), freePlatforms: this.freePlatforms };
    return this.startedWith === undefined ? status : { ...status, startedWith: this.startedWith };
  }

  /** Saves which streaming platforms stay on with the free plan. Like any plan change, it applies at the next start. */
  public async chooseFreePlatforms(input: unknown): Promise<LicenceStatus> {
    await this.start();
    const parsed = z.object({ platforms: z.array(z.enum(STREAMING_PLATFORM_IDS as [string, ...string[]])).max(FREE_PLATFORM_LIMIT) }).strict().safeParse(input);
    if (!parsed.success || new Set(parsed.data.platforms).size !== parsed.data.platforms.length) throw new LicenceError(400, `Pick up to ${String(FREE_PLATFORM_LIMIT)} different platforms.`);
    this.freePlatforms = parsed.data.platforms;
    await mkdir(dirname(this.freePlatformsPath), { recursive: true });
    const temporary = `${this.freePlatformsPath}.${String(process.pid)}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, platforms: this.freePlatforms }, null, 2)}\n`, 'utf8');
    await rename(temporary, this.freePlatformsPath);
    return this.status();
  }

  private currentStatus(): Omit<LicenceStatus, 'freePlatforms'> {
    const licence = this.licence;
    const links = licenceLinks(this.dependencies.links ?? LICENCE_LINKS);
    if (licence === undefined) return { beta: true, licensed: false, state: 'none', plan: licencePlan(false), ...links };
    const lastChecked = Date.parse(licence.lastCheckedAt);
    const withinGrace = Number.isFinite(lastChecked) && this.now().getTime() - lastChecked <= LICENCE_OFFLINE_GRACE_DAYS * CHECK_INTERVAL_MS;
    const licensed = licence.status === 'active' && withinGrace;
    return {
      beta: true, licensed, state: licence.status === 'active' && !withinGrace ? 'unchecked' : licence.status,
      keyHint: licence.keyHint,
      ...(licence.productName === undefined ? {} : { productName: licence.productName }),
      ...(licence.customerName === undefined ? {} : { customerName: licence.customerName }),
      ...(licence.expiresAt === undefined ? {} : { expiresAt: licence.expiresAt }),
      activatedAt: licence.activatedAt, lastCheckedAt: licence.lastCheckedAt, plan: licencePlan(licensed), ...links,
      ...(licence.lastError === undefined ? {} : { lastError: licence.lastError }),
    };
  }

  /** Activates a key on this PC. A key already saved here is released first, so it never uses two activations. */
  public async activate(input: unknown): Promise<LicenceStatus> {
    await this.start();
    const parsed = z.object({ key: z.string().trim() }).strict().safeParse(input);
    const key = parsed.success ? parsed.data.key : '';
    if (!KEY_PATTERN.test(key)) throw new LicenceError(400, 'Paste the licence key from your purchase email.');
    if (this.organizationId() === '') throw new LicenceError(503, 'StreamBridge licences are not on sale yet. Everything works for free during the beta.');
    const instanceName = (this.dependencies.instanceName ?? `StreamBridge on ${hostname()}`).slice(0, 200);
    const reply = await this.call('activate', { key, label: instanceName, meta: { app: 'StreamBridge' } });
    if (reply.status !== 200) throw new LicenceError(400, friendlyError(reply));
    const activation = activationSchema.safeParse(reply.body);
    if (!activation.success) throw new LicenceError(502, 'The licence server answered with something unexpected.');
    const licenceKey = activation.data.license_key;
    if (!this.isStreamBridge(licenceKey)) {
      await this.call('deactivate', { key, activation_id: activation.data.id }).catch(() => undefined);
      throw new LicenceError(400, 'That key is not a StreamBridge licence.');
    }
    if (this.licence !== undefined) await this.deactivate().catch(() => undefined);
    const now = this.now().toISOString();
    this.licence = {
      version: 2, protectedKey: await this.dependencies.protector.protect(key), keyHint: licenceKeyHint(key),
      activationId: activation.data.id, instanceName, status: this.statusOf(licenceKey), activatedAt: now, lastCheckedAt: now,
      ...this.details(licenceKey),
    };
    await this.save();
    this.dependencies.logger.info('Licence activated on this PC', { keyHint: this.licence.keyHint, status: this.licence.status });
    return this.status();
  }

  /** Re-checks the saved key with Polar. Offline, the last result is kept until the grace period ends. */
  public async check(): Promise<LicenceStatus> {
    await this.start();
    const licence = this.licence;
    if (licence === undefined) return this.status();
    let reply: PolarReply;
    try {
      reply = await this.call('validate', { key: await this.dependencies.protector.unprotect(licence.protectedKey), activation_id: licence.activationId });
      // Anything but a clear yes or no (a server error, a rate limit) counts as "could not check" and keeps the grace period.
      if (reply.status !== 200 && reply.status !== 404) throw new LicenceError(502, `The licence server refused the request (${String(reply.status)}).`);
    } catch (error) {
      this.licence = { ...licence, lastError: 'The licence server could not be reached. StreamBridge keeps working and checks again later.' };
      await this.save();
      throw error;
    }
    const rest: StoredLicence = { ...licence };
    delete rest.lastError;
    if (reply.status === 200) {
      const validated = licenceKeySchema.safeParse(reply.body);
      const licenceKey = validated.success ? validated.data : {};
      this.licence = { ...rest, status: this.statusOf(licenceKey), lastCheckedAt: this.now().toISOString(), ...this.details(licenceKey) };
    } else {
      // Polar answers 404 for a key that was refunded, cancelled, disabled or has expired, and for a released activation.
      const detail = errorDetail(reply).toLowerCase();
      const status: StoredLicence['status'] = detail.includes('expired') ? 'expired' : /revoked|disabled/u.test(detail) ? 'disabled' : 'inactive';
      this.licence = { ...rest, status, lastCheckedAt: this.now().toISOString(), lastError: friendlyError(reply) };
    }
    await this.save();
    return this.status();
  }

  /** Releases this PC's activation so the key can be used on another PC, and forgets the key. */
  public async deactivate(): Promise<LicenceStatus> {
    await this.start();
    const licence = this.licence;
    if (licence === undefined) return this.status();
    const key = await this.dependencies.protector.unprotect(licence.protectedKey).catch(() => '');
    if (key !== '') {
      const reply = await this.call('deactivate', { key, activation_id: licence.activationId }).catch((error: unknown) => {
        throw new LicenceError(502, `The licence server could not be reached, so this PC still uses one activation. ${error instanceof Error ? error.message : ''}`.trim());
      });
      // 204 is released; 404 means the key or this activation is already gone, so there is nothing left to release.
      if (reply.status !== 204 && reply.status !== 200 && reply.status !== 404) throw new LicenceError(400, friendlyError(reply));
    }
    this.licence = undefined;
    await this.save();
    this.dependencies.logger.info('Licence removed from this PC', { keyHint: licence.keyHint });
    return this.status();
  }

  private organizationId(): string { return (this.dependencies.organizationId ?? LICENCE_ORGANIZATION_ID).trim(); }

  private benefits(): Readonly<Record<string, string>> { return this.dependencies.benefits ?? LICENCE_BENEFITS; }

  private isStreamBridge(licenceKey: PolarLicenceKey): boolean {
    const benefits = this.benefits();
    return Object.keys(benefits).length === 0 || Object.hasOwn(benefits, licenceKey.benefit_id ?? '');
  }

  private statusOf(licenceKey: PolarLicenceKey): StoredLicence['status'] {
    const expires = Date.parse(licenceKey.expires_at ?? '');
    return Number.isFinite(expires) && expires <= this.now().getTime() ? 'expired' : 'active';
  }

  private details(licenceKey: PolarLicenceKey): Pick<StoredLicence, 'benefitId' | 'productName' | 'customerName' | 'expiresAt'> {
    const benefitId = licenceKey.benefit_id;
    const productName = benefitId === undefined ? undefined : this.benefits()[benefitId];
    const customerName = licenceKey.customer?.name ?? undefined;
    return {
      ...(benefitId === undefined ? {} : { benefitId: benefitId.slice(0, 256) }),
      ...(productName === undefined ? {} : { productName: productName.slice(0, 200) }),
      ...(customerName === undefined || customerName === '' ? {} : { customerName: customerName.slice(0, 200) }),
      ...(licenceKey.expires_at === undefined ? {} : { expiresAt: licenceKey.expires_at }),
    };
  }

  private async call(operation: 'activate' | 'validate' | 'deactivate', body: Record<string, unknown>): Promise<PolarReply> {
    const response = await this.fetcher(`${LICENCE_API_BASE}/${operation}`, {
      method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, organization_id: this.organizationId() }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (text.trim() === '') return { status: response.status, body: undefined };
    try { return { status: response.status, body: JSON.parse(text) as unknown }; }
    catch { throw new LicenceError(502, `The licence server answered with something unexpected (${String(response.status)}).`); }
  }

  private async load(): Promise<void> {
    await this.loadFreePlatforms();
    let text: string;
    try { text = await readFile(this.path, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    const saved = JSON.parse(text) as unknown;
    if (saved === null) return;
    const parsed = storedSchema.safeParse(saved);
    if (parsed.success) this.licence = parsed.data;
    else if ((saved as { version?: unknown }).version === 1) this.dependencies.logger.info('A Lemon Squeezy licence from the beta was set aside. Activate a Polar licence key to use it again.');
    else this.dependencies.logger.warn('The saved licence file is damaged and was ignored');
  }

  private async loadFreePlatforms(): Promise<void> {
    try { this.freePlatforms = cleanFreePlatformChoice((JSON.parse(await readFile(this.freePlatformsPath, 'utf8')) as { platforms?: unknown }).platforms); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.dependencies.logger.warn('The saved free-platform choice could not be read and was ignored'); }
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${String(process.pid)}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.licence ?? null, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.path);
  }
}

function errorDetail(reply: PolarReply): string {
  const parsed = errorSchema.safeParse(reply.body);
  if (!parsed.success) return '';
  const detail = parsed.data.detail;
  if (typeof detail === 'string') return detail;
  // A 422 lists what was wrong with the request; for a key that is almost always its format.
  return Array.isArray(detail) ? 'invalid' : parsed.data.error ?? '';
}

function friendlyError(reply: PolarReply): string {
  const text = errorDetail(reply).toLowerCase();
  if (text.includes('activation limit')) return 'This key is already active on as many PCs as it allows. Remove it from another PC first.';
  if (reply.status === 403 && /revoked|disabled|expired/u.test(text)) return 'This licence is no longer active (expired, cancelled or refunded). Contact support if that is a mistake.';
  if (text.includes('expired')) return 'This licence has expired.';
  if (/revoked|disabled/u.test(text)) return 'This licence was turned off. Contact support if that is a mistake.';
  if (reply.status === 404 || reply.status === 422 || text.includes('not found') || text.includes('invalid')) return 'That licence key was not found, or is no longer active. Check it and try again.';
  return text ? `The licence was not accepted: ${errorDetail(reply).slice(0, 200)}` : `The licence was not accepted (${String(reply.status)}).`;
}

function licenceLinks(source: Readonly<Partial<Record<'buy' | 'terms' | 'privacy', string>>>): { links?: Partial<Record<'buy' | 'terms' | 'privacy', string>> } {
  const links: Partial<Record<'buy' | 'terms' | 'privacy', string>> = {};
  for (const name of ['buy', 'terms', 'privacy'] as const) {
    const value = source[name]?.trim() ?? '';
    try { if (value !== '' && new URL(value).protocol === 'https:') links[name] = value; } catch { /* not a link */ }
  }
  return Object.keys(links).length === 0 ? {} : { links };
}
