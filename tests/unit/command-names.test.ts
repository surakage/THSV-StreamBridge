import { describe, expect, it } from 'vitest';
import { commandMatchKey, toCommandName } from '../../bridge/core/command-names.js';
import { commandName } from '../../bridge/core/effective-commands.js';
import { parseCommandInput } from '../../bridge/core/multi-commands.js';

const definitions = [
  { name: 'lurk', aliases: ['acecho'] },
  { name: 'café', aliases: [] },
  { name: 'ようこそ', aliases: ['bienvenue'] },
  { name: '8ball', aliases: [] },
] as const;

describe('commands in any language', () => {
  it('accepts the full-width exclamation mark used by Japanese, Chinese and Korean keyboards', () => {
    expect(parseCommandInput('！lurk', definitions)?.command).toBe('lurk');
    expect(parseCommandInput('！ようこそ　みんな', definitions)).toMatchObject({ command: 'ようこそ', arguments: ['みんな'] });
  });

  it('reads full-width letters and digits as their plain forms', () => {
    expect(parseCommandInput('!ｌｕｒｋ', definitions)?.command).toBe('lurk');
    expect(parseCommandInput('!８ball', definitions)?.command).toBe('8ball');
  });

  it('matches names with or without Latin accents, in any letter case', () => {
    expect(parseCommandInput('!cafe', definitions)?.command).toBe('café');
    expect(parseCommandInput('!CAFÉ', definitions)?.command).toBe('café');
    expect(parseCommandInput('!bienvenue', definitions)?.command).toBe('ようこそ');
  });

  it('keeps marks that change a letter in other scripts', () => {
    expect(commandMatchKey('が')).not.toBe(commandMatchKey('か'));
    expect(commandMatchKey('ñ')).toBe('n');
  });

  it('treats text that is not a command name as ordinary chat instead of failing', () => {
    expect(parseCommandInput('!!!', definitions)).toBeUndefined();
    expect(parseCommandInput('!lurk,', definitions)).toBeUndefined();
    expect(parseCommandInput('!hola', definitions)).toBeUndefined();
  });

  it('validates names from settings in any language', () => {
    expect(toCommandName('Café')).toBe('café');
    expect(toCommandName('환영')).toBe('환영');
    expect(toCommandName('hi there')).toBeUndefined();
    expect(commandName('！ようこそ')).toBe('ようこそ');
    expect(commandName('!Lurk extra words')).toBe('lurk');
    expect(commandName('!so,')).toBeUndefined();
  });
});
