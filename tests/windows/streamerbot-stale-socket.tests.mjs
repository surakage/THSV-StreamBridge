import { createConnection, createServer } from 'node:net';
import { recoverStaleListener } from '../../tools/start-streamerbot-safely.mjs';

async function listen() {
  const server = createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('Real stale-socket acceptance could not allocate a TCP port.');
  return { server, port: address.port };
}

async function listening(port) {
  return await new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(250);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

async function waitForRelease(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!await listening(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Real TCP port ${String(port)} did not release within ${String(timeoutMs)} ms.`);
}

const output = { write: () => true };
const natural = await listen();
let naturalStopCalled = false;
let naturallyReleased = false;
setTimeout(() => natural.server.close(), 100);
const naturalRecovery = await recoverStaleListener({
  port: natural.port, listenerPid: process.pid, installRoot: process.cwd(), output,
  waitForNaturalRelease: async (port) => { await waitForRelease(port, 2_000); naturallyReleased = true; },
  listenerForPort: () => naturallyReleased ? undefined : { address: `127.0.0.1:${String(natural.port)}`, pid: process.pid },
  stopBridge: () => { naturalStopCalled = true; return true; },
  waitForFinalRelease: waitForRelease,
});
if (naturalRecovery || naturalStopCalled) throw new Error('Natural Windows socket release incorrectly stopped StreamBridge.');

const held = await listen();
let stopCalled = false;
const heldRecovery = await recoverStaleListener({
  port: held.port, listenerPid: process.pid, installRoot: process.cwd(), output,
  waitForNaturalRelease: async (port) => { if (!await listening(port)) throw new Error('Held socket unexpectedly released.'); throw new Error('still held'); },
  listenerForPort: () => ({ address: `127.0.0.1:${String(held.port)}`, pid: process.pid }),
  stopBridge: () => { stopCalled = true; held.server.close(); return true; },
  waitForFinalRelease: waitForRelease,
});
if (!heldRecovery || !stopCalled || await listening(held.port)) throw new Error('Verified recovery did not release the real held TCP socket.');

process.stdout.write(`${JSON.stringify({ realTcpSockets: true, naturalReleaseAvoidedRestart: true, verifiedRecoveryReleasedHeldSocket: true })}\n`);
