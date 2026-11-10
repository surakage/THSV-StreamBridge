import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { CredentialProtector } from './broadcast-connection-vault-service.js';
import type { Logger } from './logger.js';

// The StreamBridge licence: a Lemon Squeezy licence key the creator activates once on this PC.
//
// While StreamBridge is in beta every feature stays free, so a missing or expired licence never turns anything
// off; this only records whether the PC holds a valid licence. The key is a secret: it is stored only as
// Windows-protected text and never logged or returned, callers see the last four characters.
// Lemon Squeezy's licence API needs no account secret, so the bridge talks to it directly.

export const LICENCE_API_BASE = 'https://api.lemonsqueezy.com/v1/licenses';
/** Licences from other Lemon Squeezy stores are refused once these are set. Empty means not configured yet. */
export const LICENCE_STORE_IDS: readonly number[] = [];
export const LICENCE_PRODUCT_IDS: readonly number[] = [];
/** A licence that could not be re-checked (offline) stays valid this long after its last successful check. */
export const LICENCE_OFFLINE_GRACE_DAYS = 14;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/u;

const storedSchema = z.object({
  version: z.literal(1),
  protectedKey: z.string().min(1).max(16_384),
  keyHint: z.string().max(16),
  instanceId: z.string().min(1).max(256),
  instanceName: z.string().max(256),
  status: z.enum(['active', 'expired', 'disabled', 'inactive']),
  productName: z.string().max(200).optional(),
  customerName: z.string().max(200).optional(),
  expiresAt: z.string().max(64).nullable().optional(),
  activatedAt: z.string().max(64),
  lastCheckedAt: z.string().max(64),
  lastError: z.string().max(300).optional(),
}).strict();
type StoredLicence = z.infer<typeof storedSchema>;

const responseSchema = z.object({
  activated: z.boolean().optional(),
  valid: z.boolean().optional(),
  deactivated: z.boolean().optional(),
  error: z.string().nullable().optional(),
  license_key: z.object({ status: z.string(), expires_at: z.string().nullable().optional() }).loose().nullable().optional(),
  instance: z.object({ id: z.string(), name: z.string().optional() }).loose().nullable().optional(),
  meta: z.object({ store_id: z.number().optional(), product_id: z.number().optional(), product_name: z.string().optional(), customer_name: z.string().optional() }).loose().nullable().optional(),
}).loose();
type LicenceResponse = z.infer<typeof responseSchema>;

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
}

export interface LicenceServiceDependencies {
  readonly protector: CredentialProtector;
  readonly logger: Logger;
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
  readonly instanceName?: string;
  readonly storeIds?: readonly number[];
  readonly productIds?: readonly number[];
}

export function licenceKeyHint(key: string): string { return `…${key.slice(-4).toUpperCase()}`; }

export class LicenceService {
  private readonly path: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private licence: StoredLicence | undefined;
  private loaded: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;

