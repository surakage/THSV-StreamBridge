import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

const pairingStartSchema = z.object({
  pairingId: z.string().min(16).max(200),
  userCode: z.string().min(4).max(24),
  verificationUrl: z.url(),
  expiresAt: z.iso.datetime({ offset: true }),
  pollAfterSeconds: z.number().int().min(2).max(60).default(5),
}).strict();

const pairingCheckSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending'), expiresAt: z.iso.datetime({ offset: true }) }).strict(),
  z.object({ state: z.literal('paired'), accessToken: z.string().min(32).max(2_048), dashboardUrl: z.url(), pairedAt: z.iso.datetime({ offset: true }) }).strict(),
]);

const portableConfigurationSchema = z.object({
  format: z.literal('thsv.streambridge.wizard-configuration'),
  version: z.literal(1),
  exportedAt: z.iso.datetime({ offset: true }),
  platforms: z.record(z.string(), z.unknown()),
  filters: z.record(z.string(), z.unknown()),
}).loose();

const configurationDraftSchema = z.object({
  revision: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  configuration: portableConfigurationSchema,
}).strict();

export type WebsiteConfigurationDraft = z.infer<typeof configurationDraftSchema>;

interface CompanionStateFile {
  readonly version: 1;
  readonly deviceId: string;
  readonly pending?: {
    readonly pairingId: string;
    readonly userCode: string;
    readonly verificationUrl: string;
    readonly expiresAt: string;
    readonly pollAfterSeconds: number;
    readonly verifier: string;
  };
  readonly connected?: {
    readonly accessToken: string;
    readonly dashboardUrl: string;
    readonly pairedAt: string;
  };
}

export interface WebsiteCompanionStatus {
  readonly state: 'disconnected' | 'pending' | 'connected';
  readonly websiteOrigin: string;
  readonly deviceId: string;
  readonly message: string;
  readonly userCode?: string;
  readonly verificationUrl?: string;
  readonly expiresAt?: string;
  readonly pollAfterSeconds?: number;
  readonly dashboardUrl?: string;
  readonly pairedAt?: string;
}

export class WebsiteCompanionService {
  private readonly websiteOrigin: string;

  public constructor(
    private readonly statePath: string,
    websiteUrl = 'https://www.slothbloom.com',
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const parsed = new URL(websiteUrl);
    if (parsed.protocol !== 'https:') throw new Error('The StreamBridge website companion requires HTTPS.');
    this.websiteOrigin = parsed.origin;
  }

  public async status(): Promise<WebsiteCompanionStatus> {
    const state = await this.readState();
    if (state.connected !== undefined) return {
      state: 'connected', websiteOrigin: this.websiteOrigin, deviceId: state.deviceId,
      dashboardUrl: state.connected.dashboardUrl, pairedAt: state.connected.pairedAt,
      message: 'This StreamBridge installation is paired. Website drafts still require local review before they can be applied.',
    };
    if (state.pending !== undefined && Date.parse(state.pending.expiresAt) > Date.now()) return {
      state: 'pending', websiteOrigin: this.websiteOrigin, deviceId: state.deviceId,
      userCode: state.pending.userCode, verificationUrl: state.pending.verificationUrl,
      expiresAt: state.pending.expiresAt, pollAfterSeconds: state.pending.pollAfterSeconds,
      message: 'Finish pairing on SlothBloom, then check the connection here.',
    };
    if (state.pending !== undefined) await this.writeState({ version: 1, deviceId: state.deviceId });
    return { state: 'disconnected', websiteOrigin: this.websiteOrigin, deviceId: state.deviceId, message: 'Pair this installation to design settings on SlothBloom without exposing your computer to inbound internet traffic.' };
  }

  public async start(version: string): Promise<WebsiteCompanionStatus> {
    const state = await this.readState();
    if (state.connected !== undefined) return this.status();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const response = await this.fetcher(`${this.websiteOrigin}/api/streambridge/pairing/start`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ deviceId: state.deviceId, version, challenge, challengeMethod: 'S256' }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await safeJson(response);
    if (!response.ok) throw new WebsiteCompanionError(response.status, readableRemoteError(body, 'SlothBloom could not start device pairing.'));
    const pairing = pairingStartSchema.parse(body);
    this.assertTrustedWebsiteUrl(pairing.verificationUrl);
    if (Date.parse(pairing.expiresAt) <= Date.now()) throw new WebsiteCompanionError(502, 'SlothBloom returned an expired pairing code. Try again.');
    await this.writeState({ version: 1, deviceId: state.deviceId, pending: { ...pairing, verifier } });
    return this.status();
  }

