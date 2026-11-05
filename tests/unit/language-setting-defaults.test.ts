import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { languageSettingDefaults } from '../../bridge/core/language-defaults.js';
import { SUPPORTED_LANGUAGE_CODES, catalog, type LanguageCode } from '../../bridge/core/locale.js';
import { validateSettings } from '../../bridge/services/addon-wizard-service.js';

interface SchemaProperty { readonly type?: string; readonly default?: unknown; readonly maxLength?: number; readonly items?: { readonly maxLength?: number }; readonly maxItems?: number }

const schemas = new Map<string, { readonly properties: Readonly<Record<string, SchemaProperty>> }>();
for (const folder of readdirSync('addons')) {
  const schemaPath = `addons/${folder}/schemas/config.json`;
  if (!existsSync(schemaPath)) continue;
  const moduleId = `thsv.${folder}`;
  schemas.set(moduleId, JSON.parse(readFileSync(schemaPath, 'utf8')) as { properties: Record<string, SchemaProperty> });
}

const placeholders = (text: string): string[] => [...text.matchAll(/\{[A-Za-z]+\}/gu)].map((match) => match[0]).sort();
const settingEntries = (language: LanguageCode): Array<[string, string]> => Object.entries(catalog(language)).filter(([key]) => key.startsWith('setting.'));
const parse = (key: string): { moduleId: string; setting: string; line?: number } => {
  const rest = key.slice('setting.'.length);
  const match = /^(thsv\.[a-z0-9-]+)\.([A-Za-z0-9]+)(?:\[(\d+)\])?$/u.exec(rest);
  if (match?.[1] === undefined || match[2] === undefined) throw new Error(`Bad key ${key}`);
  return { moduleId: match[1], setting: match[2], ...(match[3] === undefined ? {} : { line: Number(match[3]) }) };
};

describe('default wording follows the creator language', () => {
  it('keeps the English source equal to each add-on default', () => {
    for (const [key, text] of settingEntries('en')) {
      const { moduleId, setting, line } = parse(key);
      const property = schemas.get(moduleId)?.properties[setting];
      expect(property, key).toBeDefined();
      const english = line === undefined ? property?.default : (property?.default as string[] | undefined)?.[line];
      expect(text, key).toBe(english);
    }
  });

  for (const language of SUPPORTED_LANGUAGE_CODES.filter((code) => code !== 'en')) {
    it(`${language}: every translation fits its setting and keeps the same {placeholders}`, () => {
      for (const [key, text] of settingEntries(language)) {
        const english = catalog('en')[key];
        expect(english, `${language} ${key} has no English source`).toBeTypeOf('string');
        expect(placeholders(text), `${language} ${key}`).toEqual(placeholders(english ?? ''));
        const { moduleId, setting } = parse(key);
        const property = schemas.get(moduleId)?.properties[setting];
        const limit = property?.type === 'array' ? property.items?.maxLength : property?.maxLength;
        if (limit !== undefined) expect(text.length, `${language} ${key} is longer than ${String(limit)}`).toBeLessThanOrEqual(limit);
      }
    });
  }

  it('fills unsaved settings in the creator language but never replaces saved text', () => {
    const schema = schemas.get('thsv.chatter-greeting');
    const spanish = languageSettingDefaults('thsv.chatter-greeting', 'es');
    const unsaved = validateSettings(schema, {}, true, spanish);
    expect(unsaved['newMessage']).toBe(catalog('es')['setting.thsv.chatter-greeting.newMessage']);
    expect(Array.isArray(unsaved['newMessageAlternates'])).toBe(true);
    const saved = validateSettings(schema, { newMessage: 'Welcome to the Village, {name}!' }, true, spanish);
    expect(saved['newMessage']).toBe('Welcome to the Village, {name}!');
    expect(languageSettingDefaults('thsv.chatter-greeting', 'en')).toEqual({});
  });
});
