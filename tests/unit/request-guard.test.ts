import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { MutableRequestGuard, RequestGuardError } from '../../bridge/services/request-guard.js';
import { TEST_CONTROL_TOKEN } from '../helpers.js';

function request(headers: Record<string, string> = {}, remoteAddress = '127.0.0.1'): IncomingMessage {
  return { headers, socket: { remoteAddress } } as unknown as IncomingMessage;
}

describe('MutableRequestGuard', () => {
  it('caps concurrent requests until the active request releases', () => {
    const guard = new MutableRequestGuard(TEST_CONTROL_TOKEN, [], 10, 1);
    const input = request({ authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' });
    const release = guard.acquire(input, true);
    expect(() => guard.acquire(input, true)).toThrow(RequestGuardError);
    release();
    expect(() => guard.acquire(input, true)).not.toThrow();
  });

  it('rejects non-loopback callers and unapproved browser origins', () => {
    const guard = new MutableRequestGuard(TEST_CONTROL_TOKEN, [], 10, 1);
    expect(() => guard.acquire(request({ authorization: `Bearer ${TEST_CONTROL_TOKEN}` }, '192.168.1.10'), false)).toThrow('loopback-only');
    expect(() => guard.acquire(request({ authorization: `Bearer ${TEST_CONTROL_TOKEN}`, origin: 'https://attacker.example' }), false)).toThrow('origin');
  });
});
