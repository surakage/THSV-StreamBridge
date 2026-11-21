import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The guides tell creators where to click ("**Platforms > Twitch > Accounts**"). When a wizard page, section or
// button is renamed, a guide that still names the old one leaves a new streamer stuck. This keeps them in step.

const ROOT = process.cwd();
function files(folder: string, pattern: RegExp): string[] {
  return readdirSync(folder).flatMap((name) => { const path = join(folder, name); return statSync(path).isDirectory() ? files(path, pattern) : pattern.test(name) ? [path] : []; });
}
const unescape = (text: string): string => text.replaceAll('&amp;', '&').replaceAll('&gt;', '>').replaceAll('&lt;', '<');
const wizardText = unescape([
  ...files(join(ROOT, 'wizard', 'browser'), /\.(?:html|js)$/u).filter((path) => !path.includes(join('browser', 'i18n'))),
  join(ROOT, 'bridge', 'core', 'main-feature-registry.ts'),
  ...files(join(ROOT, 'addons'), /^module-package\.json$/u),
].map((path) => readFileSync(path, 'utf8')).join('\n')).toLowerCase();
const index = readFileSync(join(ROOT, 'wizard', 'browser', 'index.html'), 'utf8');
const appJs = readFileSync(join(ROOT, 'wizard', 'browser', 'app.js'), 'utf8');
const pages = new Set([
  ...[...index.matchAll(/data-view="[a-z-]+">([^<]+)</gu)].map((match) => unescape(match[1] ?? '')),
  ...[...appJs.matchAll(/\['[a-z-]+','([^']+)'\]/gu)].map((match) => match[1] ?? ''),
  'Extensions', 'Overlays', 'Widgets',
]);
const guides = [...files(join(ROOT, 'docs', 'guide'), /\.md$/u), join(ROOT, 'README.md'), join(ROOT, 'docs', 'troubleshooting.md')];

describe('guides point at wizard places that exist', () => {
  it('every "Page > Section" path in a guide names a real wizard page and real sections', () => {
    const missing: string[] = [];
    for (const guide of guides) {
      for (const match of readFileSync(guide, 'utf8').matchAll(/\*\*([^*]{3,120})\*\*/gu)) {
        const parts = (match[1] ?? '').split(/\s(?:>|→|›)\s/u).map((part) => part.trim());
        if (parts.length < 2 || !pages.has(parts[0] ?? '')) continue;
        for (const part of parts.slice(1)) if (!/[<>]/u.test(part) && !wizardText.includes(part.toLowerCase())) missing.push(`${guide.slice(ROOT.length + 1)}: ${match[1] ?? ''} (no "${part}")`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no guide names wizard buttons and lists that were renamed or removed', () => {
    const gone = ['Browser-source checklist', 'Run pre-stream check', 'Streamer.bot > Direct scene connections'];
    const found = guides.flatMap((guide) => gone.filter((label) => readFileSync(guide, 'utf8').includes(label)).map((label) => `${guide.slice(ROOT.length + 1)}: ${label}`));
    expect(found).toEqual([]);
  });
});
