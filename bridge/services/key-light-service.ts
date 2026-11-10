import { randomUUID } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { Logger } from './logger.js';

// Scene lights: sets Elgato Key Lights (and other Elgato lights that speak the same local protocol) when the
// scene changes. Lights are found on the home network or added by address, and are only ever reached on a
// private address at the fixed Elgato port, so the Bridge cannot be pointed at anything else.

const ELGATO_PORT = 9123;
const MAXIMUM_LIGHTS = 8;
const MAXIMUM_SCENES = 40;
const REQUEST_TIMEOUT_MS = 2_500;
const DISCOVERY_MS = 2_000;
const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;

export interface KeyLight { readonly name: string; readonly address: string }
export interface KeyLightScene { readonly scene: string; readonly on: boolean; readonly brightness: number; readonly temperature: number }
export interface KeyLightSettings { readonly enabled: boolean; readonly lights: readonly KeyLight[]; readonly scenes: readonly KeyLightScene[] }
export interface KeyLightState { readonly on: boolean; readonly brightness: number; readonly temperature: number }

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export class KeyLightError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

export class KeyLightService {
  private settings: KeyLightSettings = { enabled: false, lights: [], scenes: [] };
  private writes: Promise<void> = Promise.resolve();
  private applying: Promise<void> = Promise.resolve();

  public constructor(
    private readonly path: string,
    private readonly logger: Pick<Logger, 'info' | 'warn'>,
    private readonly request: Fetch = fetch,
    private readonly findAddresses: () => Promise<readonly string[]> = discoverElgatoAddresses,
  ) {}

  public async start(): Promise<void> {
    try { this.settings = normalizeSettings(JSON.parse(await readFile(this.path, 'utf8')) as unknown); }
    catch { /* Nothing saved yet: scene lights stay off. */ }
  }

  public status(): KeyLightSettings { return this.settings; }

