import { afterEach, describe, expect, it } from 'vitest';
import { projectBrowserOverlayEvent, setOverlayLanguage } from '../../bridge/core/browser-overlay.js';
import { fixture, testConfig } from '../helpers.js';

describe('default alert thank-you follows the creator language', () => {
  afterEach(() => { setOverlayLanguage('en'); });

  it('keeps English unchanged and shows the creator language otherwise', async () => {
    const source = await fixture('youtube-super-chat.json');
    const event = { ...source, metadata: { ...source.metadata, bridgeSequence: 21 } };
    const config = { ...(await testConfig()).browserOverlay, alerts: { profiles: {} } };

    expect(projectBrowserOverlayEvent(event, config)).toMatchObject({ payload: { display: { thankYou: 'Thank you for supporting the stream, Example_member!' } } });

    setOverlayLanguage('es');
    expect(projectBrowserOverlayEvent(event, config)).toMatchObject({ payload: { display: { thankYou: '¡Gracias por apoyar el directo, Example_member!' } } });

    setOverlayLanguage('ja');
    expect(projectBrowserOverlayEvent(event, config)).toMatchObject({ payload: { display: { thankYou: '配信を応援してくれてありがとう、Example_member さん！' } } });
  });

  it('never replaces a thank-you the creator wrote', async () => {
    const source = await fixture('youtube-super-chat.json');
    const event = { ...source, metadata: { ...source.metadata, bridgeSequence: 22 } };
    const base = (await testConfig()).browserOverlay;
    const config = { ...base, alerts: { profiles: { youtube: { 'super-chat': { enabled: true, showThankYou: true, thankYouTemplate: 'Welcome to the village, {actor}!' } } } } } as typeof base;
    setOverlayLanguage('de');
    expect(projectBrowserOverlayEvent(event, config)).toMatchObject({ payload: { display: { thankYou: 'Welcome to the village, Example_member!' } } });
  });
});
