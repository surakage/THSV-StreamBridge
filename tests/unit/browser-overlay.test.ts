import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
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
      payload: { tier: 'Village', subscriptionKind: 'renewal', months: 6, streakMonths: 4 },
      metadata: { ...source.metadata, bridgeSequence: 12 },
    };
    expect(projectBrowserOverlayEvent(event)).toMatchObject({
      kind: 'alert.show',
      payload: {
        presentation: { avatarUrl: 'https://example.com/avatar.png', nameColor: '#72efc2', badges: [{ id: 'member', label: 'Member' }] },
        subscription: { kind: 'renewal', months: 6, streakMonths: 4 },
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
    expect(source).toContain("new SharedWorker('/overlay/worker-0.9.9.js', 'thsv-browser-overlay-0.9.9'");
    expect(source).toContain("oldest.classList.add('message-expiring')");
    expect(source).toContain('while (alertQueue.length > clientConfig.maxAlertQueue)');
    expect(source).toContain('const card = buildAlertCard(nextAlert)');
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

  it('keeps the standalone chat canvas transparent and bottom-anchored', async () => {
    const source = await readFile('overlays/browser/app.js', 'utf8');
    const styles = await readFile('overlays/browser/styles.css', 'utf8');
    expect(source).toContain("requestedLayout === 'compact' ? 'compact' : 'canvas'");
    expect(source).not.toContain('verticalScale');
    expect(styles).not.toContain('scaleY');
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
