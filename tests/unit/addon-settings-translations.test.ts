import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Wizard translates by exact English text (wizard/browser/i18n.js). The section titles, descriptions,
// notices and hints of every extension's settings page live in addons/<name>/ui/settings.json, so new text
// there stays English in every other language until it is added to wizard/locales/<code>.json.
const TEXT_KEYS = new Set(['title', 'description', 'notice', 'intro', 'label', 'hint', 'itemLabel', 'emptyLabel']);
const LANGUAGES = ['de', 'es', 'fr', 'it', 'ja', 'ko', 'pt-BR', 'zh-CN'];

function settingsText(): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (value === null || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry !== 'string') { walk(entry); continue; }
      if (!TEXT_KEYS.has(key)) continue;
      let text = entry.replace(/\s+/gu, ' ').trim();
      // The page shows section titles without their leading number ("2. Readability" -> "Readability").
      if (key === 'title') text = text.replace(/^\d+\s*[.)-]\s*/u, '').trim();
      // Sentences only: single words and names are often the same in every language.
      if (text.split(' ').length >= 4) found.add(text);
    }
  };
  for (const name of readdirSync('addons')) {
    try { walk(JSON.parse(readFileSync(join('addons', name, 'ui', 'settings.json'), 'utf8'))); } catch { /* No settings page. */ }
  }
  return found;
}

describe('extension settings translations', () => {
  const text = settingsText();
  it('finds the settings text', () => { expect(text.size).toBeGreaterThan(500); });
  it.each(LANGUAGES)('%s covers nearly all extension settings sentences', (code) => {
    const dictionary = JSON.parse(readFileSync(join('wizard', 'locales', `${code}.json`), 'utf8')) as Record<string, string>;
    const missing = [...text].filter((entry) => dictionary[entry] === undefined);
    // A small allowance for sentences that are deliberately left alone (commands, action paths).
    expect(missing.length, `untranslated in ${code}: ${missing.slice(0, 5).join(' | ')}`).toBeLessThanOrEqual(Math.ceil(text.size * 0.03));
  });
});
