import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import clipCourier, { validClip } from '../../addons/clip-courier/dist/index.js';
describe('Clip Courier', () => {
  it('accepts stable Twitch clips and rejects arbitrary URLs', () => { expect(validClip({ id: 'Clip_123', url: 'https://clips.twitch.tv/Clip_123', title: 'Nice', creatorName: 'Alex' })?.id).toBe('Clip_123'); expect(validClip({ id: 'Clip_123', url: 'https://evil.example/clip' })).toBeUndefined(); });

  it('stores confirmed Discord message and forum thread identities without retaining the webhook', async () => {
    let stored: Record<string, unknown> = { baselineComplete: true, published: [], pending: { requestId: 'clip-request-1', clipId: 'Clip_123' } };
    const context = {
      settings: { enabled: true, destinationMode: 'forum', maximumHistory: 300 },
      state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } },
    };
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-courier.delivery-result', receivedAt: '2026-07-27T12:00:00.000Z', payload: { requestId: 'clip-request-1', success: true, messageId: '123456789', threadId: '987654321' } }, context);
    expect(stored['published']).toEqual([expect.objectContaining({ clipId: 'Clip_123', messageId: '123456789', threadId: '987654321' })]);
    expect(JSON.stringify(stored)).not.toContain('webhook');
  });
});
