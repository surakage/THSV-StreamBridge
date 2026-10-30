import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { MutableRequestGuard, RequestGuardError } from '../../bridge/services/request-guard.js';
import { TEST_CONTROL_TOKEN } from '../helpers.js';

function request(headers: Record<string, string> = {}, remoteAddress = '127.0.0.1', method?: string): IncomingMessage {
  return { headers, method, socket: { remoteAddress } } as unknown as IncomingMessage;
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

  it('gives reads their own larger budget so status checks never block a save', () => {
    const guard = new MutableRequestGuard(TEST_CONTROL_TOKEN, [], 2, 1);
    const read = request({ authorization: `Bearer ${TEST_CONTROL_TOKEN}` }, '127.0.0.1', 'GET');
    const write = request({ authorization: `Bearer ${TEST_CONTROL_TOKEN}`, 'content-type': 'application/json' });
    const reads = Array.from({ length: 8 }, () => guard.acquire(read, false));
    expect(() => guard.acquire(read, false)).toThrow('concurrency');
    expect(() => guard.acquire(write, true)).not.toThrow();
    reads.forEach((release) => { release(); });
    for (let index = 0; index < 12; index += 1) guard.acquire(read, false)();
    expect(() => guard.acquire(read, false)).toThrow('rate limit');
  });

  it('rejects non-loopback callers and unapproved browser origins', () => {
    const guard = new MutableRequestGuard(TEST_CONTROL_TOKEN, [], 10, 1);
    expect(() => guard.assertLoopback(request({}, '192.168.1.10'))).toThrow('loopback-only');
    expect(() => guard.assertLoopback(request())).not.toThrow();
    expect(() => guard.assertLoopback(request({ host: 'attacker.example' }))).toThrow('Host header');
    expect(() => guard.acquire(request({ authorization: `Bearer ${TEST_CONTROL_TOKEN}` }, '192.168.1.10'), false)).toThrow('loopback-only');
    expect(() => guard.acquire(request({ authorization: `Bearer ${TEST_CONTROL_TOKEN}`, origin: 'https://attacker.example' }), false)).toThrow('origin');
  });
});
