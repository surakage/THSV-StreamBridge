import { writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

const [source, destination] = process.argv.slice(2);
const url = new URL(source);
if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith('/rhysd/actionlint/releases/download/')) throw new Error('Tool download URL is outside the approved actionlint GitHub release path.');
const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Tool archive download failed (${response.status}).`);
await writeFile(destination, Buffer.from(await response.arrayBuffer()));
