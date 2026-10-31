import { MAIN_FEATURE_PRESENTATION_POLICY } from '../core/main-feature-registry.js';
import type { ObsLayoutItem, ObsLayoutSnapshot } from './obs-direct-scene-client.js';

export type LayoutRole = 'overlay' | 'camera' | 'other';

export interface LayoutBox {
  readonly name: string;
  readonly role: LayoutRole;
  /** Where the visible part sits on the canvas: for full-screen StreamBridge overlays, the card inside it. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly overlay?: string;
  readonly estimated: boolean;
  /** Custom CSS moves this overlay's content, so its spot is a guess and it is not used for warnings. */
  readonly uncertain?: boolean;
  /** Stays on screen (chat, captions, timers, trackers, goals) rather than popping up for a moment. */
  readonly persistent?: boolean;
}

export interface LayoutWarning {
  readonly kind: 'overlays-overlap' | 'overlay-covers-camera';
  readonly scene: string;
  readonly sources: readonly [string, string];
  readonly detail: string;
  readonly fix: string;
}

export interface LayoutReport {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly scenes: readonly { readonly name: string; readonly boxes: readonly LayoutBox[]; readonly warnings: readonly LayoutWarning[] }[];
  readonly warningCount: number;
}

const CARD_WIDTH = { small: 620, regular: 960, large: 1280 } as const;
const CARD_HEIGHT = { small: 220, regular: 300, large: 400 } as const;
const CAMERA_KINDS = new Set(['dshow_input', 'av_capture_input', 'v4l2_input', 'decklink-input']);
const CAMERA_NAME = /\b(?:cam|camera|webcam|facecam|elgato|streamfog|vcd)\b/iu;

/**
 * Turns OBS's scene layout into the boxes a viewer actually sees and flags StreamBridge overlays that
 * sit on top of each other or over the camera. A full-screen StreamBridge add-on overlay only shows a
 * card at its chosen position (?cardPosition, ?cardScale), so the card is what is compared, not the
 * whole transparent page. Read-only and approximate: cards grow with their text.
 */
export function analyzeOverlayLayout(snapshot: ObsLayoutSnapshot, overlayOrigins: readonly string[]): LayoutReport {
  const canvas = snapshot.canvas;
  const scenes = snapshot.scenes.map((scene) => {
    const boxes = scene.items.filter((item) => !item.isGroup && item.width > 0 && item.height > 0).map((item) => toBox(item, canvas, overlayOrigins)).filter((box): box is LayoutBox => box !== undefined);
    const warnings: LayoutWarning[] = [];
    const overlays = boxes.filter((box) => box.role === 'overlay');
    for (let first = 0; first < overlays.length; first += 1) {
      for (let second = first + 1; second < overlays.length; second += 1) {
        const a = overlays[first]; const b = overlays[second];
        if (a === undefined || b === undefined || a.overlay === b.overlay || a.uncertain === true || b.uncertain === true) continue;
        // Pop-up cards only show for a moment, and queued ones take turns, so only flag a clash with
        // something that stays on screen.
        if (a.persistent !== true && b.persistent !== true) continue;
        if (takeTurns(a.overlay, b.overlay)) continue;
        const shared = overlapArea(a, b);
        if (shared > 0.15 * Math.min(area(a), area(b))) warnings.push({ kind: 'overlays-overlap', scene: scene.name, sources: [a.name, b.name], detail: `"${a.name}" and "${b.name}" show in the same spot in "${scene.name}".`, fix: fixFor(a, b) });
      }
    }
    for (const camera of boxes.filter((box) => box.role === 'camera')) {
      for (const overlay of overlays) {
        if (overlay.uncertain === true) continue;
        if (overlapArea(camera, overlay) > 0.12 * area(camera)) warnings.push({ kind: 'overlay-covers-camera', scene: scene.name, sources: [overlay.name, camera.name], detail: `"${overlay.name}" covers part of your camera "${camera.name}" in "${scene.name}".`, fix: fixFor(overlay) });
      }
    }
    return { name: scene.name, boxes, warnings };
  });
  return { canvas, scenes, warningCount: scenes.reduce((total, scene) => total + scene.warnings.length, 0) };
}

