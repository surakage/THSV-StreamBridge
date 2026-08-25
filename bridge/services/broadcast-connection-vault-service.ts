import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type BroadcastConnectionProvider = 'obs' | 'meld' | 'streamlabs';

export interface BroadcastConnectionProfile {
  readonly id: string;
  readonly name: string;
  readonly provider: BroadcastConnectionProvider;
  readonly url: string;
  readonly enabled: boolean;
  readonly hasCredential: boolean;
  readonly credentialVerifiedAt?: string;
  readonly rotationReminderDays?: number;
  readonly credentialReminderDueAt?: string;
  readonly credentialReminderDue?: boolean;
  readonly latencyWarningMs?: number;
  readonly maintenanceUntil?: string;
  readonly maintenanceReason?: string;
}

export interface ResolvedBroadcastConnection extends BroadcastConnectionProfile { readonly credential: string }

interface StoredConnection extends Omit<BroadcastConnectionProfile, 'hasCredential' | 'credentialReminderDueAt' | 'credentialReminderDue'> { readonly protectedCredential?: string }
export interface BroadcastReliabilityPolicy { readonly strictMode: boolean; readonly acceptanceMaxAgeDays: number; readonly credentialMaxAgeDays: number; readonly sustainedAlertMinutes: number }
interface VaultFile { readonly version: 1; readonly connections: readonly StoredConnection[]; readonly policy: BroadcastReliabilityPolicy; readonly updatedAt: string }
interface ImportMetadataConnection { readonly id: string; readonly name: string; readonly provider: BroadcastConnectionProvider; readonly url: string; readonly enabled: boolean; readonly credentialRequired: boolean; readonly rotationReminderDays?: number; readonly latencyWarningMs?: number }
export interface CredentialProtector { protect(value: string): Promise<string>; unprotect(value: string): Promise<string> }

const PROVIDERS = ['obs', 'meld', 'streamlabs'] as const;
const MAXIMUM_FILE_BYTES = 128 * 1024;
const DEFAULT_POLICY: BroadcastReliabilityPolicy = { strictMode: false, acceptanceMaxAgeDays: 30, credentialMaxAgeDays: 90, sustainedAlertMinutes: 5 };

export class BroadcastConnectionVaultService {
  private readonly path: string;
  private file: VaultFile = { version: 1, connections: [], policy: DEFAULT_POLICY, updatedAt: new Date(0).toISOString() };

  public constructor(dataRoot: string, private readonly platform: NodeJS.Platform = process.platform, private readonly protector: CredentialProtector = new WindowsDpapiCredentialProtector()) {
    this.path = join(dataRoot, 'secrets', 'broadcast-connections.json');
  }

