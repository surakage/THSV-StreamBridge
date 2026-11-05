// Add-on setting defaults that follow the creator's language.
//
// These only replace a schema default: a setting the creator saved is never touched. With English
// (the default language) nothing changes, so every add-on keeps its published defaults.

import { DEFAULT_LANGUAGE, catalog, supportedLanguage, type LanguageCode } from './locale.js';

export const TRANSLATE_MODULE_ID = 'thsv.user-translate';

// The Translate add-on's own default list of languages viewers can pick for voice translation.
const TRANSLATE_VOICE_LANGUAGES = Object.freeze(['es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh-cn']);

/** Default values for one add-on's unsaved settings in the creator's language (empty for English). */
export function languageSettingDefaults(moduleId: string, language: LanguageCode): Readonly<Record<string, unknown>> {
  if (language === DEFAULT_LANGUAGE) return Object.freeze({});
  const wording = catalogSettingDefaults(moduleId, language);
  if (moduleId === TRANSLATE_MODULE_ID) return Object.freeze({ ...wording, ...translateDefaults(language) });
  return wording;
}

/**
 * Viewer-facing default wording (chat replies, welcomes, overlay titles) in the creator's language.
 *
 * Catalog keys are `setting.<moduleId>.<settingKey>`; a list setting uses one key per line,
 * `setting.<moduleId>.<settingKey>[0]`, `[1]`, … and is only used when every line is translated.
 * Text the creator saved is never replaced, and a translation the setting rejects (too long, for
 * example) quietly keeps the add-on's English default.
 */
function catalogSettingDefaults(moduleId: string, language: LanguageCode): Readonly<Record<string, unknown>> {
  const prefix = `setting.${moduleId}.`;
  const values: Record<string, unknown> = {};
  const lists = new Map<string, string[]>();
  for (const [key, text] of Object.entries(catalog(language))) {
    if (!key.startsWith(prefix)) continue;
    const name = key.slice(prefix.length);
    const line = /^(.+)\[(\d{1,2})\]$/u.exec(name);
    if (line?.[1] === undefined || line[2] === undefined) { values[name] = text; continue; }
    const list = lists.get(line[1]) ?? [];
    list[Number(line[2])] = text;
    lists.set(line[1], list);
  }
  for (const [name, list] of lists) {
    if (list.length > 0 && Array.from(list, (entry) => entry).every((entry) => typeof entry === 'string')) values[name] = Object.freeze([...list]);
  }
  return Object.freeze(values);
}

function translateDefaults(language: LanguageCode): Readonly<Record<string, unknown>> {
  const own = supportedLanguage(language).translateCode;
  return Object.freeze({
    // Chat is translated into the creator's language.
    targetLanguage: own,
    // The creator speaks their own language (this is also the speech-recognition language for voice translation).
    voiceSourceLanguage: own,
    // Bilingual captions show the creator's words with English underneath.
    voiceBilingualLanguages: ['en'],
    // Push-to-talk translates the creator's speech into English.
    voicePushToTalkLanguages: ['en'],
    // Viewers can pick English; the creator's own language is not offered back to them.
    voiceLanguages: ['en', ...TRANSLATE_VOICE_LANGUAGES.filter((code) => code !== own)],
  });
}
