// Add-on setting defaults that follow the creator's language.
//
// These only replace a schema default: a setting the creator saved is never touched. With English
// (the default language) nothing changes, so every add-on keeps its published defaults.

import { DEFAULT_LANGUAGE, supportedLanguage, type LanguageCode } from './locale.js';

export const TRANSLATE_MODULE_ID = 'thsv.user-translate';

// The Translate add-on's own default list of languages viewers can pick for voice translation.
const TRANSLATE_VOICE_LANGUAGES = Object.freeze(['es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh-cn']);

/** Default values for one add-on's unsaved settings in the creator's language (empty for English). */
export function languageSettingDefaults(moduleId: string, language: LanguageCode): Readonly<Record<string, unknown>> {
  if (language === DEFAULT_LANGUAGE) return Object.freeze({});
  if (moduleId === TRANSLATE_MODULE_ID) return translateDefaults(language);
  return Object.freeze({});
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
