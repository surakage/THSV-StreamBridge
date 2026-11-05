// The creator's chosen language and the small text catalogs behind it.
//
// English is the default and the source language. Each other language has a catalog in
// bridge/locales/<code>.json holding only the keys it translates; anything missing falls back to
// the English text the caller passes in, so a partly translated catalog never shows a blank.
//
// Catalog keys are stable IDs (for example "command.chat-play.coinflip"), never English text, so
// rewording English copy later does not orphan a translation.

import de from '../locales/de.json' with { type: 'json' };
import en from '../locales/en.json' with { type: 'json' };
import es from '../locales/es.json' with { type: 'json' };
import fr from '../locales/fr.json' with { type: 'json' };
import it from '../locales/it.json' with { type: 'json' };
import ja from '../locales/ja.json' with { type: 'json' };
import ko from '../locales/ko.json' with { type: 'json' };
import ptBR from '../locales/pt-BR.json' with { type: 'json' };
import zhCN from '../locales/zh-CN.json' with { type: 'json' };
import { SUPPORTED_LANGUAGE_CODES } from '../../schemas/config.js';

export { SUPPORTED_LANGUAGE_CODES };
export type LanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export interface SupportedLanguage {
  readonly code: LanguageCode;
  /** The language's name in that language, for a language picker. */
  readonly nativeName: string;
  /** The language's name in English. */
  readonly englishName: string;
  /** The code the Translate add-on and translation providers use for this language. */
  readonly translateCode: string;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = Object.freeze([
  { code: 'en', nativeName: 'English', englishName: 'English', translateCode: 'en' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', translateCode: 'es' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', translateCode: 'de' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', translateCode: 'fr' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', translateCode: 'ja' },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', translateCode: 'pt' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian', translateCode: 'it' },
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Chinese (Simplified)', translateCode: 'zh-cn' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', translateCode: 'ko' },
].map((language) => Object.freeze(language as SupportedLanguage)));

const CATALOGS: Readonly<Record<LanguageCode, Readonly<Record<string, string>>>> = Object.freeze({
  en, es, de, fr, ja, 'pt-BR': ptBR, it, 'zh-CN': zhCN, ko,
});

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(value);
}

/** The supported language for a saved value; anything unknown is English. */
export function languageOrDefault(value: unknown): LanguageCode {
  return isLanguageCode(value) ? value : DEFAULT_LANGUAGE;
}

export function supportedLanguage(language: LanguageCode): SupportedLanguage {
  return SUPPORTED_LANGUAGES.find((entry) => entry.code === language) ?? SUPPORTED_LANGUAGES[0] as SupportedLanguage;
}

/** Every key and text in one language's catalog (English is the source catalog). */
export function catalog(language: LanguageCode): Readonly<Record<string, string>> {
  return CATALOGS[language];
}

/**
 * Looks up `key` in the language's catalog. Falls back to `fallbackEnglish` when the language has
 * no text for it, so callers always pass the English wording they would show today.
 */
export function t(language: LanguageCode, key: string, fallbackEnglish: string): string {
  const value = CATALOGS[language][key];
  return typeof value === 'string' && value.length > 0 ? value : fallbackEnglish;
}
