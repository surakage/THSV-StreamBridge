import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildStreamerBotPackage, stableStreamerBotUuid } from '../../bridge/services/streamerbot-package-builder.js';

interface DecodedPackage {
  readonly data: {
    readonly actions: ReadonlyArray<{ readonly id: string; readonly subActions: ReadonlyArray<{ readonly id: string; readonly type: number; readonly index: number; readonly variableName?: string; readonly value?: string; readonly autoType?: boolean; readonly references?: readonly string[] }>; readonly triggers: ReadonlyArray<{ readonly id: string; readonly commandId: string }> }>;
    readonly commands: ReadonlyArray<{ readonly id: string; readonly sources?: number; readonly globalCooldown?: number; readonly userCooldown?: number; readonly ignoreBotAccount?: boolean; readonly ignoreInternal?: boolean }>;
  };
}

function decode(value: string): DecodedPackage {
  const bytes = Buffer.from(value, 'base64');
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('SBAE');
  return JSON.parse(gunzipSync(bytes.subarray(4)).toString('utf8')) as DecodedPackage;
}

const meta = { name: 'Test package', version: '1.0.0', minimumStreamerBotVersion: '1.0.0', concurrent: true } as const;

describe('Streamer.bot package builder', () => {
  it('builds multiple actions and command triggers with deterministic generated IDs', () => {
    const first = buildStreamerBotPackage(meta, [
      { name: 'One', group: 'Tests', sourceCode: 'return true;', stableIdentitySeed: 'one', triggers: [{ commandId: 'command-1', stableIdentitySeed: 'one-trigger' }] },
      { name: 'Two', group: 'Tests', sourceCode: 'return true;', stableIdentitySeed: 'two' },
    ]);
    const second = buildStreamerBotPackage(meta, [
      { name: 'One', group: 'Tests', sourceCode: 'return true;', stableIdentitySeed: 'one', triggers: [{ commandId: 'command-1', stableIdentitySeed: 'one-trigger' }] },
      { name: 'Two', group: 'Tests', sourceCode: 'return true;', stableIdentitySeed: 'two' },
    ]);
    expect(second).toBe(first);
    const decoded = decode(first);
    expect(decoded.data.actions).toHaveLength(2);
    expect(decoded.data.actions[0]?.id).toBe(stableStreamerBotUuid('one:action'));
    expect(decoded.data.actions[0]?.triggers).toEqual([{ commandId: 'command-1', id: stableStreamerBotUuid('one-trigger:trigger'), type: 401, enabled: true, exclusions: [] }]);
  });

  it('preserves pinned action, source, trigger, and command IDs', () => {
    const decoded = decode(buildStreamerBotPackage(meta, [{
      name: 'Pinned', group: 'Tests', id: 'action-id', sourceSubActionId: 'source-id', sourceCode: 'return true;', stableIdentitySeed: 'ignored',
      triggers: [{ commandId: 'command-id', id: 'trigger-id', stableIdentitySeed: 'ignored-trigger' }],
    }], [{ id: 'command-id', name: 'test', command: '!test', enabled: false, caseSensitive: false, stableIdentitySeed: 'ignored-command' }]));
    expect(decoded.data.actions[0]).toMatchObject({ id: 'action-id', subActions: [{ id: 'source-id' }], triggers: [{ id: 'trigger-id', commandId: 'command-id' }] });
    expect(decoded.data.commands[0]?.id).toBe('command-id');
  });

  it('places editable Set Argument sub-actions before C# and includes required compiler references', () => {
    const decoded = decode(buildStreamerBotPackage(meta, [{
      name: 'Launcher', group: 'Tests', sourceCode: 'using Newtonsoft.Json; return true;', stableIdentitySeed: 'launcher',
      arguments: [{ name: 'installPath', value: 'Default Windows install', autoType: false, id: 'argument-id', stableIdentitySeed: 'launcher-path' }],
    }]));
    expect(decoded.data.actions[0]?.subActions[0]).toMatchObject({ id: 'argument-id', type: 123, index: 0, variableName: 'installPath', value: 'Default Windows install', autoType: false });
    const code = decoded.data.actions[0]?.subActions[1];
    expect(code).toMatchObject({ type: 99_999, index: 1 });
    expect(code?.references).toContain('.\\Newtonsoft.Json.dll');
  });

  it('rejects an empty package', () => {
    expect(() => buildStreamerBotPackage(meta, [])).toThrow('at least one action');
  });

  it('exports verified command source flags, cooldowns, and filtering settings', () => {
    const decoded = decode(buildStreamerBotPackage(meta, [{ name: 'Action', group: 'Tests', sourceCode: 'return true;', stableIdentitySeed: 'action' }], [{
      name: 'hello', command: '!hello', enabled: false, caseSensitive: false, stableIdentitySeed: 'hello',
      sources: 1 | 1_024 | 2_097_152, globalCooldown: 10, userCooldown: 30, ignoreBotAccount: false, ignoreInternal: false,
    }]));
    expect(decoded.data.commands[0]).toMatchObject({ sources: 2_098_177, globalCooldown: 10, userCooldown: 30, ignoreBotAccount: false, ignoreInternal: false });
  });
});
