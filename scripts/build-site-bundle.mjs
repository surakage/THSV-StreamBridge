// Builds the copy of the StreamBridge pages that is uploaded to app.slothbloom.com.
//
//   node scripts/build-site-bundle.mjs [output folder]     (default: dist/site)
//
// The pages are the same files StreamBridge serves on the PC, at the same addresses, plus one helper
// (wizard/hosted.js) that points their calls at StreamBridge on the visitor's own PC. Nothing here runs on a
// server: the output is plain files for a static host such as Cloudflare Pages.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] ?? join(root, 'dist', 'site'));
const source = join(root, 'wizard', 'browser');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

// Address on the site -> file in wizard/browser. Mirrors the pages StreamBridge serves locally.
const PAGES = { 'wizard/index.html': 'index.html', 'wizard/panel.html': 'control-panel.html', 'wizard/stream-info.html': 'stream-info.html', 'wizard/jukebox.html': 'jukebox-remote.html' };

await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'wizard'), { recursive: true });
await cp(source, join(output, 'wizard'), { recursive: true, filter: (path) => !path.endsWith('.html') });
await cp(join(root, 'wizard', 'hosted', 'hosted.js'), join(output, 'wizard', 'hosted.js'));

for (const [target, file] of Object.entries(PAGES)) {
  let html = await readFile(join(source, file), 'utf8');
  const firstScript = html.indexOf('<script');
  if (firstScript < 0 || !html.includes('<html')) throw new Error(`${file} does not look like a StreamBridge page.`);
  // The helper must run before any page script so every call is already pointed at the PC.
  html = `${html.slice(0, firstScript)}<script src="/wizard/hosted.js"></script>${html.slice(firstScript)}`;
  html = html.replace('<html', `<html data-thsv-site-version="${version}"`);
  await writeFile(join(output, target), html);
}

await writeFile(join(output, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>THSV StreamBridge</title><meta http-equiv="refresh" content="0; url=/wizard/"></head><body><p><a href="/wizard/">Open THSV StreamBridge</a></p></body></html>\n');
await writeFile(join(output, 'version.json'), `${JSON.stringify({ version }, null, 2)}\n`);
// Cloudflare Pages reads this file. The pages may only load their own files and talk to StreamBridge on this PC.
await writeFile(join(output, '_headers'), [
  '/*',
  "  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:* http://localhost:*; img-src 'self' https: data: http://127.0.0.1:*; media-src 'self' blob: http://127.0.0.1:*; frame-src 'self' http://127.0.0.1:*; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: no-referrer',
  '  Cache-Control: no-cache',
  '',
].join('\n'));
process.stdout.write(`StreamBridge ${version} site pages written to ${output}\n`);
