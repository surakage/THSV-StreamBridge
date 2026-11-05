// Chat command names in any language.
//
// A command name is lowercase letters or numbers from any script (Latin, accented Latin, Japanese,
// Korean, Chinese, Cyrillic and so on), plus hyphens, up to 64 characters. Chat text is read in
// Unicode NFKC form first, so a full-width "！" prefix or full-width letters typed by a Japanese,
// Chinese or Korean keyboard work like their plain forms.
//
// Matching ignores Latin-style accents (é = e, ñ = n, ü = u) so a viewer who skips an accent still
// reaches the command. Only the combining marks used by Latin, Greek and Cyrillic are ignored;
// marks that change a letter in other scripts (for example Japanese dakuten, か vs が) are kept.

export const COMMAND_NAME_MAX_LENGTH = 64;

/** Lowercase letters and numbers from any script, then letters, numbers, combining marks or hyphens. */
export const COMMAND_NAME_PATTERN = /^[\p{Ll}\p{Lm}\p{Lo}\p{N}][\p{Ll}\p{Lm}\p{Lo}\p{N}\p{M}-]{0,63}$/u;

/** Puts chat text in the form commands are read from (full-width "！" becomes "!", and so on). */
export function normalizeChatForCommands(text: string): string {
  return text.normalize('NFKC');
}

/** Lowercases and NFKC-normalizes a command name; undefined when it is not a valid name. */
export function toCommandName(value: string): string | undefined {
  const normalized = value.normalize('NFKC').toLowerCase().normalize('NFC');
  return COMMAND_NAME_PATTERN.test(normalized) ? normalized : undefined;
}

/** The key two names are compared by: accents on Latin, Greek and Cyrillic letters are ignored. */
export function commandMatchKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/gu, '').normalize('NFC');
}
