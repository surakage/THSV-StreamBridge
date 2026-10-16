import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repairYouTubeChatLibrary } from '../../tools/start-streamerbot-safely.mjs';

const CONFIG = ['<?xml version="1.0" encoding="utf-8"?>', '<configuration>', '  <runtime>', '    <assemblyBinding xmlns="urn:schemas-microsoft-com:asm.v1">', '      <probing privatePath="dlls" />', '    </assemblyBinding>', '  </runtime>', '</configuration>', ''].join('\r\n');
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function streamerBotFolder(options: { signedCopy?: boolean; config?: string } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-sb-protobuf-')); roots.push(root);
  await writeFile(join(root, 'Streamer.bot.exe.config'), options.config ?? CONFIG);
  await writeFile(join(root, 'Google.Protobuf.dll'), 'unsigned 3.36.1');
  if (options.signedCopy !== false) { await mkdir(join(root, 'dlls', 'google-protobuf-signed-3.31.1'), { recursive: true }); await writeFile(join(root, 'dlls', 'google-protobuf-signed-3.31.1', 'Google.Protobuf.dll'), 'signed 3.31.1'); }
  return root;
}

const unsigned = () => ({ signed: false, version: '3.36.1.0' });
const quiet = { write: () => undefined };
const today = new Date('2026-10-16T23:30:00.000Z');

describe('repairYouTubeChatLibrary', () => {
  it('re-applies the signed Google.Protobuf redirect that a Streamer.bot update removed, with a backup', async () => {
    const folder = await streamerBotFolder();
    const messages: string[] = [];
    expect(repairYouTubeChatLibrary(folder, { inspectLibrary: unsigned, output: { write: (message: string) => messages.push(message) }, today })).toBe('repaired');
    const config = await readFile(join(folder, 'Streamer.bot.exe.config'), 'utf8');
    expect(config).toContain('<assemblyIdentity name="Google.Protobuf" publicKeyToken="a7d26565bac4d604" culture="neutral" />');
    expect(config).toContain('<bindingRedirect oldVersion="0.0.0.0-3.36.1.0" newVersion="3.31.1.0" />');
    expect(config).toContain('<codeBase version="3.31.1.0" href="dlls/google-protobuf-signed-3.31.1/Google.Protobuf.dll" />');
    expect(config.indexOf('Google.Protobuf')).toBeLessThan(config.indexOf('</runtime>'));
    expect(config.split('\n').every((line, index, lines) => index === lines.length - 1 || line.endsWith('\r'))).toBe(true);
    expect(await readFile(join(folder, 'Streamer.bot.exe.config.before-thsv-youtube-chat-fix-2026-10-16'), 'utf8')).toBe(CONFIG);
    expect(messages.join('')).toContain('Re-applied the YouTube chat fix');
    // Running again before every start changes nothing more.
    expect(repairYouTubeChatLibrary(folder, { inspectLibrary: unsigned, output: quiet, today })).toBe('already-configured');
    expect((await readdir(folder)).filter((name) => name.includes('.tmp'))).toEqual([]);
  });

  it('leaves Streamer.bot untouched when the fix does not apply', async () => {
    const noCopy = await streamerBotFolder({ signedCopy: false });
    expect(repairYouTubeChatLibrary(noCopy, { inspectLibrary: unsigned, output: quiet, today })).toBe('no-signed-copy');
    const signedShipped = await streamerBotFolder();
    expect(repairYouTubeChatLibrary(signedShipped, { inspectLibrary: () => ({ signed: true, version: '3.37.0.0' }), output: quiet, today })).toBe('shipped-copy-signed');
    const ownBinding = await streamerBotFolder({ config: CONFIG.replace('<probing privatePath="dlls" />', '<dependentAssembly><assemblyIdentity name="Google.Protobuf" publicKeyToken="a7d26565bac4d604" culture="neutral" /></dependentAssembly>') });
    expect(repairYouTubeChatLibrary(ownBinding, { inspectLibrary: unsigned, output: quiet, today })).toBe('already-configured');
    for (const folder of [noCopy, signedShipped]) expect(await readFile(join(folder, 'Streamer.bot.exe.config'), 'utf8')).toBe(CONFIG);
  });
});
