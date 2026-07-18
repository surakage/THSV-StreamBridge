import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { BrowserOverlayConfig } from '../../schemas/config.js';
import { projectBrowserOverlayEvent } from '../../bridge/core/browser-overlay.js';
import { fixture } from '../helpers.js';

describe('Browser Overlay Hub contract', () => {
  it('projects public chat and preserves hostile markup as inert text data', async () => {
    const source = await fixture();
    const event: NormalizedEvent = { ...source, payload: { message: '<img src=x onerror=alert(1)> 🦥' }, metadata: { ...source.metadata, bridgeSequence: 7 } };
    expect(projectBrowserOverlayEvent(event)).toMatchObject({
      kind: 'chat.add',
      payload: { eventId: event.eventId, sequence: 7, message: '<img src=x onerror=alert(1)> 🦥' },
    });
  });

  it('projects reviewed presentation metadata and subscription lifecycle fields', async () => {
    const source = await fixture('youtube-super-chat.json');
    if (source.user === undefined) throw new Error('Fixture requires an actor');
    const event: NormalizedEvent = {
      ...source,
      eventType: 'channel.membership',
      user: { ...source.user, avatarUrl: 'https://example.com/avatar.png', nameColor: '#72efc2', badges: [{ id: 'member', label: 'Member' }] },
      payload: { tier: 'Village', subscriptionKind: 'upgrade', months: 6, streakMonths: 4, gifted: true, gifterName: 'Kind Gifter' },
      metadata: { ...source.metadata, bridgeSequence: 12 },
    };
    expect(projectBrowserOverlayEvent(event)).toMatchObject({
      kind: 'alert.show',
      payload: {
        presentation: { avatarUrl: 'https://example.com/avatar.png', nameColor: '#72efc2', badges: [{ id: 'member', label: 'Member' }] },
        tier: 'Village',
        subscription: { kind: 'upgrade', months: 6, streakMonths: 4, gifted: true, gifterName: 'Kind Gifter' },
      },
    });
  });

  it('correlates a message-removal moderation action by target event ID', async () => {
    const source = await fixture();
    const event: NormalizedEvent = {
      ...source,
      eventId: 'moderation-delete-001',
      eventType: 'moderation.action',
      source: { ...source.source, eventId: 'moderation-source-001' },
      payload: { action: 'delete-message', targetEventId: 'sim-twitch-chat-001', reason: 'removed by moderator' },
      metadata: { ...source.metadata, bridgeSequence: 8 },
    };
    expect(projectBrowserOverlayEvent(event)).toMatchObject({
      kind: 'chat.remove',
      payload: { eventId: 'moderation-delete-001', targetEventId: 'sim-twitch-chat-001', reason: 'removed by moderator' },
    });
  });

  it('does not broadcast private, operator, command, or unrelated events', async () => {
    const source = await fixture();
    for (const eventType of ['chat.private-message', 'operator.message', 'command.received', 'system.timed']) {
      expect(projectBrowserOverlayEvent({ ...source, eventType, metadata: { ...source.metadata, bridgeSequence: 9 } })).toBeUndefined();
    }
  });

  it('uses text-only DOM sinks in the reviewed browser source', async () => {
    const source = await readFile('overlays/browser/app.js', 'utf8');
    const worker = await readFile('overlays/browser/worker.js', 'utf8');
    expect(source).toContain('textContent');
    expect(source).toContain("new SharedWorker('/overlay/worker-1.2.0.js', 'thsv-browser-overlay-1.2.0'");
    expect(source).toContain("oldest.classList.add('message-expiring')");
    expect(source).toContain('new AlertPresentationController({');
    expect(source).toContain('alertController.enqueue(alert)');
    expect(source).toContain("console.warn('Skipped an alert that could not be rendered.'");
    expect(source).toContain("avatar.addEventListener('error', () => avatar.remove()");
    expect(source).toContain('brandLabel.textContent = clientConfig.brandLabel');
    expect(source).toContain('connectDirectly');
    expect(worker.match(/new WebSocket/gu)).toHaveLength(1);
    expect(worker).toContain('for (const port of ports)');
    for (const reviewedSource of [source, worker]) {
      expect(reviewedSource).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/u);
      expect(reviewedSource).not.toContain('eval(');
    }
  });

  it('applies plain-text alert profiles and suppresses disabled alert types', async () => {
    const source = await fixture('youtube-super-chat.json');
    const config: BrowserOverlayConfig = {
      enabled: true, brandLabel: '', maxChatMessages: 8, maxAlertQueue: 20, alertDurationMs: 7_000, showBots: true, showSimulated: true,
      alerts: { profiles: { 'super-chat': { enabled: true, platforms: ['youtube'], priority: 'critical', durationMs: 9_000, titleTemplate: '{actor} supported with {amount} {currency}', detailTemplate: '{message}', sound: { mode: 'chime', volume: 0.25 }, aggregation: { mode: 'none', windowMs: 5_000 } } } },
    };
    expect(projectBrowserOverlayEvent({ ...source, metadata: { ...source.metadata, bridgeSequence: 13 } }, config)).toMatchObject({
      kind: 'alert.show', payload: { priority: 'critical', display: { title: 'example_member supported with 5.00 USD', detail: 'Simulated support', durationMs: 9_000, sound: { mode: 'chime', volume: 0.25 } } },
    });
    const profile = config.alerts.profiles['super-chat'];
    if (profile === undefined) throw new Error('Test profile is required');
    const disabled: BrowserOverlayConfig = { ...config, alerts: { profiles: { 'super-chat': { ...profile, enabled: false } } } };
    expect(projectBrowserOverlayEvent({ ...source, metadata: { ...source.metadata, bridgeSequence: 14 } }, disabled)).toBeUndefined();
    const wrongPlatform: BrowserOverlayConfig = { ...config, alerts: { profiles: { 'super-chat': { ...profile, platforms: ['twitch'] } } } };
    expect(projectBrowserOverlayEvent({ ...source, metadata: { ...source.metadata, bridgeSequence: 15 } }, wrongPlatform)).toBeUndefined();
  });

  it('keeps the standalone chat canvas transparent and bottom-anchored', async () => {
    const source = await readFile('overlays/browser/app.js', 'utf8');
    const styles = await readFile('overlays/browser/styles.css', 'utf8');
    expect(source).toContain("requestedLayout === 'compact' ? 'compact' : 'canvas'");
    expect(source).not.toContain('verticalScale');
    expect(styles).not.toMatch(/body\[data-mode="chat"\][^{]*\{[^}]*scaleY/u);
    expect(styles).toContain('width: min(520px, calc(100vw - 32px))');
    expect(styles).toContain('background: #171120;');
    expect(styles).toContain('font-size: clamp(16px, 1vw, 19px)');
    expect(styles).toContain('backdrop-filter: none; animation: chat-arrive');
    expect(styles).toContain('body[data-mode="chat"][data-layout="compact"] .overlay { display: flex; flex-direction: column; justify-content: flex-end; }');
    expect(styles).toContain('body[data-mode="chat"][data-layout="compact"] .chat-shell { position: relative; inset: auto;');
    expect(styles).toContain('background: transparent;');
    expect(styles).toContain('body[data-mode="chat"] .chat-shell header { display: none; }');
    expect(styles).toContain('body[data-mode="chat"] .message.message-expiring');
    expect(styles).toContain('body[data-mode="chat"] .connection-status[data-state="reconnecting"]');
    expect(styles).toContain('@keyframes chat-expire');
  });

  it('keeps standalone alerts crisp and responsive without scaling', async () => {
    const styles = await readFile('overlays/browser/styles.css', 'utf8');
    expect(styles).toContain('body[data-mode="alerts"] .alerts { inset: 0; display: flex;');
    expect(styles).toContain('body[data-mode="alerts"] .alert { width: min(760px, 100%)');
    expect(styles).toContain('background: #171120;');
    expect(styles).toContain('font-size: clamp(24px, 2.2vw, 38px)');
    expect(styles).toContain('backdrop-filter: none; animation: alert-fade');
    expect(styles).toContain('body[data-mode="alerts"] .connection-status[data-state="reconnecting"]');
  });

});
