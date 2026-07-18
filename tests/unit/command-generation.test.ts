import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  createCommandDesign,
  findCommandCollision,
  generateCommandPackage,
  parseCommandDesignInput,
  InvalidCommandDesignError,
} from '../../bridge/core/command-generation.js';

describe('command design validation', () => {
  it('creates a normalized design with defaults', () => {
    expect(createCommandDesign({ name: 'Shoutout', approvedByCreator: true })).toEqual({
      name: 'shoutout', aliases: [], minimumRole: 'viewer', note: '',
    });
  });

  it('normalizes aliases and accepts an explicit role and note', () => {
    expect(createCommandDesign({
      name: 'so', aliases: ['Shoutout', 'SO2'], minimumRole: 'moderator', note: 'Reads a target username argument.', approvedByCreator: true,
    })).toEqual({
      name: 'so', aliases: ['shoutout', 'so2'], minimumRole: 'moderator', note: 'Reads a target username argument.',
    });
  });

  it('denies missing creator approval', () => {
    expect(() => createCommandDesign({ name: 'so', approvedByCreator: false })).toThrow(InvalidCommandDesignError);
    expect(() => createCommandDesign({ name: 'so', approvedByCreator: false })).toThrow('explicit creator approval');
  });

  it('rejects a malformed name', () => {
    expect(() => createCommandDesign({ name: 'So!', approvedByCreator: true })).toThrow('letters, numbers, and hyphens');
    expect(() => createCommandDesign({ name: '', approvedByCreator: true })).toThrow('letters, numbers, and hyphens');
    expect(() => createCommandDesign({ name: '1so', approvedByCreator: true })).toThrow('letters, numbers, and hyphens');
  });

  it('rejects duplicate name/alias entries', () => {
    expect(() => createCommandDesign({ name: 'so', aliases: ['so'], approvedByCreator: true })).toThrow('must all be distinct');
  });

  it('rejects too many aliases', () => {
    expect(() => createCommandDesign({ name: 'so', aliases: Array.from({ length: 21 }, (_, index) => `a${String(index)}`), approvedByCreator: true }))
      .toThrow('At most 20 aliases');
  });

  it('rejects an unrecognized role', () => {
    expect(() => createCommandDesign({ name: 'so', minimumRole: 'admin', approvedByCreator: true })).toThrow('minimumRole must be one of');
  });

  it('rejects a multi-line note', () => {
    expect(() => createCommandDesign({ name: 'so', note: 'line one\nline two', approvedByCreator: true })).toThrow('single line');
  });
});

describe('parseCommandDesignInput', () => {
  it('accepts a well-formed body', () => {
    expect(parseCommandDesignInput({ name: 'so', aliases: ['shoutout'], approvedByCreator: true })).toEqual({
      name: 'so', aliases: ['shoutout'], approvedByCreator: true,
    });
  });

  it('rejects a non-object body', () => {
    expect(() => parseCommandDesignInput(null)).toThrow('JSON object');
    expect(() => parseCommandDesignInput('so')).toThrow('JSON object');
  });

  it('rejects a missing or non-string name', () => {
    expect(() => parseCommandDesignInput({ approvedByCreator: true })).toThrow('name is required');
    expect(() => parseCommandDesignInput({ name: 5, approvedByCreator: true })).toThrow('name is required');
  });

  it('rejects a non-boolean approvedByCreator', () => {
    expect(() => parseCommandDesignInput({ name: 'so', approvedByCreator: 'yes' })).toThrow('approvedByCreator must be a boolean');
  });

  it('rejects aliases that are not an array of strings', () => {
    expect(() => parseCommandDesignInput({ name: 'so', approvedByCreator: true, aliases: [1, 2] })).toThrow('array of strings');
    expect(() => parseCommandDesignInput({ name: 'so', approvedByCreator: true, aliases: 'so2' })).toThrow('array of strings');
  });
});

describe('command collision detection', () => {
  const design = createCommandDesign({ name: 'so', aliases: ['shoutout'], approvedByCreator: true });

  it('reports no collision against unrelated live objects', () => {
    expect(findCommandCollision(design, {
      actions: [{ id: 'a1', name: 'Unrelated Action' }],
      commands: [{ id: 'c1', name: 'unrelated' }],
    })).toBeUndefined();
  });

  it('detects a case-insensitive collision against a live action name', () => {
    expect(findCommandCollision(design, { actions: [{ id: 'a1', name: 'SO' }], commands: [] }))
      .toEqual({ kind: 'action', id: 'a1', name: 'SO', matchedOn: 'so' });
  });

  it('detects a collision against a live command alias, regardless of ownership', () => {
    expect(findCommandCollision(design, { actions: [], commands: [{ id: 'c1', name: 'greet', aliases: ['Shoutout'] }] }))
      .toEqual({ kind: 'command', id: 'c1', name: 'greet', matchedOn: 'shoutout' });
  });

  it('detects a collision against a live command primary name', () => {
    expect(findCommandCollision(design, { actions: [], commands: [{ id: 'c1', name: 'so' }] }))
      .toEqual({ kind: 'command', id: 'c1', name: 'so', matchedOn: 'so' });
  });
});

describe('command package generation', () => {
  it('produces a deterministic, reviewable, disabled-by-default command package', () => {
    const design = createCommandDesign({ name: 'so', aliases: ['shoutout'], minimumRole: 'moderator', note: 'Reads a target argument.', approvedByCreator: true });
    const generated = generateCommandPackage(design);
    expect(generated.filename).toBe('thsv-generated-so.sb');
    expect(generated.sourceCode).toContain('"so"');
    expect(generated.sourceCode).toContain('moderator');
    expect(generated.sourceCode).not.toMatch(/token|password|authorization/i);

    const decoded = Buffer.from(generated.contentBase64, 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      data: {
        actions: Array<{ id: string; name: string; subActions: Array<{ byteCode: string }> }>;
        commands: Array<{ id: string; name: string; enabled: boolean; commands: string[]; caseSensitive: boolean }>;
      };
    };
    expect(exported.data.actions).toHaveLength(1);
    expect(exported.data.actions[0]?.id).toBe(generated.actionId);
    expect(Buffer.from(exported.data.actions[0]?.subActions[0]?.byteCode ?? '', 'base64').toString('utf8')).toBe(generated.sourceCode);

    expect(exported.data.commands).toHaveLength(1);
    const command = exported.data.commands[0];
    expect(command?.id).toBe(generated.commandId);
    expect(command?.name).toBe('so');
    // Imports disabled on purpose: the command-to-action trigger binding is unverified, so an
    // incorrect guess at Streamer.bot's Command JSON shape must be inert until a creator reviews
    // and enables it themselves.
    expect(command?.enabled).toBe(false);
    expect(command?.commands).toEqual(['so', 'shoutout']);
  });

  it('is deterministic for the same design', () => {
    const design = createCommandDesign({ name: 'greet', approvedByCreator: true });
    expect(generateCommandPackage(design)).toEqual(generateCommandPackage(design));
  });

  it('produces different IDs for different command names', () => {
    const first = generateCommandPackage(createCommandDesign({ name: 'greet', approvedByCreator: true }));
    const second = generateCommandPackage(createCommandDesign({ name: 'wave', approvedByCreator: true }));
    expect(first.actionId).not.toBe(second.actionId);
    expect(first.commandId).not.toBe(second.commandId);
  });
});
