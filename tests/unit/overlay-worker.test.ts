import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

class FakeSocket {
  public static readonly OPEN = 1; public static readonly CONNECTING = 0;
  public static last: FakeSocket | undefined;
  public readyState = FakeSocket.CONNECTING;
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  public constructor() { FakeSocket.last = this; }
  public addEventListener(type: string, listener: (event: unknown) => void): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  public send(): void { /* not needed */ }
  public close(): void { this.emit('close', {}); }
  public emit(type: string, event: unknown): void { if (type === 'open') this.readyState = FakeSocket.OPEN; for (const listener of this.listeners.get(type) ?? []) listener(event); }
}

function currentSocket(): FakeSocket {
  if (FakeSocket.last === undefined) throw new Error('The worker did not open a connection.');
  return FakeSocket.last;
}

function fakePort() {
  const received: Array<{ kind?: string; topic?: string }> = [];
  return { received, start() { /* no-op */ }, close() { /* no-op */ }, addEventListener() { /* no-op */ }, postMessage(message: { kind?: string; topic?: string }) { received.push(message); } };
}

async function loadWorker() {
  const self: { location: { protocol: string; host: string }; onconnect?: (connection: { ports: unknown[] }) => void } = { location: { protocol: 'http:', host: '127.0.0.1:8787' } };
  runInNewContext(await readFile('overlays/browser/worker.js', 'utf8'), { self, WebSocket: FakeSocket, setTimeout, clearTimeout });
  return (port: ReturnType<typeof fakePort>) => self.onconnect?.({ ports: [port] });
}

const publish = (moduleId: string, topic: string) => ({ data: JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId, topic: `${moduleId}.${topic}`, payload: { visible: true } }) });

describe('shared overlay worker', () => {
  it('gives an always-on panel to a browser source that joins the shared connection later', async () => {
    const connect = await loadWorker();
    const first = fakePort(); connect(first);
    const socket = currentSocket(); socket.emit('open', {});
    socket.emit('message', publish('thsv.local-clock', 'clock.update'));
    socket.emit('message', publish('thsv.goal-bars', 'goals.update'));
    socket.emit('message', publish('thsv.magic-eight-ball', 'card.show'));
    socket.emit('message', publish('thsv.reward-timers', 'timers.update'));
    socket.emit('message', publish('thsv.chat-first', 'firsts.update'));
    const late = fakePort(); connect(late);
    expect(late.received.map((message) => message.topic).filter(Boolean)).toEqual(['thsv.local-clock.clock.update', 'thsv.goal-bars.goals.update', 'thsv.reward-timers.timers.update', 'thsv.chat-first.firsts.update']);
  });

  it('forgets a hidden panel and everything retained when the connection drops', async () => {
    const connect = await loadWorker();
    const first = fakePort(); connect(first);
    const socket = currentSocket(); socket.emit('open', {});
    socket.emit('message', publish('thsv.local-clock', 'clock.update'));
    socket.emit('message', publish('thsv.goal-bars', 'goals.update'));
    socket.emit('message', publish('thsv.local-clock', 'clock.hide'));
    const afterHide = fakePort(); connect(afterHide);
    expect(afterHide.received.map((message) => message.topic).filter(Boolean)).toEqual(['thsv.goal-bars.goals.update']);
    socket.emit('close', {});
    const afterDrop = fakePort(); connect(afterDrop);
    expect(afterDrop.received.map((message) => message.topic).filter(Boolean)).toEqual([]);
  });
});
