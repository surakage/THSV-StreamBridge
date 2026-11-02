import { z } from 'zod';

/**
 * Control Deck (v1): one pop-out window with one tab per extension. Each extension returns a
 * small data description of its controls (a "view") and the Bridge renders it. The Bridge checks
 * the request shape and the view shape; the extension checks what the request means.
 */

/** The fixed, friendly tab order. Every id is listed even when that extension has no hook yet. */
export const CONTROL_DECK_MODULE_IDS = Object.freeze([
  'thsv.streamer-punishments',
  'thsv.prize-wheel',
  'thsv.stream-session-guard',
  'thsv.village-jukebox',
  'thsv.viewer-lobby',
  'thsv.village-draw',
  'thsv.village-polls',
  'thsv.subathon-timer',
  'thsv.custom-counter',
  'thsv.face-filters',
  'thsv.voice-relay',
  'thsv.quote-vault',
  'thsv.chat-play-pack',
  'thsv.goal-bars',
  'thsv.starting-soon-countdown',
  'thsv.random-clip-player',
  'thsv.raid-scout',
  'thsv.end-credits',
] as const);

/** Names from each extension's manifest, used while the extension is not loaded. */
export const CONTROL_DECK_FALLBACK_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'thsv.streamer-punishments': 'Streamer Punishments',
  'thsv.prize-wheel': 'Prize Wheel',
  'thsv.stream-session-guard': 'Stream Break & End Guard',
  'thsv.village-jukebox': 'Village Jukebox',
  'thsv.viewer-lobby': 'Viewer Lobby',
  'thsv.village-draw': 'Village Draw',
  'thsv.village-polls': 'Village Polls',
  'thsv.subathon-timer': 'Subathon Timer',
  'thsv.custom-counter': 'Custom Counter',
  'thsv.face-filters': 'Face Filters',
  'thsv.voice-relay': 'Village Voice',
  'thsv.quote-vault': 'Quote Vault',
  'thsv.chat-play-pack': 'Chat Play Pack',
  'thsv.goal-bars': 'Goal Bars',
  'thsv.starting-soon-countdown': 'Stream Launch Countdown',
  'thsv.random-clip-player': 'Random Clip Player',
  'thsv.raid-scout': 'Raid Scout',
  'thsv.end-credits': 'End Credits',
});

export const CONTROL_DECK_MAXIMUM_VIEW_BYTES = 262_144;
export const CONTROL_DECK_MAXIMUM_ITEMS = 200;

const operationSchema = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/u, 'Choose a valid control.');
const argumentsSchema = z.record(z.string().min(1).max(64), z.json())
  .refine((value) => Object.keys(value).length <= 32, 'Too many values were sent.')
  .refine((value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 16_384, 'The values sent were too large.');

export const controlDeckRequestSchema = z.object({ operation: operationSchema, args: argumentsSchema.optional() }).strict();

/** What the page posts to /wizard/api/control-deck/run. */
export const controlDeckRunBodySchema = z.object({
  moduleId: z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u).max(100),
  operation: operationSchema,
  args: argumentsSchema.optional(),
}).strict();

const text = (maximum: number) => z.string().max(maximum);
const label = (maximum: number) => z.string().min(1).max(maximum);

const actionSchema = z.object({
  operation: operationSchema,
  label: label(60),
  args: argumentsSchema.optional(),
  confirm: text(300).optional(),
  tone: z.enum(['primary', 'danger', 'default']).optional(),
  disabled: z.boolean().optional(),
});

const inputSchema = z.object({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/u),
  label: label(80),
  type: z.enum(['text', 'number', 'url', 'select']),
  value: z.union([text(2_000), z.number()]).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  maxLength: z.number().int().min(1).max(2_000).optional(),
  placeholder: text(120).optional(),
  options: z.array(z.object({ value: text(200), label: label(120) })).max(100).optional(),
});

const sectionSchema = z.object({
  title: label(80),
  fields: z.array(z.object({ label: label(80), value: text(500) })).max(50).optional(),
  items: z.array(z.object({
    id: label(200),
    label: label(200),
    detail: text(500).optional(),
    actions: z.array(actionSchema).max(8).optional(),
  })).max(CONTROL_DECK_MAXIMUM_ITEMS).optional(),
  actions: z.array(actionSchema).max(12).optional(),
  form: z.object({ operation: operationSchema, submitLabel: label(40), inputs: z.array(inputSchema).min(1).max(12) }).optional(),
});

export const controlDeckViewSchema = z.object({
  title: label(80),
  status: text(300).optional(),
  message: text(500).optional(),
  sections: z.array(sectionSchema).max(30),
})
  .refine((view) => view.sections.reduce((sum, section) => sum + (section.items?.length ?? 0), 0) <= CONTROL_DECK_MAXIMUM_ITEMS, `A control panel can show at most ${String(CONTROL_DECK_MAXIMUM_ITEMS)} rows.`)
  .refine((view) => Buffer.byteLength(JSON.stringify(view), 'utf8') <= CONTROL_DECK_MAXIMUM_VIEW_BYTES, 'The control panel was too large to show.');

export type ControlDeckRequestV1 = z.infer<typeof controlDeckRequestSchema>;
export type ControlDeckViewV1 = z.infer<typeof controlDeckViewSchema>;

export interface ControlDeckTabV1 {
  readonly moduleId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly reason?: string;
}

/** A refusal with plain words for the page and the HTTP status to send. */
export class ControlDeckError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}
