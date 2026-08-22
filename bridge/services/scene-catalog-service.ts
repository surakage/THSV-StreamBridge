import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { DirectSceneSnapshot } from './obs-direct-scene-client.js';

export type SceneProvider = 'obs' | 'streamlabs' | 'meld';

interface SceneConnectionState {
  readonly id: string;
  readonly name: string;
  readonly scenes: readonly string[];
  readonly currentScene?: string;
  readonly complete: boolean;
  readonly updatedAt: string;
  readonly error?: string;
  readonly source?: 'direct-websocket' | 'streamerbot-fallback' | 'observed';
}

interface SceneProviderState {
  readonly connections: readonly SceneConnectionState[];
}

type SceneCatalogState = Record<SceneProvider, SceneProviderState>;

const PROVIDERS: readonly SceneProvider[] = ['obs', 'streamlabs', 'meld'];
const MAXIMUM_FILE_BYTES = 256 * 1024;
const MAXIMUM_SCENES = 256;
const MAXIMUM_CONNECTIONS = 16;
const MAXIMUM_NAME_LENGTH = 256;

export const SCENE_CATALOG_ACTION_ID = '76bc0f01-c3b5-5a6b-b692-f5aa89d8d803';

export class SceneCatalogService {
  private readonly path: string;
  private state: SceneCatalogState = emptyState();
  private writes: Promise<void> = Promise.resolve();

  public constructor(
    stateRoot: string,
    private readonly requestRefresh?: (provider: SceneProvider, connectionIndex: number) => Promise<void>,
    private readonly directRefresh?: (provider: SceneProvider, connectionIndex: number) => Promise<DirectSceneSnapshot | undefined>,
  ) { this.path = join(stateRoot, 'scene-catalog.json'); }

  public async start(): Promise<void> {
    try {
      const raw = await readFile(this.path, 'utf8');
      if (Buffer.byteLength(raw) > MAXIMUM_FILE_BYTES) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      this.state = parseState(parsed['providers']);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  public observe(event: NormalizedEvent): void {
    if (event.metadata.simulated) return;
    if (event.eventType === 'stream.scene-changed') this.observeSceneChange(event);
    if (event.eventType === 'system.scene-catalog') this.observeCatalog(event);
  }

  public status(): Readonly<Record<string, unknown>> {
    return {
      version: 1,
      refreshAvailable: this.requestRefresh !== undefined || this.directRefresh !== undefined,
      providers: Object.fromEntries(PROVIDERS.map((provider) => {
        const connections = this.state[provider].connections;
        const scenes = uniqueSorted(connections.flatMap((connection) => connection.scenes));
        return [provider, {
          provider,
          scenes,
          source: connections.some((connection) => connection.source === 'direct-websocket') ? 'direct-websocket' : connections.some((connection) => connection.complete) ? 'streamerbot-fallback' : 'observed',
          complete: connections.length > 0 && connections.every((connection) => connection.complete),
          connections,
          updatedAt: newest(connections.map((connection) => connection.updatedAt)),
        }];
      })),
    };
  }

  public async refresh(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (this.requestRefresh === undefined && this.directRefresh === undefined) throw new SceneCatalogError(503, 'Scene catalog refresh is unavailable because no direct WebSocket or Streamer.bot fallback is configured.');
    if (!isRecord(input) || !isSceneProvider(input['provider'])) throw new SceneCatalogError(400, 'Scene catalog refresh requires provider obs, streamlabs, or meld.');
    const connectionIndex = input['connectionIndex'] ?? 0;
    if (!Number.isSafeInteger(connectionIndex) || (connectionIndex as number) < 0 || (connectionIndex as number) > 15) throw new SceneCatalogError(400, 'connectionIndex must be an integer from 0 through 15.');
    let directError = '';
    if (this.directRefresh !== undefined) {
      try {
        const snapshot = await this.directRefresh(input['provider'], connectionIndex as number);
        if (snapshot !== undefined) {
          this.replaceConnection(input['provider'], { id: snapshot.connectionId, name: snapshot.connectionName, scenes: uniqueSorted(snapshot.scenes), ...(snapshot.currentScene === undefined ? {} : { currentScene: snapshot.currentScene }), complete: true, updatedAt: new Date().toISOString(), source: 'direct-websocket' });
          return { requested: true, provider: input['provider'], connectionIndex, source: 'direct-websocket', status: this.status() };
        }
      } catch (error) { directError = error instanceof Error ? error.message : String(error); }
    }
    if (this.requestRefresh === undefined) throw new SceneCatalogError(503, directError || 'The direct scene WebSocket is unavailable and no Streamer.bot fallback is configured.');
    await this.requestRefresh(input['provider'], connectionIndex as number);
    return { requested: true, provider: input['provider'], connectionIndex, source: 'streamerbot-fallback', ...(directError === '' ? {} : { directError }), status: this.status() };
  }

  public async flush(): Promise<void> { await this.writes; }

  private observeSceneChange(event: NormalizedEvent): void {
    const provider = event.payload['provider'];
    const sceneName = cleanName(event.payload['sceneName']);
    if (!isSceneProvider(provider) || sceneName === undefined) return;
    const oldSceneName = cleanName(event.payload['oldSceneName']);
    const id = cleanName(event.payload['connectionId']) ?? '0';
    const name = cleanName(event.payload['connectionName']) ?? event.channel.name;
    const existing = this.state[provider].connections.find((connection) => connection.id === id);
    this.replaceConnection(provider, {
      id,
      name,
      scenes: uniqueSorted([...(existing?.scenes ?? []), sceneName, ...(oldSceneName === undefined ? [] : [oldSceneName])]),
      currentScene: sceneName,
      complete: existing?.complete ?? false,
      updatedAt: event.receivedAt,
      source: existing?.source ?? 'observed',
      ...(existing?.error === undefined ? {} : { error: existing.error }),
    });
  }

  private observeCatalog(event: NormalizedEvent): void {
    const provider = event.payload['provider'];
    if (!isSceneProvider(provider)) return;
    const rawConnectionIndex = event.payload['connectionIndex'];
    const id = cleanName(event.payload['connectionId']) ?? (typeof rawConnectionIndex === 'number' && Number.isSafeInteger(rawConnectionIndex) ? String(rawConnectionIndex) : '0');
    const name = cleanName(event.payload['connectionName']) ?? provider;
    const incomingScenes = Array.isArray(event.payload['scenes']) ? event.payload['scenes'].flatMap((value) => cleanName(value) ?? []) : [];
    const currentScene = cleanName(event.payload['currentScene']);
    const catalogError = cleanName(event.payload['error']);
    const existing = this.state[provider].connections.find((connection) => connection.id === id);
    const complete = event.payload['complete'] === true;
    this.replaceConnection(provider, {
      id,
      name,
      scenes: uniqueSorted(complete ? incomingScenes : [...(existing?.scenes ?? []), ...incomingScenes]),
      ...(currentScene === undefined ? {} : { currentScene }),
      complete,
      updatedAt: event.receivedAt,
      source: 'streamerbot-fallback',
      ...(catalogError === undefined ? {} : { error: catalogError }),
    });
  }

  private replaceConnection(provider: SceneProvider, connection: SceneConnectionState): void {
    const connections = this.state[provider].connections.filter((candidate) => candidate.id !== connection.id);
    this.state = { ...this.state, [provider]: { connections: [...connections, connection].slice(-MAXIMUM_CONNECTIONS) } };
    this.queueWrite();
  }

  private queueWrite(): void {
    this.writes = this.writes.then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ version: 1, providers: this.state }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.path);
    }).catch(() => undefined);
  }
}

