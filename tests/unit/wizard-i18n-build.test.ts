import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Wizard loads wizard/browser/i18n/<code>.js, built from wizard/locales/<code>.json by `npm run i18n:build`.
// A translation added to the JSON only reaches creators after that build, so the two must match.
describe('wizard language files', () => {
  const codes = readdirSync(join('wizard', 'locales')).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length));
  it.each(codes)('%s word list matches its locale file (run npm run i18n:build)', (code) => {
    const locale = JSON.parse(readFileSync(join('wizard', 'locales', `${code}.json`), 'utf8')) as Record<string, string>;
    const built = readFileSync(join('wizard', 'browser', 'i18n', `${code}.js`), 'utf8');
    const match = /\] = (\{.*\});\s*$/su.exec(built);
    expect(match, code).not.toBeNull();
    expect(JSON.parse(match?.[1] ?? '{}')).toEqual(locale);
  });
});