  public async start(): Promise<void> {
    try {
      const details = await stat(this.path);
      if (!details.isFile() || details.size > MAXIMUM_FILE_BYTES) throw new Error('Broadcast connection vault is invalid or too large.');
      this.file = parseVault(JSON.parse(await readFile(this.path, 'utf8')) as unknown);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  public status(): Readonly<Record<string, unknown>> {
    return { supported: this.platform === 'win32', credentialProtection: this.platform === 'win32' ? 'windows-dpapi-current-user' : 'unavailable', policy: this.file.policy, connections: this.file.connections.map(safeProfile) };
  }

  public reliabilityPolicy(): BroadcastReliabilityPolicy { return this.file.policy; }

  public async saveReliabilityPolicy(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = object(input, 'Broadcast reliability policy request must be an object.');
    if (request['approvedByCreator'] !== true) throw new BroadcastConnectionVaultError(403, 'Explicit creator approval is required to change the strict pre-stream policy.');
    if (typeof request['strictMode'] !== 'boolean') throw new BroadcastConnectionVaultError(400, 'strictMode must be true or false.');
    const policy: BroadcastReliabilityPolicy = {
      strictMode: request['strictMode'],
      acceptanceMaxAgeDays: optionalInteger(request['acceptanceMaxAgeDays'], 'acceptanceMaxAgeDays', 1, 3650) ?? this.file.policy.acceptanceMaxAgeDays,
      credentialMaxAgeDays: optionalInteger(request['credentialMaxAgeDays'], 'credentialMaxAgeDays', 1, 3650) ?? this.file.policy.credentialMaxAgeDays,
      sustainedAlertMinutes: optionalInteger(request['sustainedAlertMinutes'], 'sustainedAlertMinutes', 1, 120) ?? this.file.policy.sustainedAlertMinutes,
    };
    this.file = { ...this.file, policy, updatedAt: new Date().toISOString() };
    await this.write();
    return this.status();
  }

  public exportMetadata(): Readonly<Record<string, unknown>> {
    return { format: 'thsv-broadcast-connections-metadata-v1', exportedAt: new Date().toISOString(), secretPolicy: 'Credentials and verification timestamps are never exported. Re-enter and retest them on the destination Windows account.', connections: this.file.connections.map((connection) => ({ id: connection.id, name: connection.name, provider: connection.provider, url: connection.url, enabled: connection.enabled, credentialRequired: connection.protectedCredential !== undefined, ...(connection.rotationReminderDays === undefined ? {} : { rotationReminderDays: connection.rotationReminderDays }), ...(connection.latencyWarningMs === undefined ? {} : { latencyWarningMs: connection.latencyWarningMs }) })) };
  }

  public validateMetadataImport(input: unknown): Readonly<Record<string, unknown>> {
    const connections = parseMetadataImport(input);
    return { valid: true, format: 'thsv-broadcast-connections-metadata-v1', mergePolicy: 'Profiles with matching IDs are updated; other saved profiles are retained.', connections: connections.map((connection) => ({ ...connection, credentialStatus: connection.credentialRequired ? this.file.connections.some((saved) => saved.id === connection.id && saved.protectedCredential !== undefined) ? 'saved-or-reenter' : 'reentry-required' : 'not-required' })) };
  }

  public async importMetadata(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = object(input, 'Broadcast connection import request must be an object.');
    const connections = parseMetadataImport(request['metadata']);
    const credentials = object(request['credentials'] ?? {}, 'credentials must be an object keyed by connection ID.');
    const allowed = new Set(connections.map((connection) => connection.id));
    if (Object.keys(credentials).some((id) => !allowed.has(id))) throw new BroadcastConnectionVaultError(400, 'credentials contains an unknown connection ID.');
    const imported: StoredConnection[] = [];
    for (const connection of connections) {
      const existing = this.file.connections.find((saved) => saved.id === connection.id);
      const supplied = credentials[connection.id];
      if (supplied !== undefined && typeof supplied !== 'string') throw new BroadcastConnectionVaultError(400, `Credential for ${connection.name} must be text.`);
      if (typeof supplied === 'string' && supplied.length > 512) throw new BroadcastConnectionVaultError(400, `Credential for ${connection.name} must be 512 characters or fewer.`);
      if (typeof supplied === 'string' && supplied !== '' && this.platform !== 'win32') throw new BroadcastConnectionVaultError(503, 'Credential storage requires Windows DPAPI in this installation.');
      const protectedCredential = typeof supplied === 'string' && supplied !== '' ? await this.protector.protect(supplied) : existing?.protectedCredential;
      if (connection.credentialRequired && protectedCredential === undefined) throw new BroadcastConnectionVaultError(400, `Re-enter the credential for ${connection.name}.`);
      imported.push({ id: connection.id, name: connection.name, provider: connection.provider, url: connection.url, enabled: connection.enabled, ...(existing?.credentialVerifiedAt === undefined ? {} : { credentialVerifiedAt: existing.credentialVerifiedAt }), ...(existing?.maintenanceUntil === undefined ? {} : { maintenanceUntil: existing.maintenanceUntil }), ...(existing?.maintenanceReason === undefined ? {} : { maintenanceReason: existing.maintenanceReason }), ...(connection.rotationReminderDays === undefined ? {} : { rotationReminderDays: connection.rotationReminderDays }), ...(connection.latencyWarningMs === undefined ? {} : { latencyWarningMs: connection.latencyWarningMs }), ...(protectedCredential === undefined ? {} : { protectedCredential }) });
    }
    const importedIds = new Set(imported.map((connection) => connection.id));
    this.file = { ...this.file, connections: [...this.file.connections.filter((connection) => !importedIds.has(connection.id)), ...imported].sort((left, right) => left.provider.localeCompare(right.provider) || left.name.localeCompare(right.name)), updatedAt: new Date().toISOString() };
    await this.write();
    return this.status();
  }

  public async save(input: unknown, credentialVerifiedAt?: string): Promise<Readonly<Record<string, unknown>>> {
    const request = object(input, 'Broadcast connection request must be an object.');
    const requestedId = request['id'];
    const id = optionalId(requestedId) ?? (requestedId === undefined || requestedId === '' ? randomUUID() : (() => { throw new BroadcastConnectionVaultError(400, 'id must be a valid connection UUID.'); })());
    const provider = parseProvider(request['provider']);
    const name = boundedString(request['name'], 'name', 60);
    const url = localWebSocketUrl(request['url'], provider);
    const enabled = request['enabled'] !== false;
    const existing = this.file.connections.find((connection) => connection.id === id);
    const credential = typeof request['credential'] === 'string' ? request['credential'] : undefined;
    if (credential !== undefined && credential.length > 512) throw new BroadcastConnectionVaultError(400, 'credential must be 512 characters or fewer.');
    if (credential !== undefined && credential !== '' && this.platform !== 'win32') throw new BroadcastConnectionVaultError(503, 'Credential storage requires Windows DPAPI in this installation.');
    const protectedCredential = credential === undefined ? existing?.protectedCredential : credential === '' ? undefined : await this.protector.protect(credential);
    const rotationReminderDays = optionalInteger(request['rotationReminderDays'], 'rotationReminderDays', 0, 3650) ?? existing?.rotationReminderDays;
    const latencyWarningMs = optionalInteger(request['latencyWarningMs'], 'latencyWarningMs', 100, 30_000) ?? existing?.latencyWarningMs ?? 2_000;
    const verified = protectedCredential === undefined ? undefined : credentialVerifiedAt ?? (credential === undefined ? existing?.credentialVerifiedAt : undefined);
    const saved: StoredConnection = { id, name, provider, url, enabled, ...(verified === undefined ? {} : { credentialVerifiedAt: verified }), ...(existing?.maintenanceUntil === undefined ? {} : { maintenanceUntil: existing.maintenanceUntil }), ...(existing?.maintenanceReason === undefined ? {} : { maintenanceReason: existing.maintenanceReason }), ...(rotationReminderDays === undefined || rotationReminderDays === 0 ? {} : { rotationReminderDays }), latencyWarningMs, ...(protectedCredential === undefined ? {} : { protectedCredential }) };
    this.file = { ...this.file, connections: [...this.file.connections.filter((connection) => connection.id !== id), saved].sort((left, right) => left.provider.localeCompare(right.provider) || left.name.localeCompare(right.name)), updatedAt: new Date().toISOString() };
    await this.write();
    return this.status();
  }

  public async candidate(input: unknown): Promise<ResolvedBroadcastConnection> {
    const request = object(input, 'Broadcast connection request must be an object.');
    const requestedId = request['id'];
    const id = optionalId(requestedId) ?? (requestedId === undefined || requestedId === '' ? randomUUID() : (() => { throw new BroadcastConnectionVaultError(400, 'id must be a valid connection UUID.'); })());
    const provider = parseProvider(request['provider']); const name = boundedString(request['name'], 'name', 60); const url = localWebSocketUrl(request['url'], provider); const enabled = request['enabled'] !== false;
    const existing = this.file.connections.find((connection) => connection.id === id); const supplied = typeof request['credential'] === 'string' ? request['credential'] : undefined;
    if (supplied !== undefined && supplied.length > 512) throw new BroadcastConnectionVaultError(400, 'credential must be 512 characters or fewer.');
    const credential = supplied === undefined ? existing?.protectedCredential === undefined ? '' : await this.protector.unprotect(existing.protectedCredential) : supplied;
    const rotationReminderDays = optionalInteger(request['rotationReminderDays'], 'rotationReminderDays', 0, 3650) ?? existing?.rotationReminderDays;
    const latencyWarningMs = optionalInteger(request['latencyWarningMs'], 'latencyWarningMs', 100, 30_000) ?? existing?.latencyWarningMs ?? 2_000;
    return { id, name, provider, url, enabled, hasCredential: credential !== '', credential, ...(existing?.credentialVerifiedAt === undefined ? {} : { credentialVerifiedAt: existing.credentialVerifiedAt }), ...(rotationReminderDays === undefined || rotationReminderDays === 0 ? {} : { rotationReminderDays }), latencyWarningMs };
  }

  public async remove(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = object(input, 'Broadcast connection removal request must be an object.');
    const id = optionalId(request['id']);
    if (id === undefined || !this.file.connections.some((connection) => connection.id === id)) throw new BroadcastConnectionVaultError(404, 'Choose a saved broadcast connection.');
    this.file = { ...this.file, connections: this.file.connections.filter((connection) => connection.id !== id), updatedAt: new Date().toISOString() };
    await this.write();
    return this.status();
  }

  public async markCredentialVerified(id: string, verifiedAt = new Date().toISOString()): Promise<void> {
    if (!Number.isFinite(Date.parse(verifiedAt))) throw new BroadcastConnectionVaultError(400, 'Credential verification timestamp is invalid.');
    const current = this.file.connections.find((connection) => connection.id === id);
    if (current?.protectedCredential === undefined) return;
    this.file = { ...this.file, connections: this.file.connections.map((connection) => connection.id === id ? { ...connection, credentialVerifiedAt: verifiedAt } : connection), updatedAt: verifiedAt };
    await this.write();
  }

  public async setMaintenance(input: unknown): Promise<Readonly<Record<string, unknown>>> { const request = object(input, 'Maintenance request must be an object.'); if (request['approvedByCreator'] !== true) throw new BroadcastConnectionVaultError(403, 'Explicit creator approval is required to change maintenance mode.'); const id = optionalId(request['id']); const current = id === undefined ? undefined : this.file.connections.find((connection) => connection.id === id); if (current === undefined) throw new BroadcastConnectionVaultError(404, 'Choose a saved broadcast connection.'); const clear = request['clear'] === true; let maintenanceUntil: string | undefined; let maintenanceReason: string | undefined; if (!clear) { if (typeof request['until'] === 'string') { const parsed = Date.parse(request['until']); if (!Number.isFinite(parsed) || parsed <= Date.now() || parsed - Date.now() > 720 * 3_600_000) throw new BroadcastConnectionVaultError(400, 'Maintenance end time must be in the future and no more than 720 hours away.'); maintenanceUntil = new Date(parsed).toISOString(); } else { const hours = optionalInteger(request['hours'], 'hours', 1, 720); if (hours === undefined) throw new BroadcastConnectionVaultError(400, 'Maintenance duration must be from 1 through 720 hours.'); maintenanceUntil = new Date(Date.now() + hours * 3_600_000).toISOString(); } maintenanceReason = typeof request['reason'] === 'string' && request['reason'].trim() !== '' ? request['reason'].trim().slice(0, 120) : 'Creator-planned maintenance'; } const base = withoutMaintenance(current); const updated: StoredConnection = { ...base, ...(maintenanceUntil === undefined ? {} : { maintenanceUntil }), ...(maintenanceReason === undefined ? {} : { maintenanceReason }) }; this.file = { ...this.file, connections: this.file.connections.map((connection) => connection.id === id ? updated : connection), updatedAt: new Date().toISOString() }; await this.write(); return this.status(); }

  public async cloneProfile(input: unknown): Promise<Readonly<Record<string, unknown>>> { const request = object(input, 'Clone profile request must be an object.'); if (request['approvedByCreator'] !== true) throw new BroadcastConnectionVaultError(403, 'Explicit creator approval is required to clone a protected profile.'); const sourceId = optionalId(request['sourceId']); const source = sourceId === undefined ? undefined : this.file.connections.find((connection) => connection.id === sourceId); if (source === undefined) throw new BroadcastConnectionVaultError(404, 'Choose a saved profile to clone.'); const layout = request['layout']; if (layout !== 'landscape' && layout !== 'portrait') throw new BroadcastConnectionVaultError(400, 'layout must be landscape or portrait.'); const port = optionalInteger(request['port'], 'port', 1, 65_535); if (port === undefined) throw new BroadcastConnectionVaultError(400, 'Choose one explicit WebSocket port.'); const nextUrl = new URL(source.url); nextUrl.port = String(port); if (this.file.connections.some((connection) => new URL(connection.url).port === String(port))) throw new BroadcastConnectionVaultError(409, `Port ${String(port)} is already used by another saved profile.`); const name = typeof request['name'] === 'string' && request['name'].trim() !== '' ? boundedString(request['name'], 'name', 60) : `${source.name} ${layout}`.slice(0, 60); const cloned: StoredConnection = { ...withoutMaintenance(source), id: randomUUID(), name, url: nextUrl.toString(), enabled: false }; this.file = { ...this.file, connections: [...this.file.connections, cloned].sort((left, right) => left.provider.localeCompare(right.provider) || left.name.localeCompare(right.name)), updatedAt: new Date().toISOString() }; await this.write(); return this.status(); }

  public async resolved(provider?: BroadcastConnectionProvider): Promise<readonly ResolvedBroadcastConnection[]> {
    const selected = this.file.connections.filter((connection) => connection.enabled && (provider === undefined || connection.provider === provider));
    return await Promise.all(selected.map(async (connection) => ({ ...safeProfile(connection), credential: connection.protectedCredential === undefined ? '' : await this.protector.unprotect(connection.protectedCredential) })));
  }

  private async write(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.file, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, this.path);
  }
}

export class WindowsDpapiCredentialProtector implements CredentialProtector {
  public async protect(value: string): Promise<string> {
    return runDpapi("Add-Type -AssemblyName System.Security;$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))", value);
  }
  public async unprotect(value: string): Promise<string> {
    return runDpapi("Add-Type -AssemblyName System.Security;$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))", value);
  }
}

export class BroadcastConnectionVaultError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

async function runDpapi(script: string, input: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const output: Buffer[] = []; const errors: Buffer[] = []; let bytes = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error('Windows credential protection timed out.')); }, 5_000); timer.unref();
    child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes <= 64 * 1024) output.push(chunk); else child.kill(); });
    child.stderr.on('data', (chunk: Buffer) => { if (errors.reduce((total, item) => total + item.length, 0) < 4_096) errors.push(chunk); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); if (code === 0 && bytes <= 64 * 1024) resolve(Buffer.concat(output).toString('utf8')); else reject(new Error(`Windows credential protection failed${errors.length === 0 ? '.' : ': ' + Buffer.concat(errors).toString('utf8').trim().slice(0, 300)}`)); });
    child.stdin.end(input, 'utf8');
  });
}

