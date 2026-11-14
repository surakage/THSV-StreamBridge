import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Hosted pages: lets the StreamBridge pages served from slothbloom.com talk to this Bridge on the same PC.
// It is off until the creator turns it on. A browser is paired with a short code shown on this PC, and gets
// its own key that can be removed again. The control token never leaves the PC, a paired key only works from
// the SlothBloom pages, and only the address below is ever accepted.
//
// Only app.slothbloom.com, never the main site: the pairing key is kept in that address's browser storage, and
// the main site runs other scripts (ads among them) that must never be able to read it.

export const HOSTED_PAGE_ORIGINS: readonly string[] = ['https://app.slothbloom.com'];

const MAXIMUM_BROWSERS = 5;
const CODE_LIFETIME_MS = 5 * 60_000;
const MAXIMUM_CODE_ATTEMPTS = 5;

export interface HostedBrowser { readonly id: string; readonly name: string; readonly pairedAt: string }
interface StoredBrowser extends HostedBrowser { readonly keyHash: string }
export interface HostedPagesStatus { readonly enabled: boolean; readonly origins: readonly string[]; readonly browsers: readonly HostedBrowser[] }

export class HostedPagesError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

/** Words used in the messages a creator sees, so the same pairing works for SlothBloom pages and phones. */
export interface PairingWording { readonly turnOn: string; readonly devices: string; readonly device: string }
const SLOTHBLOOM_WORDING: PairingWording = { turnOn: 'Turn on SlothBloom pages first.', devices: 'browsers', device: 'Browser' };

export class HostedPagesService {
  private enabled = false;
  private browsers: StoredBrowser[] = [];
  private code: { readonly digest: string; readonly expiresAt: number; attempts: number } | undefined;
  private writes: Promise<void> = Promise.resolve();

  public constructor(private readonly path: string, private readonly now: () => number = Date.now, private readonly wording: PairingWording = SLOTHBLOOM_WORDING) {}

  public async start(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as unknown;
      const input = isRecord(parsed) ? parsed : {};
      this.enabled = input['enabled'] === true;
      this.browsers = (Array.isArray(input['browsers']) ? input['browsers'] : []).filter(validBrowser).slice(0, MAXIMUM_BROWSERS);
    } catch { /* Nothing saved yet: hosted pages stay off. */ }
  }

  public status(): HostedPagesStatus {
    return { enabled: this.enabled, origins: HOSTED_PAGE_ORIGINS, browsers: this.browsers.map(({ id, name, pairedAt }) => ({ id, name, pairedAt })) };
  }

  /** True when a request from this browser address may be answered at all. */
  public allowsOrigin(origin: string | undefined): boolean {
    return this.enabled && origin !== undefined && HOSTED_PAGE_ORIGINS.includes(origin);
  }

  /** True when the Authorization header carries the key of a paired browser. */
  public authorizes(header: string | undefined): boolean {
    if (!this.enabled || header === undefined || !header.startsWith('Bearer ')) return false;
    const digest = Buffer.from(hash(header.slice(7)), 'hex');
    let matched = false;
    for (const browser of this.browsers) {
      const expected = Buffer.from(browser.keyHash, 'hex');
      if (expected.length === digest.length && timingSafeEqual(expected, digest)) matched = true;
    }
    return matched;
  }

  public async setEnabled(enabled: boolean): Promise<HostedPagesStatus> {
    this.enabled = enabled;
    if (!enabled) this.code = undefined;
    await this.save();
    return this.status();
  }

  /** Makes the short code the creator types into the SlothBloom page. Only one code is valid at a time. */
  public createCode(): { readonly code: string; readonly expiresInSeconds: number } {
    if (!this.enabled) throw new HostedPagesError(409, this.wording.turnOn);
    if (this.browsers.length >= MAXIMUM_BROWSERS) throw new HostedPagesError(409, `Up to ${String(MAXIMUM_BROWSERS)} ${this.wording.devices} can be paired. Remove one first.`);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.code = { digest: hash(code), expiresAt: this.now() + CODE_LIFETIME_MS, attempts: 0 };
    return { code, expiresInSeconds: CODE_LIFETIME_MS / 1000 };
  }

  /** Swaps a valid code for a browser key. A code works once and is dropped after a few wrong tries. */
  public async pair(input: unknown): Promise<{ readonly id: string; readonly key: string }> {
    const record = isRecord(input) ? input : {};
    const provided = typeof record['code'] === 'string' ? record['code'].replace(/\s/gu, '') : '';
    const current = this.code;
    if (!this.enabled || current === undefined || current.expiresAt <= this.now()) { this.code = undefined; throw new HostedPagesError(401, 'That code is not valid any more. Make a new one in StreamBridge on this PC.'); }
    current.attempts += 1;
    const expected = Buffer.from(current.digest, 'hex');
    const actual = Buffer.from(hash(provided), 'hex');
    if (!/^\d{6}$/u.test(provided) || !timingSafeEqual(expected, actual)) {
      if (current.attempts >= MAXIMUM_CODE_ATTEMPTS) this.code = undefined;
      throw new HostedPagesError(401, 'That code is not right. Check it and try again.');
    }
    this.code = undefined;
    if (this.browsers.length >= MAXIMUM_BROWSERS) throw new HostedPagesError(409, `Up to ${String(MAXIMUM_BROWSERS)} ${this.wording.devices} can be paired. Remove one first.`);
    const key = randomBytes(32).toString('base64url');
    const name = typeof record['name'] === 'string' && record['name'].trim() !== '' ? record['name'].trim().slice(0, 60) : this.wording.device;
    const browser: StoredBrowser = { id: randomUUID(), name, pairedAt: new Date(this.now()).toISOString(), keyHash: hash(key) };
    this.browsers = [...this.browsers, browser];
    await this.save();
    return { id: browser.id, key };
  }

  public async unpair(id: string): Promise<HostedPagesStatus> {
    this.browsers = this.browsers.filter((browser) => browser.id !== id);
    await this.save();
    return this.status();
  }

  public async flush(): Promise<void> { await this.writes.catch(() => undefined); }

  private async save(): Promise<void> {
    const encoded = `${JSON.stringify({ version: 1, enabled: this.enabled, browsers: this.browsers }, null, 2)}\n`;
    this.writes = this.writes.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.path);
    });
    await this.writes;
  }
}

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function validBrowser(value: unknown): value is StoredBrowser {
  return isRecord(value) && typeof value['id'] === 'string' && typeof value['name'] === 'string' && typeof value['pairedAt'] === 'string' && typeof value['keyHash'] === 'string' && /^[0-9a-f]{64}$/u.test(value['keyHash']);
}