export class SceneCatalogError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

function emptyState(): SceneCatalogState { return { obs: { connections: [] }, streamlabs: { connections: [] }, meld: { connections: [] } }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isSceneProvider(value: unknown): value is SceneProvider { return value === 'obs' || value === 'streamlabs' || value === 'meld'; }
function cleanName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\p{Cc}]/gu, ' ').trim().slice(0, MAXIMUM_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : undefined;
}
function uniqueSorted(values: readonly string[]): readonly string[] { return [...new Set(values.map(cleanName).filter((value): value is string => value !== undefined))].slice(0, MAXIMUM_SCENES).sort((a, b) => a.localeCompare(b)); }
function newest(values: readonly string[]): string | undefined { return [...values].sort().at(-1); }

function parseState(input: unknown): SceneCatalogState {
  if (!isRecord(input)) return emptyState();
  const parseProvider = (provider: SceneProvider): SceneProviderState => {
    const raw = input[provider];
    if (!isRecord(raw) || !Array.isArray(raw['connections'])) return { connections: [] };
    const connections = raw['connections'].flatMap((value): SceneConnectionState[] => {
      if (!isRecord(value)) return [];
      const id = cleanName(value['id']); const name = cleanName(value['name']); const updatedAt = cleanName(value['updatedAt']);
      if (id === undefined || name === undefined || updatedAt === undefined || !Array.isArray(value['scenes'])) return [];
      const currentScene = cleanName(value['currentScene']); const error = cleanName(value['error']); const source = value['source'] === 'direct-websocket' || value['source'] === 'streamerbot-fallback' || value['source'] === 'observed' ? value['source'] : undefined;
      return [{ id, name, scenes: uniqueSorted(value['scenes'].flatMap((scene) => cleanName(scene) ?? [])), ...(currentScene === undefined ? {} : { currentScene }), complete: value['complete'] === true, updatedAt, ...(error === undefined ? {} : { error }), ...(source === undefined ? {} : { source }) }];
    }).slice(0, MAXIMUM_CONNECTIONS);
    return { connections };
  };
  return { obs: parseProvider('obs'), streamlabs: parseProvider('streamlabs'), meld: parseProvider('meld') };
}