  public async save(input: unknown): Promise<KeyLightSettings> {
    this.settings = normalizeSettings(input, true);
    const encoded = `${JSON.stringify({ version: 1, ...this.settings }, null, 2)}\n`;
    this.writes = this.writes.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.path);
    });
    await this.writes;
    return this.settings;
  }

  /** Looks for Elgato lights on the home network and returns each one that answers, with its name. */
  public async discover(): Promise<readonly KeyLight[]> {
    const found: KeyLight[] = [];
    for (const address of [...new Set(await this.findAddresses())].filter(isPrivateAddress).slice(0, 32)) {
      try {
        const info = await this.call(address, '/elgato/accessory-info');
        const record = isRecord(info) ? info : {};
        const name = [record['displayName'], record['productName']].find((value): value is string => typeof value === 'string' && value.trim() !== '');
        found.push({ name: (name ?? 'Elgato light').trim().slice(0, 60), address });
      } catch { /* Not an Elgato light, or it did not answer in time. */ }
      if (found.length >= MAXIMUM_LIGHTS) break;
    }
    return found;
  }

  /** Reads a light's current state, which proves the address is right. */
  public async test(input: unknown): Promise<KeyLightState> {
    const address = isRecord(input) && typeof input['address'] === 'string' ? input['address'].trim() : '';
    if (!isPrivateAddress(address)) throw new KeyLightError(400, 'Enter the light\'s address on your home network, for example 192.168.1.50.');
    try { return readState(await this.call(address, '/elgato/lights')); }
    catch (error) { if (error instanceof KeyLightError) throw error; throw new KeyLightError(502, 'That light did not answer. Check that it is on and on the same network as this PC.'); }
  }

  public observe(event: NormalizedEvent): void {
    if (event.eventType !== 'stream.scene-changed' || event.metadata.simulated || !this.settings.enabled) return;
    const sceneName = typeof event.payload['sceneName'] === 'string' ? event.payload['sceneName'] : '';
    const scene = this.settings.scenes.find((item) => item.scene.toLowerCase() === sceneName.trim().toLowerCase());
    if (scene === undefined || this.settings.lights.length === 0) return;
    this.applying = this.applying.then(() => this.apply(scene)).catch(() => undefined);
  }

  public async flush(): Promise<void> { await this.applying; await this.writes.catch(() => undefined); }

  private async apply(scene: KeyLightScene): Promise<void> {
    const body = JSON.stringify({ numberOfLights: 1, lights: [{ on: scene.on ? 1 : 0, brightness: scene.brightness, temperature: kelvinToElgato(scene.temperature) }] });
    const results = await Promise.allSettled(this.settings.lights.map((light) => this.call(light.address, '/elgato/lights', body)));
    const failed = this.settings.lights.filter((_, index) => results[index]?.status === 'rejected').map((light) => light.name);
    if (failed.length > 0) this.logger.warn('A scene light did not answer', { scene: scene.scene, lights: failed });
    else this.logger.info('Scene lights set', { scene: scene.scene, lights: this.settings.lights.length, on: scene.on });
  }

  private async call(address: string, path: string, body?: string): Promise<unknown> {
    const response = await this.request(`http://${address}:${String(ELGATO_PORT)}${path}`, { method: body === undefined ? 'GET' : 'PUT', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Light answered ${String(response.status)}`);
    return await response.json();
  }
}

/** Elgato lights use mireds (143 = 7000 K, 344 = 2900 K). */
export function kelvinToElgato(kelvin: number): number { return Math.min(344, Math.max(143, Math.round(1_000_000 / kelvin))); }

export function isPrivateAddress(address: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(address);
  if (match === null) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return false;
  const [first = 0, second = 0] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 169 && second === 254);
}

function readState(value: unknown): KeyLightState {
  const light = isRecord(value) && Array.isArray(value['lights']) && isRecord(value['lights'][0]) ? value['lights'][0] : undefined;
  if (light === undefined) throw new KeyLightError(502, 'That address answered, but not like an Elgato light.');
  const mired = Number(light['temperature']);
  return { on: light['on'] === 1 || light['on'] === true, brightness: clamp(Number(light['brightness']), 0, 100, 0), temperature: Number.isFinite(mired) && mired > 0 ? Math.round(1_000_000 / mired / 50) * 50 : 4500 };
}

function normalizeSettings(value: unknown, strict = false): KeyLightSettings {
  const input = isRecord(value) ? value : {};
  const lights: KeyLight[] = [];
  for (const item of Array.isArray(input['lights']) ? input['lights'] : []) {
    if (!isRecord(item)) continue;
    const address = typeof item['address'] === 'string' ? item['address'].trim() : '';
    if (!isPrivateAddress(address)) { if (strict) throw new KeyLightError(400, 'Each light needs its address on your home network, for example 192.168.1.50.'); continue; }
    if (lights.some((light) => light.address === address)) continue;
    const name = typeof item['name'] === 'string' && item['name'].trim() !== '' ? item['name'].trim().slice(0, 60) : 'Elgato light';
    lights.push({ name, address });
  }
  const scenes: KeyLightScene[] = [];
  for (const item of Array.isArray(input['scenes']) ? input['scenes'] : []) {
    if (!isRecord(item)) continue;
    const scene = typeof item['scene'] === 'string' ? item['scene'].trim().slice(0, 200) : '';
    if (scene === '' || scenes.some((existing) => existing.scene.toLowerCase() === scene.toLowerCase())) continue;
    scenes.push({ scene, on: item['on'] !== false, brightness: clamp(Number(item['brightness']), 3, 100, 40), temperature: clamp(Number(item['temperature']), 2900, 7000, 4500) });
  }
  if (strict && lights.length > MAXIMUM_LIGHTS) throw new KeyLightError(400, `Scene lights can control up to ${String(MAXIMUM_LIGHTS)} lights.`);
  return { enabled: input['enabled'] === true, lights: lights.slice(0, MAXIMUM_LIGHTS), scenes: scenes.slice(0, MAXIMUM_SCENES) };
}

function clamp(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value))) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

/** Asks the local network (mDNS) which devices offer the Elgato light service and returns the addresses that answer. */
export async function discoverElgatoAddresses(waitMs = DISCOVERY_MS): Promise<readonly string[]> {
  return await new Promise((resolve) => {
    const addresses = new Set<string>();
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    const finish = (): void => { try { socket.close(); } catch { /* Already closed. */ } resolve([...addresses]); };
    socket.on('error', finish);
    socket.on('message', (message, sender) => { if (message.includes('_elg')) addresses.add(sender.address); });
    socket.bind(0, () => {
      try { socket.send(mdnsQuery('_elg._tcp.local'), MDNS_PORT, MDNS_ADDRESS); } catch { finish(); return; }
      setTimeout(finish, waitMs).unref();
    });
  });
}

function mdnsQuery(name: string): Buffer {
  const labels = name.split('.').flatMap((label) => [Buffer.from([label.length]), Buffer.from(label, 'ascii')]);
  // Header: one question. Question: PTR (12), class IN with the "answer me directly" bit set.
  return Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]), ...labels, Buffer.from([0, 0, 12, 0x80, 1])]);
}