function safeProfile(connection: StoredConnection): BroadcastConnectionProfile {
  const dueAt = connection.credentialVerifiedAt === undefined || connection.rotationReminderDays === undefined ? undefined : new Date(Date.parse(connection.credentialVerifiedAt) + connection.rotationReminderDays * 86_400_000).toISOString();
  return { id: connection.id, name: connection.name, provider: connection.provider, url: connection.url, enabled: connection.enabled, hasCredential: connection.protectedCredential !== undefined, ...(connection.credentialVerifiedAt === undefined ? {} : { credentialVerifiedAt: connection.credentialVerifiedAt }), ...(connection.rotationReminderDays === undefined ? {} : { rotationReminderDays: connection.rotationReminderDays }), ...(dueAt === undefined ? {} : { credentialReminderDueAt: dueAt, credentialReminderDue: Date.now() >= Date.parse(dueAt) }), ...(connection.latencyWarningMs === undefined ? {} : { latencyWarningMs: connection.latencyWarningMs }), ...(connection.maintenanceUntil === undefined ? {} : { maintenanceUntil: connection.maintenanceUntil, maintenanceReason: connection.maintenanceReason }) };
}
function withoutMaintenance(connection: StoredConnection): StoredConnection { const result: Record<string, unknown> = { ...connection }; delete result['maintenanceUntil']; delete result['maintenanceReason']; return result as unknown as StoredConnection; }
function parseVault(value: unknown): VaultFile {
  const root = object(value, 'Broadcast connection vault must be an object.');
  if (root['version'] !== 1 || !Array.isArray(root['connections']) || root['connections'].length > 24) throw new Error('Broadcast connection vault has an unsupported format.');
  const ids = new Set<string>();
  const connections = root['connections'].map((entry) => { const item = object(entry, 'Broadcast connection entry must be an object.'); const id = optionalId(item['id']); if (id === undefined || ids.has(id)) throw new Error('Broadcast connection IDs must be unique UUIDs.'); ids.add(id); const protectedCredential = typeof item['protectedCredential'] === 'string' && item['protectedCredential'].length <= 8_192 ? item['protectedCredential'] : undefined; const credentialVerifiedAt = typeof item['credentialVerifiedAt'] === 'string' && Number.isFinite(Date.parse(item['credentialVerifiedAt'])) ? item['credentialVerifiedAt'] : undefined; const maintenanceUntil = typeof item['maintenanceUntil'] === 'string' && Number.isFinite(Date.parse(item['maintenanceUntil'])) && Date.parse(item['maintenanceUntil']) > Date.now() ? item['maintenanceUntil'] : undefined; const maintenanceReason = maintenanceUntil !== undefined && typeof item['maintenanceReason'] === 'string' ? item['maintenanceReason'].slice(0, 120) : undefined; const rotationReminderDays = optionalInteger(item['rotationReminderDays'], 'rotationReminderDays', 1, 3650); const latencyWarningMs = optionalInteger(item['latencyWarningMs'], 'latencyWarningMs', 100, 30_000); return { id, name: boundedString(item['name'], 'name', 60), provider: parseProvider(item['provider']), url: localWebSocketUrl(item['url'], parseProvider(item['provider'])), enabled: item['enabled'] !== false, ...(credentialVerifiedAt === undefined ? {} : { credentialVerifiedAt }), ...(maintenanceUntil === undefined ? {} : { maintenanceUntil }), ...(maintenanceReason === undefined ? {} : { maintenanceReason }), ...(rotationReminderDays === undefined ? {} : { rotationReminderDays }), ...(latencyWarningMs === undefined ? {} : { latencyWarningMs }), ...(protectedCredential === undefined ? {} : { protectedCredential }) }; });
  const rawPolicy = root['policy'];
  const policy = rawPolicy === undefined ? DEFAULT_POLICY : (() => { const item = object(rawPolicy, 'Broadcast reliability policy must be an object.'); return { strictMode: item['strictMode'] === true, acceptanceMaxAgeDays: optionalInteger(item['acceptanceMaxAgeDays'], 'acceptanceMaxAgeDays', 1, 3650) ?? DEFAULT_POLICY.acceptanceMaxAgeDays, credentialMaxAgeDays: optionalInteger(item['credentialMaxAgeDays'], 'credentialMaxAgeDays', 1, 3650) ?? DEFAULT_POLICY.credentialMaxAgeDays, sustainedAlertMinutes: optionalInteger(item['sustainedAlertMinutes'], 'sustainedAlertMinutes', 1, 120) ?? DEFAULT_POLICY.sustainedAlertMinutes }; })();
  return { version: 1, connections, policy, updatedAt: typeof root['updatedAt'] === 'string' && Number.isFinite(Date.parse(root['updatedAt'])) ? root['updatedAt'] : new Date(0).toISOString() };
}
function parseMetadataImport(value: unknown): readonly ImportMetadataConnection[] {
  const root = object(value, 'Broadcast connection metadata must be an object.');
  const allowedRoot = new Set(['format', 'exportedAt', 'secretPolicy', 'connections']);
  if (Object.keys(root).some((key) => !allowedRoot.has(key))) throw new BroadcastConnectionVaultError(400, 'Broadcast connection metadata contains unsupported or secret-bearing fields.');
  if (root['format'] !== 'thsv-broadcast-connections-metadata-v1' || !Array.isArray(root['connections']) || root['connections'].length > 24) throw new BroadcastConnectionVaultError(400, 'Broadcast connection metadata has an unsupported format.');
  const ids = new Set<string>();
  return root['connections'].map((entry) => {
    const item = object(entry, 'Broadcast connection metadata entry must be an object.');
    const allowed = new Set(['id', 'name', 'provider', 'url', 'enabled', 'credentialRequired', 'rotationReminderDays', 'latencyWarningMs']);
    if (Object.keys(item).some((key) => !allowed.has(key))) throw new BroadcastConnectionVaultError(400, 'Broadcast connection metadata entries cannot contain credentials or unsupported fields.');
    const id = optionalId(item['id']);
    if (id === undefined || ids.has(id)) throw new BroadcastConnectionVaultError(400, 'Imported connection IDs must be unique UUIDs.');
    ids.add(id);
    const provider = parseProvider(item['provider']);
    if (typeof item['credentialRequired'] !== 'boolean') throw new BroadcastConnectionVaultError(400, 'credentialRequired must be true or false for every imported connection.');
    const rotationReminderDays = optionalInteger(item['rotationReminderDays'], 'rotationReminderDays', 1, 3650); const latencyWarningMs = optionalInteger(item['latencyWarningMs'], 'latencyWarningMs', 100, 30_000);
    return { id, name: boundedString(item['name'], 'name', 60), provider, url: localWebSocketUrl(item['url'], provider), enabled: item['enabled'] !== false, credentialRequired: item['credentialRequired'], ...(rotationReminderDays === undefined ? {} : { rotationReminderDays }), ...(latencyWarningMs === undefined ? {} : { latencyWarningMs }) };
  });
}
function object(value: unknown, message: string): Record<string, unknown> { if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new BroadcastConnectionVaultError(400, message); return value as Record<string, unknown>; }
function parseProvider(value: unknown): BroadcastConnectionProvider { if (!PROVIDERS.includes(value as BroadcastConnectionProvider)) throw new BroadcastConnectionVaultError(400, 'provider must be obs, meld, or streamlabs.'); return value as BroadcastConnectionProvider; }
function boundedString(value: unknown, label: string, maximum: number): string { if (typeof value !== 'string' || value.trim() === '' || value.trim().length > maximum) throw new BroadcastConnectionVaultError(400, `${label} is required and must be ${String(maximum)} characters or fewer.`); return value.trim(); }
function optionalId(value: unknown): string | undefined { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value) ? value : undefined; }
function optionalInteger(value: unknown, label: string, minimum: number, maximum: number): number | undefined { if (value === undefined || value === null || value === '') return undefined; if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new BroadcastConnectionVaultError(400, `${label} must be an integer from ${String(minimum)} through ${String(maximum)}.`); return value as number; }
function localWebSocketUrl(value: unknown, provider: BroadcastConnectionProvider): string {
  if (typeof value !== 'string' || value.length > 200) throw new BroadcastConnectionVaultError(400, 'A local WebSocket URL is required.');
  let parsed: URL; try { parsed = new URL(value); } catch { throw new BroadcastConnectionVaultError(400, 'WebSocket URL is invalid.'); }
  if (!['ws:', 'wss:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') throw new BroadcastConnectionVaultError(400, 'Only credential-free loopback WebSocket URLs are allowed.');
  if (provider === 'streamlabs' && !parsed.pathname.endsWith('/api/websocket')) throw new BroadcastConnectionVaultError(400, 'Streamlabs Desktop URL must end with /api/websocket.');
  return parsed.toString().replace(/\/$/u, parsed.pathname === '/' ? '' : '/');
}