function toBox(item: ObsLayoutItem, canvas: { readonly width: number; readonly height: number }, overlayOrigins: readonly string[]): LayoutBox | undefined {
  const { left, top } = topLeft(item);
  const base = { name: item.name, x: left, y: top, width: item.width, height: item.height };
  const overlay = overlayPath(item.url, overlayOrigins);
  if (overlay !== undefined) {
    const fullScreen = item.width >= canvas.width * 0.9 && item.height >= canvas.height * 0.9;
    const persistent = isPersistent(overlay.path);
    // Browser sources are transparent pages, so an OBS box says little about where the content is. Only the
    // chat box (sized to its messages) and pop-up cards placed by ?cardPosition are precise enough to flag.
    if (!fullScreen) return { ...base, role: 'overlay', overlay: overlay.path, estimated: false, persistent, ...(TIGHT_OVERLAYS.has(overlay.path) ? {} : { uncertain: true }) };
    // A full-screen page only draws part of itself. Pop-up cards are placed by ?cardPosition; for
    // alerts, timers and widgets the spot is not known here, so they are shown but never flagged.
    if (item.customCss === true || !isCardOverlay(overlay.path)) return { ...base, role: 'overlay', overlay: overlay.path, estimated: true, uncertain: true, persistent };
    // The card inside a full-screen add-on overlay, placed like addon-host.css does it.
    const scale = overlay.scale; const scaleX = item.width / 1920; const scaleY = item.height / 1080;
    const width = Math.min(CARD_WIDTH[scale], 1920 * 0.92) * scaleX; const height = CARD_HEIGHT[scale] * scaleY; const padding = 32 * scaleX;
    const position = overlay.position;
    const x = position.endsWith('left') ? left + padding : position.endsWith('right') ? left + item.width - padding - width : left + (item.width - width) / 2;
    const y = position.startsWith('top') ? top + padding : position.startsWith('bottom') ? top + item.height - padding - height : top + (item.height - height) / 2;
    return { name: item.name, role: 'overlay', overlay: overlay.path, x, y, width, height, estimated: true, persistent };
  }
  if (CAMERA_KINDS.has(item.kind) || (CAMERA_NAME.test(item.name) && item.kind !== 'image_source' && item.kind !== 'text_gdiplus_v3')) return { ...base, role: 'camera', estimated: false };
  return undefined;
}

function overlayPath(url: string | undefined, origins: readonly string[]): { path: string; position: string; scale: 'small' | 'regular' | 'large' } | undefined {
  if (url === undefined || url === '') return undefined;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return undefined; }
  if (!origins.includes(parsed.origin) || !parsed.pathname.startsWith('/overlay')) return undefined;
  const position = parsed.searchParams.get('cardPosition') ?? 'center';
  const scaleParameter = parsed.searchParams.get('cardScale');
  return { path: parsed.pathname.replace(/\/+$/u, ''), position, scale: scaleParameter === 'small' || scaleParameter === 'large' ? scaleParameter : 'regular' };
}

/** OBS positions an item by its alignment point; turn that into the top-left corner. */
function topLeft(item: ObsLayoutItem): { left: number; top: number } {
  const horizontal = (item.alignment & 1) !== 0 ? 0 : (item.alignment & 2) !== 0 ? 1 : 0.5;
  const vertical = (item.alignment & 4) !== 0 ? 0 : (item.alignment & 8) !== 0 ? 1 : 0.5;
  return { left: item.x - item.width * horizontal, top: item.y - item.height * vertical };
}

const PERSISTENT_OVERLAYS = new Set(['/overlay/chat', '/overlay/captions', ...['thsv.subathon-timer', 'thsv.stream-labels', 'thsv.custom-counter', 'thsv.goal-bars', 'thsv.polls-predictions', 'thsv.village-polls', 'thsv.accessibility-captions', ...MAIN_FEATURE_PRESENTATION_POLICY.timerLane].map((id) => `/overlay/addons/${id}`)]);
const TIGHT_OVERLAYS = new Set(['/overlay/chat']);
function isPersistent(path: string): boolean { return PERSISTENT_OVERLAYS.has(path); }
function isCardOverlay(path: string): boolean { return path.startsWith('/overlay/addons/') && !PERSISTENT_OVERLAYS.has(path); }
function takeTurns(left: string | undefined, right: string | undefined): boolean {
  const queued = new Set(MAIN_FEATURE_PRESENTATION_POLICY.foregroundQueue.map((id) => `/overlay/addons/${id}`));
  return left !== undefined && right !== undefined && queued.has(left) && queued.has(right);
}

function area(box: LayoutBox): number { return Math.max(0, box.width) * Math.max(0, box.height); }
function overlapArea(a: LayoutBox, b: LayoutBox): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

function fixFor(...boxes: LayoutBox[]): string {
  const card = boxes.find((box) => box.estimated);
  if (card !== undefined) return `Open that feature's Overlay tab in the Wizard and pick another Card position or a smaller Card size for "${card.name}", then update its browser source URL.`;
  return `Move or resize "${boxes[0]?.name ?? 'the overlay'}" in OBS so it no longer overlaps.`;
}
