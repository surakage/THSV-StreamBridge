import { describe, expect, it } from 'vitest';
import { buildStreamerBotEventArguments } from '../../bridge/adapters/streamerbot-package.js';
import { fixture } from '../helpers.js';

describe('Streamer.bot package contract', () => {
  it('sends the normalized envelope as the only wire-level source of truth', async () => {
    const event = await fixture();
    const args = buildStreamerBotEventArguments(event);

    expect(Object.keys(args)).toEqual(['streamBridgeEvent']);
    expect(JSON.parse(args.streamBridgeEvent)).toEqual(event);
  });
});
