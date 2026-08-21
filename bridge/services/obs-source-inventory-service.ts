import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MAXIMUM_FILE_BYTES = 64 * 1024;
const MAXIMUM_SOURCES = 100;
const ID = /^[a-z][a-z0-9-]{2,80}$/u;
const MODULE_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;

export interface ExpectedObsSource {
  readonly id: string;
  readonly label: string;
  readonly scene: string;
  readonly surface: string;
  readonly moduleId?: string;
  readonly minimumCount: number;
  readonly required: boolean;
}

export class ObsSourceInventoryService {
  private readonly path: string;
  private sources: ExpectedObsSource[] = [];
  private writes: Promise<void> = Promise.resolve();

  public constructor(stateRoot: string) { this.path = join(stateRoot, 'obs-source-inventory.json'); }

  public async start(): Promise<void> {
    try {
      const raw = await readFile(this.path, 'utf8');
      if (Buffer.byteLength(raw) > MAXIMUM_FILE_BYTES) return;
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(value['sources'])) this.sources = value['sources'].flatMap(parseSource).slice(0, MAXIMUM_SOURCES);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  public status(overlay: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> {
    const visibility = overlay?.['hostVisibility'];
    const reports = isRecord(visibility) && Array.isArray(visibility['obsSources']) ? visibility['obsSources'].filter(isRecord) : [];
    const sources = this.sources.map((expected) => {
      const matches = reports.filter((report) => report['scene'] === expected.scene && report['surface'] === expected.surface && (expected.moduleId === undefined || report['moduleId'] === expected.moduleId));
      const visible = matches.filter((report) => report['visible'] === true).length;
      return { ...expected, connectedCount: matches.length, visibleCount: visible, ready: visible >= expected.minimumCount };
    });
    const required = sources.filter((source) => source.required);
    const grouped = new Map<string, { scene: string; surface: string; moduleId?: string; connectedCount: number; visibleCount: number }>();
    for (const report of reports) {
      const scene = report['scene']; const surface = report['surface']; const moduleId = report['moduleId'];
      if (typeof scene !== 'string' || scene.trim().length === 0 || typeof surface !== 'string' || !surface.startsWith('/overlay/')) continue;
      const key = JSON.stringify([scene, surface, typeof moduleId === 'string' ? moduleId : '']); const current = grouped.get(key);
      grouped.set(key, { scene, surface, ...(typeof moduleId === 'string' && moduleId.length > 0 ? { moduleId } : {}), connectedCount: (current?.connectedCount ?? 0) + 1, visibleCount: (current?.visibleCount ?? 0) + (report['visible'] === true ? 1 : 0) });
    }
    const detected = [...grouped.values()];
    const discovered = detected.filter((candidate) => !this.sources.some((source) => source.scene === candidate.scene && source.surface === candidate.surface && source.moduleId === candidate.moduleId)).map((candidate) => ({
      ...candidate,
      suggestedId: `obs-${createHash('sha256').update(JSON.stringify([candidate.scene, candidate.surface, candidate.moduleId ?? ''])).digest('hex').slice(0, 16)}`,
      suggestedLabel: friendlySourceLabel(candidate.surface, candidate.moduleId),
      minimumCount: Math.max(1, candidate.visibleCount),
      required: true,
    })).sort((left, right) => left.scene.localeCompare(right.scene) || left.surface.localeCompare(right.surface));
    const reconciliations = sources.filter((source) => !source.ready).flatMap((source) => {
      const suggestion = detected.filter((candidate) => (candidate.scene !== source.scene || candidate.surface !== source.surface || candidate.moduleId !== source.moduleId) && !this.sources.some((saved) => saved.id !== source.id && saved.scene === candidate.scene && saved.surface === candidate.surface && saved.moduleId === candidate.moduleId)).map((candidate) => ({ candidate, score: (candidate.surface === source.surface ? 4 : 0) + (candidate.scene === source.scene ? 2 : 0) + (candidate.moduleId === source.moduleId ? 1 : 0) })).filter((item) => item.score >= 3).sort((left, right) => right.score - left.score || right.candidate.visibleCount - left.candidate.visibleCount)[0]?.candidate;
      if (suggestion === undefined) return [];
      const reason = suggestion.surface === source.surface ? `Detected the same StreamBridge surface in scene “${suggestion.scene}”.` : `Detected a matching source in scene “${suggestion.scene}” at ${suggestion.surface}.`;
      return [{ sourceId: source.id, label: source.label, reason, suggested: { scene: suggestion.scene, surface: suggestion.surface, ...(suggestion.moduleId === undefined ? {} : { moduleId: suggestion.moduleId }), connectedCount: suggestion.connectedCount, visibleCount: suggestion.visibleCount } }];
    });
    return { configured: sources.length > 0, ready: required.length > 0 && required.every((source) => source.ready), requiredCount: required.length, readyRequiredCount: required.filter((source) => source.ready).length, sources, discovered, reconciliations };
  }

  public replace(input: unknown): Readonly<Record<string, unknown>> {
    if (!isRecord(input) || input['approvedByCreator'] !== true || !Array.isArray(input['sources'])) throw new ObsSourceInventoryError(403, 'Saving the expected OBS inventory requires explicit creator approval and a sources array.');
    if (input['sources'].length > MAXIMUM_SOURCES) throw new ObsSourceInventoryError(400, `Expected OBS inventory cannot exceed ${String(MAXIMUM_SOURCES)} entries.`);
    const parsed = input['sources'].flatMap(parseSource);
    if (parsed.length !== input['sources'].length) throw new ObsSourceInventoryError(400, 'One or more expected OBS source entries are invalid.');
    if (new Set(parsed.map((source) => source.id)).size !== parsed.length) throw new ObsSourceInventoryError(400, 'Expected OBS source IDs must be unique.');
    this.sources = parsed;
    this.queueWrite();
    return { saved: true, sources: this.sources };
  }

  public async flush(): Promise<void> { await this.writes; }

  private queueWrite(): void {
    this.writes = this.writes.then(async () => {
      const encoded = `${JSON.stringify({ version: 1, sources: this.sources }, null, 2)}\n`;
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.path);
    }).catch(() => undefined);
  }
}

export class ObsSourceInventoryError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

function parseSource(value: unknown): ExpectedObsSource[] {
  if (!isRecord(value)) return [];
  const id = value['id']; const label = value['label']; const scene = value['scene']; const surface = value['surface']; const moduleId = value['moduleId']; const minimumCount = value['minimumCount'];
  if (typeof id !== 'string' || !ID.test(id) || typeof label !== 'string' || label.trim().length < 1 || label.length > 120 || typeof scene !== 'string' || scene.trim().length < 1 || scene.length > 200 || typeof surface !== 'string' || !surface.startsWith('/overlay/') || surface.length > 200) return [];
  if (moduleId !== undefined && moduleId !== '' && (typeof moduleId !== 'string' || !MODULE_ID.test(moduleId))) return [];
  if (!Number.isSafeInteger(minimumCount) || (minimumCount as number) < 1 || (minimumCount as number) > 10) return [];
  return [{ id, label: label.trim(), scene: scene.trim(), surface, ...(typeof moduleId === 'string' && moduleId.length > 0 ? { moduleId } : {}), minimumCount: minimumCount as number, required: value['required'] !== false }];
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function friendlySourceLabel(surface: string, moduleId?: string): string {
  const raw = moduleId?.split('.').at(-1) ?? surface.replace(/^\/overlay\//u, '').split(':', 1)[0] ?? 'StreamBridge source';
  return raw.split(/[-_]+/u).filter(Boolean).map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`).join(' ').slice(0, 120) || 'StreamBridge source';
}
