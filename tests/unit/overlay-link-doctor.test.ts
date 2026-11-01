import { describe, expect, it } from 'vitest';
import { linkedFiles, overlayLinkIssues, type OverlayLinkAddOn } from '../../bridge/services/overlay-link-doctor.js';

const scene = (name: string, items: readonly string[]): Record<string, unknown> => ({ id: 'scene', name, settings: { items: items.map((item) => ({ name: item })) } });
const browser = (name: string, url: string): Record<string, unknown> => ({ id: 'browser_source', name, settings: { url } });
const addOn = (moduleId: string, enabled = true): OverlayLinkAddOn => ({ moduleId, enabled, health: 'installed', permissions: ['overlay.publish'] });

describe('Stream Doctor: overlay links and missing files', () => {
  const collection = {
    sources: [
      scene('Just Chatting', ['[B] Chat', '[B] Polls', '[B] Old Port', '[Art] Frame', '[M] Music', '[B] Lobby', '[B] Sound Alerts']),
      scene('Gameplay', ['[B] Polls']),
      browser('[B] Chat', 'http://127.0.0.1:8787/overlay/chat?editPreviewRevision=1'),
      browser('[B] Polls', 'http://127.0.0.1:8787/overlay/addons/thsv.village-polls'),
      browser('[B] Old Port', 'http://localhost:8080/overlay/alerts'),
      browser('[Art] Frame', 'file:///F:/Overlays/scenes/just-chatting.html?preset=full'),
      { id: 'ffmpeg_source', name: '[M] Music', settings: { local_file: 'F:/Audio/Starting Soon.wav' } },
      browser('[B] Lobby', 'http://127.0.0.1:8787/overlay/addons/thsv.viewer-lobby'),
      browser('[B] Sound Alerts', 'https://source.soundalerts.com/alert/abc'),
      browser('[B] Unused', 'http://127.0.0.1:8787/overlay/addons/thsv.gone'),
    ],
  };

  it('lists the local files scenes use, so the caller can check them', () => {
    expect(linkedFiles(collection)).toHaveLength(2);
    expect(linkedFiles(collection).some((file) => file.endsWith('just-chatting.html'))).toBe(true);
  });

  it('flags missing files, the wrong port and add-on overlays that are not installed or turned off', () => {
    const files = linkedFiles(collection);
    const music = files.find((file) => file.endsWith('.wav')) ?? '';
    const issues = overlayLinkIssues(collection, 8787, [addOn('thsv.viewer-lobby', false)], new Set([music]));
    expect(issues.map((issue) => [issue.kind, issue.source])).toEqual([
      ['overlay-not-installed', '[B] Polls'],
      ['wrong-port', '[B] Old Port'],
      ['missing-file', '[Art] Frame'],
      ['overlay-turned-off', '[B] Lobby'],
    ]);
    expect(issues[0]?.fix).toContain('(in "Just Chatting" and "Gameplay")');
    expect(issues[1]?.fix).toContain('Change the port in its URL to 8787');
  });

  it('is quiet when every link works, and ignores sources no scene uses', () => {
    const files = new Set(linkedFiles(collection));
    expect(overlayLinkIssues({ sources: collection.sources.filter((source) => source['name'] !== '[B] Old Port') }, 8787, [addOn('thsv.village-polls'), addOn('thsv.viewer-lobby')], files)).toEqual([]);
  });
});