  public constructor(dataRoot: string, private readonly dependencies: LicenceServiceDependencies) {
    this.path = join(dataRoot, 'secrets', 'licence.json');
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

  public stop(): void { if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined; }

  public status(): LicenceStatus {
    const licence = this.licence;
    if (licence === undefined) return { beta: true, licensed: false, state: 'none' };
    const lastChecked = Date.parse(licence.lastCheckedAt);
    const withinGrace = Number.isFinite(lastChecked) && this.now().getTime() - lastChecked <= LICENCE_OFFLINE_GRACE_DAYS * CHECK_INTERVAL_MS;
    const licensed = licence.status === 'active' && withinGrace;
    return {
      beta: true, licensed, state: licence.status === 'active' && !withinGrace ? 'unchecked' : licence.status,
      keyHint: licence.keyHint,
      ...(licence.productName === undefined ? {} : { productName: licence.productName }),
      ...(licence.customerName === undefined ? {} : { customerName: licence.customerName }),
      ...(licence.expiresAt === undefined ? {} : { expiresAt: licence.expiresAt }),
      activatedAt: licence.activatedAt, lastCheckedAt: licence.lastCheckedAt,
      ...(licence.lastError === undefined ? {} : { lastError: licence.lastError }),
    };
  }

  /** Activates a key on this PC. A key already saved here is released first, so it never uses two activations. */
  public async activate(input: unknown): Promise<LicenceStatus> {
    await this.start();
    const parsed = z.object({ key: z.string().trim() }).strict().safeParse(input);
    const key = parsed.success ? parsed.data.key : '';
    if (!KEY_PATTERN.test(key)) throw new LicenceError(400, 'Paste the licence key from your purchase email. It looks like XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX.');
    const instanceName = (this.dependencies.instanceName ?? `StreamBridge on ${hostname()}`).slice(0, 200);
    const result = await this.call('activate', { license_key: key, instance_name: instanceName });
    if (result.activated !== true || result.instance?.id === undefined) throw new LicenceError(400, friendlyError(result.error));
    if (!this.fromOurStore(result)) {
      await this.call('deactivate', { license_key: key, instance_id: result.instance.id }).catch(() => undefined);
      throw new LicenceError(400, 'That key is not a StreamBridge licence.');
    }
    if (this.licence !== undefined) await this.deactivate().catch(() => undefined);
    const now = this.now().toISOString();
    this.licence = {
      version: 1, protectedKey: await this.dependencies.protector.protect(key), keyHint: licenceKeyHint(key),
      instanceId: result.instance.id, instanceName, status: statusOf(result.license_key?.status), activatedAt: now, lastCheckedAt: now,
      ...details(result),
    };
    await this.save();
    this.dependencies.logger.info('Licence activated on this PC', { keyHint: this.licence.keyHint, status: this.licence.status });
    return this.status();
  }

  /** Re-checks the saved key with Lemon Squeezy. Offline, the last result is kept until the grace period ends. */
  public async check(): Promise<LicenceStatus> {
    await this.start();
    const licence = this.licence;
    if (licence === undefined) return this.status();
    let result: LicenceResponse;
    try {
      result = await this.call('validate', { license_key: await this.dependencies.protector.unprotect(licence.protectedKey), instance_id: licence.instanceId });
    } catch (error) {
      this.licence = { ...licence, lastError: 'The licence server could not be reached. StreamBridge keeps working and checks again later.' };
      await this.save();
      throw error;
    }
    const { lastError: _previousError, ...rest } = licence;
    const status = result.valid === true ? statusOf(result.license_key?.status) : result.license_key ? statusOf(result.license_key.status === 'active' ? 'inactive' : result.license_key.status) : 'inactive';
    this.licence = { ...rest, status, lastCheckedAt: this.now().toISOString(), ...details(result), ...(result.valid === true ? {} : { lastError: friendlyError(result.error) }) };
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
      const result = await this.call('deactivate', { license_key: key, instance_id: licence.instanceId }).catch((error: unknown) => {
        throw new LicenceError(502, `The licence server could not be reached, so this PC still uses one activation. ${error instanceof Error ? error.message : ''}`.trim());
      });
      // A key that was already released or refunded has nothing left to release.
      if (result.deactivated !== true && !/not found|invalid|expired|disabled/iu.test(result.error ?? '')) throw new LicenceError(400, friendlyError(result.error));
    }
    this.licence = undefined;
    await this.save();
    this.dependencies.logger.info('Licence removed from this PC', { keyHint: licence.keyHint });
    return this.status();
  }

  private fromOurStore(result: LicenceResponse): boolean {
    const stores = this.dependencies.storeIds ?? LICENCE_STORE_IDS;
    const products = this.dependencies.productIds ?? LICENCE_PRODUCT_IDS;
    if (stores.length > 0 && !stores.includes(result.meta?.store_id ?? -1)) return false;
    if (products.length > 0 && !products.includes(result.meta?.product_id ?? -1)) return false;
    return true;
  }

  private async call(operation: 'activate' | 'validate' | 'deactivate', body: Record<string, string>): Promise<LicenceResponse> {
    const response = await this.fetcher(`${LICENCE_API_BASE}/${operation}`, {
      method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let parsed: LicenceResponse;
    try { parsed = responseSchema.parse(JSON.parse(text)); }
    catch { throw new LicenceError(502, `The licence server answered with something unexpected (${String(response.status)}).`); }
    if (!response.ok && parsed.error == null) throw new LicenceError(502, `The licence server refused the request (${String(response.status)}).`);
    return parsed;
  }

  private async load(): Promise<void> {
    let text: string;
    try { text = await readFile(this.path, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    const parsed = storedSchema.safeParse(JSON.parse(text));
    if (parsed.success) this.licence = parsed.data;
    else this.dependencies.logger.warn('The saved licence file is damaged and was ignored');
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${String(process.pid)}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.licence ?? null, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.path);
  }
}

function statusOf(value: string | undefined): StoredLicence['status'] {
  return value === 'active' || value === 'expired' || value === 'disabled' ? value : 'inactive';
}

function details(result: LicenceResponse): Pick<StoredLicence, 'productName' | 'customerName' | 'expiresAt'> {
  return {
    ...(result.meta?.product_name === undefined ? {} : { productName: result.meta.product_name.slice(0, 200) }),
    ...(result.meta?.customer_name === undefined ? {} : { customerName: result.meta.customer_name.slice(0, 200) }),
    ...(result.license_key?.expires_at === undefined ? {} : { expiresAt: result.license_key.expires_at }),
  };
}

function friendlyError(error: string | null | undefined): string {
  const text = (error ?? '').toLowerCase();
  if (text.includes('activation limit')) return 'This key is already active on as many PCs as it allows. Remove it from another PC first.';
  if (text.includes('expired')) return 'This licence has expired.';
  if (text.includes('disabled')) return 'This licence was turned off. Contact support if that is a mistake.';
  if (text.includes('not found') || text.includes('invalid')) return 'That licence key was not found. Check it and try again.';
  return error ? `The licence was not accepted: ${error.slice(0, 200)}` : 'The licence was not accepted.';
}
