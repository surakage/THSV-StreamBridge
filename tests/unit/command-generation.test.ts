import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  createCommandDesign,
  createCommandDesigns,
  findCommandCollision,
  findAllCommandCollisions,
  generateCommandsPackage,
  parseCommandDesignInput,
  parseCommandDesignsInput,
  InvalidCommandDesignError,
} from '../../bridge/core/command-generation.js';

describe('command design validation', () => {
  it('creates a normalized design with defaults', () => {
    expect(createCommandDesign({ name: 'Shoutout', approvedByCreator: true })).toEqual({
      name: 'shoutout', aliases: [], minimumRole: 'viewer', note: '', actionName: 'THSV Command - Shoutout', responseMode: 'none', commandSources: [], platformMessages: {}, customScript: '', globalCooldown: 0, userCooldown: 0, ignoreBotAccount: true, ignoreInternal: true,
    });
  });

  it('normalizes aliases and accepts an explicit role and note', () => {
    expect(createCommandDesign({
      name: 'so', aliases: ['Shoutout', 'SO2'], minimumRole: 'moderator', note: 'Reads a target username argument.', approvedByCreator: true,
    })).toEqual({
      name: 'so', aliases: ['shoutout', 'so2'], minimumRole: 'moderator', note: 'Reads a target username argument.', actionName: 'THSV Command - So', responseMode: 'none', commandSources: [], platformMessages: {}, customScript: '', globalCooldown: 0, userCooldown: 0, ignoreBotAccount: true, ignoreInternal: true,
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

  it('rejects overlong and Unicode command names at the boundary', () => {
    expect(() => createCommandDesign({ name: `a${'b'.repeat(64)}`, approvedByCreator: true })).toThrow('at most 64 characters');
    expect(() => createCommandDesign({ name: 'café', approvedByCreator: true })).toThrow('letters, numbers, and hyphens');
    expect(() => createCommandDesign({ name: 'wave-🦥', approvedByCreator: true })).toThrow('letters, numbers, and hyphens');
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

describe('batch design validation', () => {
  it('validates every design in the batch', () => {
    expect(createCommandDesigns([
      { name: 'so', approvedByCreator: true },
      { name: 'greet', aliases: ['hi'], approvedByCreator: true },
    ])).toEqual([
      { name: 'so', aliases: [], minimumRole: 'viewer', note: '', actionName: 'THSV Command - So', responseMode: 'none', commandSources: [], platformMessages: {}, customScript: '', globalCooldown: 0, userCooldown: 0, ignoreBotAccount: true, ignoreInternal: true },
      { name: 'greet', aliases: ['hi'], minimumRole: 'viewer', note: '', actionName: 'THSV Command - Greet', responseMode: 'none', commandSources: [], platformMessages: {}, customScript: '', globalCooldown: 0, userCooldown: 0, ignoreBotAccount: true, ignoreInternal: true },
    ]);
  });

  it('rejects an empty batch', () => {
    expect(() => createCommandDesigns([])).toThrow('At least one command design is required');
  });

  it('rejects a batch larger than the cap', () => {
    const inputs = Array.from({ length: 21 }, (_, index) => ({ name: `cmd${String(index)}`, approvedByCreator: true }));
    expect(() => createCommandDesigns(inputs)).toThrow('At most 20 commands');
  });

  it('rejects a name or alias reused across designs in the same batch', () => {
    expect(() => createCommandDesigns([
      { name: 'so', approvedByCreator: true },
      { name: 'greet', aliases: ['so'], approvedByCreator: true },
    ])).toThrow('used by both design 0 and design 1');
  });
});

describe('parseCommandDesignsInput', () => {
  it('accepts a well-formed batch body', () => {
    expect(parseCommandDesignsInput({ designs: [{ name: 'so', approvedByCreator: true }] })).toEqual([
      { name: 'so', approvedByCreator: true },
    ]);
  });

  it('rejects a body without a designs array', () => {
    expect(() => parseCommandDesignsInput({})).toThrow('designs is required');
    expect(() => parseCommandDesignsInput({ designs: 'so' })).toThrow('designs is required');
  });
});

describe('batch collision detection', () => {
  it('checks every design against live inventory and tags each collision with its batch index', () => {
    const designs = createCommandDesigns([
      { name: 'so', approvedByCreator: true },
      { name: 'greet', approvedByCreator: true },
    ]);
    expect(findAllCommandCollisions(designs, { actions: [], commands: [{ id: 'c1', name: 'greet' }] })).toEqual([
      { kind: 'command', id: 'c1', name: 'greet', matchedOn: 'greet', designIndex: 1 },
    ]);
  });

  it('reports no collisions when nothing in the batch matches live inventory', () => {
    const designs = createCommandDesigns([{ name: 'so', approvedByCreator: true }]);
    expect(findAllCommandCollisions(designs, { actions: [], commands: [] })).toEqual([]);
  });
});

describe('command package generation', () => {
  it('produces a deterministic, reviewable, disabled-by-default command package with a real trigger binding', () => {
    const designs = createCommandDesigns([
      { name: 'so', aliases: ['shoutout'], minimumRole: 'moderator', note: 'Reads a target argument.', approvedByCreator: true },
    ]);
    const generated = generateCommandsPackage(designs, '!');
    expect(generated.filename).toBe('thsv-generated-so.sb');
    expect(generated.commands).toHaveLength(1);
    const entry = generated.commands[0];
    expect(entry?.sourceCode).toContain('"!so"');
    expect(entry?.sourceCode).toContain('moderator');
    expect(entry?.sourceCode).not.toMatch(/token|password|authorization/i);

    const decoded = Buffer.from(generated.contentBase64, 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      data: {
        actions: Array<{ id: string; name: string; group: string; triggers: Array<{ commandId: string; type: number; enabled: boolean }>; subActions: Array<{ byteCode: string }> }>;
        commands: Array<{ id: string; name: string; command: string; enabled: boolean; caseSensitive: boolean }>;
      };
    };
    expect(exported.data.actions).toHaveLength(1);
    const action = exported.data.actions[0];
    expect(action?.id).toBe(entry?.actionId);
    expect(action?.group).toBe('THSV Bridge - Commands');
    expect(Buffer.from(action?.subActions[0]?.byteCode ?? '', 'base64').toString('utf8')).toBe(entry?.sourceCode);
    // Confirmed against a real Streamer.bot v1.0.5-alpha.31 export: the binding lives on the
    // action's own triggers array, referencing the command by ID, type 401 ("Command Triggered").
    expect(action?.triggers).toEqual([{ commandId: entry?.commandId, id: expect.any(String) as string, type: 401, enabled: true, exclusions: [] }]);

    expect(exported.data.commands).toHaveLength(1);
    const command = exported.data.commands[0];
    expect(command?.id).toBe(entry?.commandId);
    expect(command?.name).toBe('so');
    expect(command?.command).toBe('!so\n!shoutout');
    // Imports remain disabled so the creator reviews the generated action, permissions, sources,
    // aliases, and cooldowns before enabling it.
    expect(command?.enabled).toBe(false);
  });

  it('generates one package containing an action, command, and trigger per design in the batch', () => {
    const designs = createCommandDesigns([
      { name: 'so', approvedByCreator: true },
      { name: 'greet', approvedByCreator: true },
    ]);
    const generated = generateCommandsPackage(designs, '!');
    expect(generated.filename).toBe('thsv-generated-batch-2-commands.sb');
    expect(generated.commands.map((entry) => entry.name)).toEqual(['so', 'greet']);
    const decoded = Buffer.from(generated.contentBase64, 'base64');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as { data: { actions: unknown[]; commands: unknown[] } };
    expect(exported.data.actions).toHaveLength(2);
    expect(exported.data.commands).toHaveLength(2);
  });

  it('generates a creator-named action with source-gated platform messages and command settings', () => {
    const design = createCommandDesign({
      name: 'hello', actionName: 'THSV Command - Hello', responseMode: 'platform-message',
      commandSources: ['twitch', 'youtube', 'kick'], platformMessages: { twitch: 'Hello Twitch!', youtube: 'Hello YouTube!', kick: 'Hello Kick!' },
      globalCooldown: 10, userCooldown: 30, approvedByCreator: true,
    });
    const generated = generateCommandsPackage([design], '!');
    const source = generated.commands[0]?.sourceCode ?? '';
    expect(source).toContain('string commandSource = Read("commandSource")');
    expect(source).toContain('generatedCommandResponseMessage');
    expect(source).toContain('if (commandSource == "twitch")');
    expect(source).toContain('SendToSource(commandSource, responseMessage);');
    // SendToSource (shared by platform-message and custom-script modes) uses the verified
    // per-platform methods and signatures, confirmed directly against docs.streamer.bot.
    expect(source).toContain('CPH.SendMessage(message, true, true)');
    expect(source).toContain('CPH.SendYouTubeMessageToLatestMonitored(message, true, true)');
    expect(source).toContain('CPH.SendKickMessage(message, true, true)');
    const decoded = Buffer.from(generated.contentBase64, 'base64');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as { data: { actions: Array<{ name: string }>; commands: Array<{ sources: number; globalCooldown: number; userCooldown: number }> } };
    expect(exported.data.actions[0]?.name).toBe('THSV Command - Hello');
    expect(exported.data.commands[0]).toMatchObject({ sources: 2_098_177, globalCooldown: 10, userCooldown: 30 });
  });

  it('enforces the platform-specific response limits', () => {
    expect(() => createCommandDesign({ name: 'long-youtube', responseMode: 'platform-message', commandSources: ['youtube'], platformMessages: { youtube: 'x'.repeat(201) }, approvedByCreator: true })).toThrow('1-200');
    expect(() => createCommandDesign({ name: 'long-twitch', responseMode: 'platform-message', commandSources: ['twitch'], platformMessages: { twitch: 'x'.repeat(501) }, approvedByCreator: true })).toThrow('1-500');
    expect(() => createCommandDesign({ name: 'long-tiktok', responseMode: 'platform-message', commandSources: ['tiktok'], platformMessages: { tiktok: 'x'.repeat(151) }, approvedByCreator: true })).toThrow('1-150');
  });

  it('generates a TikFinity-gated response without enabling an unrelated native command source', () => {
    const design = createCommandDesign({
      name: 'lurk', responseMode: 'platform-message', commandSources: ['tiktok'],
      platformMessages: { tiktok: 'Thanks for lurking, {user}!' }, approvedByCreator: true,
    });
    const generated = generateCommandsPackage([design], '!');
    const source = generated.commands[0]?.sourceCode ?? '';
    expect(source).toContain('Has("commandParams")');
    expect(source).toContain('Read("nickname")');
    expect(source).toContain('action = "sendChatbotMessage"');
    expect(source).toContain('JsonConvert.SerializeObject');
    expect(source).toContain('generatedCommandTikTokMessage');
    const decoded = Buffer.from(generated.contentBase64, 'base64');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as { data: { commands: Array<{ sources: number }> } };
    expect(exported.data.commands[0]?.sources).toBe(0);
  });

  it('embeds a custom script inside the same source gate, as the body of a dedicated response method', () => {
    const design = createCommandDesign({ name: 'custom-script', responseMode: 'custom-script', commandSources: ['youtube'], customScript: 'return "hi";', approvedByCreator: true });
    const source = generateCommandsPackage([design], '!').commands[0]?.sourceCode ?? '';
    expect(source).toContain('allowedSources.Contains(commandSource)');
    // The custom script must land as the body of its own method -- never spliced directly into
    // Execute() -- so it cannot collide with a creator pasting a full "using/class/Execute()"
    // wrapper by habit (a real, previously-shipped bug: that produced a class nested inside a
    // method, which fails to compile). Execute() calls it and reuses the same verified SendToSource
    // dispatch as platform-message mode, so custom scripts never need to get Send*Message right.
    expect(source).toContain('private string BuildCustomResponse(string commandSource, string userName, string target, string rawInput, string channelName)');
    expect(source).toContain('        return "hi";');
    expect(source).toContain('string responseMessage = BuildCustomResponse(commandSource, userName, target, rawInput, channelName);');
    expect(source).toContain('SendToSource(commandSource, responseMessage);');
  });

  it('a custom script that calls CPH directly and falls through still compiles, since BuildCustomResponse always returns a string', () => {
    const design = createCommandDesign({ name: 'direct-send', responseMode: 'custom-script', commandSources: ['twitch'], customScript: 'CPH.SendMessage("hi", true, true);', approvedByCreator: true });
    const source = generateCommandsPackage([design], '!').commands[0]?.sourceCode ?? '';
    // The generator appends a trailing "return \"\";" after the creator's code, so a script with no
    // return statement of its own still satisfies BuildCustomResponse's non-void return type.
    expect(source).toContain('CPH.SendMessage("hi", true, true);\n        return "";');
  });

  it('rejects a custom script that pastes a full action wrapper instead of just a method body', () => {
    const fullWrapper = 'using System;\npublic class CPHInline\n{\n    public bool Execute()\n    {\n        return true;\n    }\n}';
    expect(() => createCommandDesign({ name: 'wrapped', responseMode: 'custom-script', commandSources: ['twitch'], customScript: fullWrapper, approvedByCreator: true }))
      .toThrow('customScript must be only the body of the response method');
    // A script that merely mentions "Execute" in a comment, or has neither telltale pattern, is fine.
    expect(() => createCommandDesign({ name: 'not-wrapped', responseMode: 'custom-script', commandSources: ['twitch'], customScript: 'return "ok"; // runs after Execute begins', approvedByCreator: true }))
      .not.toThrow();
  });

  it('uses the configured prefix, falling back to "!" for an invalid one', () => {
    const designs = createCommandDesigns([{ name: 'so', approvedByCreator: true }]);
    expect(generateCommandsPackage(designs, '?').commands[0]?.sourceCode).toContain('"?so"');
    expect(generateCommandsPackage(designs, '').commands[0]?.sourceCode).toContain('"!so"');
    expect(generateCommandsPackage(designs, 'ab').commands[0]?.sourceCode).toContain('"!so"');
  });

  it('is deterministic for the same batch and prefix', () => {
    const designs = createCommandDesigns([{ name: 'greet', approvedByCreator: true }]);
    expect(generateCommandsPackage(designs, '!')).toEqual(generateCommandsPackage(designs, '!'));
  });

  it('produces different IDs for different command names', () => {
    const first = generateCommandsPackage(createCommandDesigns([{ name: 'greet', approvedByCreator: true }]), '!').commands[0];
    const second = generateCommandsPackage(createCommandDesigns([{ name: 'wave', approvedByCreator: true }]), '!').commands[0];
    expect(first?.actionId).not.toBe(second?.actionId);
    expect(first?.commandId).not.toBe(second?.commandId);
  });
});
