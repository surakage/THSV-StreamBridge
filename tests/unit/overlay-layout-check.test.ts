import { describe, expect, it } from 'vitest';
import { analyzeOverlayLayout } from '../../bridge/services/overlay-layout-check.js';
import type { ObsLayoutItem } from '../../bridge/services/obs-direct-scene-client.js';

const ORIGIN = 'http://127.0.0.1:8787';
const TOP_LEFT = 5; // OBS alignment: left (1) + top (4)
const item = (name: string, kind: string, x: number, y: number, width: number, height: number, url?: string): ObsLayoutItem => ({ name, kind, isGroup: false, x, y, width, height, alignment: TOP_LEFT, ...(url === undefined ? {} : { url }) });

describe('overlay layout check', () => {
  it('compares the card inside full-screen overlays, not the whole transparent page', () => {
    const report = analyzeOverlayLayout({ canvas: { width: 1920, height: 1080 }, scenes: [{ name: 'Gameplay', items: [
      item('8-Ball', 'browser_source', 0, 0, 1920, 1080, `${ORIGIN}/overlay/addons/thsv.magic-eight-ball?cardPosition=top-left&cardScale=small`),
      item('Translate', 'browser_source', 0, 0, 1920, 1080, `${ORIGIN}/overlay/addons/thsv.user-translate?cardPosition=bottom-center`),
    ] }] }, [ORIGIN]);
    expect(report.warningCount).toBe(0);
    expect(report.scenes[0]?.boxes.find((box) => box.name === '8-Ball')).toMatchObject({ x: 32, y: 32, width: 620, height: 220, estimated: true });
  });

  it('warns when two overlays share a spot or an overlay covers the camera, and says how to fix it', () => {
    const report = analyzeOverlayLayout({ canvas: { width: 1920, height: 1080 }, scenes: [{ name: 'Just Chatting', items: [
      item('Punishments', 'browser_source', 0, 0, 1920, 1080, `${ORIGIN}/overlay/addons/thsv.streamer-punishments?cardPosition=bottom-right`),
      item('8-Ball', 'browser_source', 0, 0, 1920, 1080, `${ORIGIN}/overlay/addons/thsv.magic-eight-ball?cardPosition=bottom-right`),
      item('Chat', 'browser_source', 1500, 100, 400, 900, `${ORIGIN}/overlay/chat`),
      item('Captions', 'browser_source', 0, 700, 1920, 300, `${ORIGIN}/overlay/captions`),
      item('[VCD] Elgato', 'dshow_input', 1400, 500, 500, 400),
      item('Background', 'image_source', 0, 0, 1920, 1080),
      item('Other site', 'browser_source', 0, 0, 400, 400, 'https://example.com/widget'),
    ] }] }, [ORIGIN]);
    const kinds = report.scenes[0]?.warnings.map((warning) => `${warning.kind}:${warning.sources.join('+')}`);
    expect(kinds).toEqual(expect.arrayContaining(['overlays-overlap:8-Ball+Chat', 'overlay-covers-camera:8-Ball+[VCD] Elgato', 'overlay-covers-camera:Chat+[VCD] Elgato']));
    // Timers, captions and other transparent pages only show where their content is, which is not known here.
    expect(kinds?.some((kind) => kind.includes('Punishments') || kind.includes('Captions'))).toBe(false);
    expect(report.scenes[0]?.boxes.map((box) => box.name)).not.toContain('Other site');
    expect(report.scenes[0]?.warnings.find((warning) => warning.sources[0] === '8-Ball')?.fix).toContain('Card position');
    expect(report.scenes[0]?.warnings.find((warning) => warning.sources[0] === 'Chat')?.fix).toContain('in OBS');
  });

  it('reads OBS alignment so centred and bottom-right anchored items land where OBS draws them', () => {
    const report = analyzeOverlayLayout({ canvas: { width: 1920, height: 1080 }, scenes: [{ name: 'S', items: [
      { name: 'Chat', kind: 'browser_source', isGroup: false, x: 960, y: 540, width: 400, height: 200, alignment: 0, url: `${ORIGIN}/overlay/chat` },
      { name: 'Cam', kind: 'dshow_input', isGroup: false, x: 1920, y: 1080, width: 400, height: 300, alignment: 10 },
    ] }] }, [ORIGIN]);
    expect(report.scenes[0]?.boxes).toEqual([
      expect.objectContaining({ name: 'Chat', x: 760, y: 440 }),
      expect.objectContaining({ name: 'Cam', x: 1520, y: 780 }),
    ]);
  });
});