  public async check(): Promise<WebsiteCompanionStatus> {
    const state = await this.readState();
    if (state.pending === undefined) throw new WebsiteCompanionError(409, 'Start website pairing before checking its status.');
    if (Date.parse(state.pending.expiresAt) <= Date.now()) {
      await this.writeState({ version: 1, deviceId: state.deviceId });
      throw new WebsiteCompanionError(410, 'The pairing code expired. Start again to receive a new one.');
    }
    const response = await this.fetcher(`${this.websiteOrigin}/api/streambridge/pairing/check`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ deviceId: state.deviceId, pairingId: state.pending.pairingId, verifier: state.pending.verifier }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await safeJson(response);
    if (!response.ok) throw new WebsiteCompanionError(response.status, readableRemoteError(body, 'SlothBloom could not verify this pairing yet.'));
    const result = pairingCheckSchema.parse(body);
    if (result.state === 'pending') return this.status();
    this.assertTrustedWebsiteUrl(result.dashboardUrl);
    await this.writeState({ version: 1, deviceId: state.deviceId, connected: { accessToken: result.accessToken, dashboardUrl: result.dashboardUrl, pairedAt: result.pairedAt } });
    return this.status();
  }

  public async disconnect(): Promise<WebsiteCompanionStatus> {
    const state = await this.readState();
    if (state.connected !== undefined) {
      try {
        await this.fetcher(`${this.websiteOrigin}/api/streambridge/pairing/revoke`, {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${state.connected.accessToken}` },
          body: JSON.stringify({ deviceId: state.deviceId }), signal: AbortSignal.timeout(5_000),
        });
      } catch { /* Local disconnect remains authoritative when the website is unavailable. */ }
    }
    await this.writeState({ version: 1, deviceId: state.deviceId });
    return this.status();
  }

  public async pushConfiguration(configuration: unknown): Promise<{ readonly saved: true; readonly savedAt: string }> {
    const state = await this.requireConnected();
    const response = await this.fetcher(`${this.websiteOrigin}/api/streambridge/device/configuration`, {
      method: 'PUT', headers: this.deviceHeaders(state), body: JSON.stringify(configuration), signal: AbortSignal.timeout(10_000),
    });
    const body = await safeJson(response);
    if (!response.ok) throw new WebsiteCompanionError(response.status, readableRemoteError(body, 'SlothBloom could not save this portable configuration.'));
    return z.object({ saved: z.literal(true), savedAt: z.iso.datetime({ offset: true }) }).strict().parse(body);
  }

  public async pullDraft(): Promise<WebsiteConfigurationDraft | null> {
    const state = await this.requireConnected();
    const response = await this.fetcher(`${this.websiteOrigin}/api/streambridge/device/draft`, {
      method: 'GET', headers: this.deviceHeaders(state), signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 204) return null;
    const body = await safeJson(response);
    if (!response.ok) throw new WebsiteCompanionError(response.status, readableRemoteError(body, 'SlothBloom could not retrieve the website draft.'));
    return configurationDraftSchema.parse(body);
  }

  private assertTrustedWebsiteUrl(value: string): void {
    if (new URL(value).origin !== this.websiteOrigin) throw new WebsiteCompanionError(502, 'SlothBloom returned a pairing link for an unexpected website. Pairing was stopped.');
  }

  private async requireConnected(): Promise<CompanionStateFile & { readonly connected: NonNullable<CompanionStateFile['connected']> }> {
    const state = await this.readState();
    if (state.connected === undefined) throw new WebsiteCompanionError(409, 'Pair this StreamBridge installation with SlothBloom first.');
    return state as CompanionStateFile & { readonly connected: NonNullable<CompanionStateFile['connected']> };
  }

  private deviceHeaders(state: CompanionStateFile & { readonly connected: NonNullable<CompanionStateFile['connected']> }): Record<string, string> {
    return { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${state.connected.accessToken}`, 'x-thsv-device-id': state.deviceId };
  }

  private async readState(): Promise<CompanionStateFile> {
    try {
      const parsed = JSON.parse(await readFile(this.statePath, 'utf8')) as Partial<CompanionStateFile>;
      if (parsed.version === 1 && typeof parsed.deviceId === 'string' && parsed.deviceId.length > 0) return parsed as CompanionStateFile;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const state: CompanionStateFile = { version: 1, deviceId: randomUUID() };
    await this.writeState(state);
    return state;
  }

  private async writeState(state: CompanionStateFile): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.statePath);
  }
}

export class WebsiteCompanionError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

async function safeJson(response: Response): Promise<unknown> {
  try { return await response.json() as unknown; } catch { return {}; }
}

function readableRemoteError(value: unknown, fallback: string): string {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>)['error'] === 'string' ? String((value as Record<string, unknown>)['error']) : fallback;
}
