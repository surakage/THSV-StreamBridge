import { describe, expect, it, vi } from 'vitest';
import { OutboundMessageRouter, splitMessage, type OutboundMessageDispatcher } from '../../bridge/core/outbound-message-router.js';

describe('OutboundMessageRouter', () => {
  it('routes a reply only to its normalized source platform', async () => {
    const send = vi.fn<OutboundMessageDispatcher['send']>().mockResolvedValue(undefined);
    const result = await new OutboundMessageRouter({ send }).route({ message: ' Hello\u0000 viewer! ', routing: 'source', sourcePlatform: 'youtube' });
    expect(result).toEqual([{ platform: 'youtube', accepted: true, parts: 1 }]);
    expect(send).toHaveBeenCalledWith('youtube', 'Hello viewer!', 1, 1, undefined);
  });

  it('deduplicates selected platforms and reports failures independently', async () => {
    const send = vi.fn<OutboundMessageDispatcher['send']>().mockImplementation(async (platform) => { if (platform === 'kick') throw new Error('offline'); });
    const result = await new OutboundMessageRouter({ send }).route({ message: 'Live now', routing: 'selected', selectedPlatforms: ['twitch', 'kick', 'twitch'] });
    expect(result).toEqual([{ platform: 'twitch', accepted: true, parts: 1 }, { platform: 'kick', accepted: false, parts: 0, error: 'offline' }]);
  });

  it('splits without cutting surrogate pairs and rejects excessive output', () => {
    expect(splitMessage('one two three four', 10, 'split')).toEqual(['one two', 'three four']);
    expect(splitMessage('🦥🦥🦥', 2, 'split')).toEqual(['🦥🦥', '🦥']);
    expect(() => splitMessage('x'.repeat(101), 10, 'split')).toThrow('more than 10');
  });

  it('reports partial delivery and propagates cancellation instead of treating it as success', async () => {
    const partial = vi.fn<OutboundMessageDispatcher['send']>().mockImplementation(async (_platform, _message, part) => { if (part === 2) throw new Error('second part failed'); });
    await expect(new OutboundMessageRouter({ send: partial }).route({ message: 'one '.repeat(20), routing: 'source', sourcePlatform: 'twitch', overflow: 'split', characterLimits: { twitch: 40 } })).resolves.toEqual([{ platform: 'twitch', accepted: false, parts: 1, error: 'second part failed' }]);
    const controller = new AbortController(); controller.abort(new Error('module stopped'));
    await expect(new OutboundMessageRouter({ send: partial }).route({ message: 'hello', routing: 'source', sourcePlatform: 'twitch' }, controller.signal)).rejects.toThrow('module stopped');
  });
});
