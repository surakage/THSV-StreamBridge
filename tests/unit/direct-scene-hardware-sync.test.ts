import { describe, expect, it, vi } from 'vitest';
import { DirectSceneHardwareSync } from '../../bridge/services/direct-scene-hardware-sync.js';
const id = '3a8b1ff6-bc5d-409d-b670-f6217d4d1550';
const snapshot = (currentScene: string) => ({ connectionId: 'obs-main', connectionName: 'OBS', scenes: [], currentScene });
describe('direct OBS hardware reconciliation', () => {
  it('restores hardware for each actual scene change without repeating catalog refreshes', async () => {
    const run = vi.fn(async () => {}), sync = new DirectSceneHardwareSync(id, run, vi.fn());
    sync.observe('obs', snapshot('Starting')); sync.observe('obs', snapshot('BRB')); await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    sync.observe('obs', snapshot('BRB')); sync.observe('obs', snapshot('Gameplay'));
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });
  it('coalesces rapid changes while preserving a final reconciliation', async () => {
    let finish!: () => void;
    const run = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue(undefined);
    const sync = new DirectSceneHardwareSync(id, run, vi.fn());
    sync.observe('obs', snapshot('Starting')); sync.observe('obs', snapshot('BRB')); sync.observe('obs', snapshot('Gameplay')); sync.observe('obs', snapshot('Chatting')); finish();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });
  it('does not control hardware for another provider or an invalid action', () => {
    const run = vi.fn(async () => {});
    new DirectSceneHardwareSync(id, run, vi.fn()).observe('meld', snapshot('Gameplay'));
    new DirectSceneHardwareSync('', run, vi.fn()).observe('obs', snapshot('Gameplay'));
    expect(run).not.toHaveBeenCalled();
  });
  it('allows another attempt after a disconnect or dispatch failure', async () => {
    const warn = vi.fn(), run = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const sync = new DirectSceneHardwareSync(id, run, warn);
    sync.observe('obs', snapshot('BRB')); sync.observe('obs', snapshot('Gameplay')); await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    sync.observe('obs', snapshot('Gameplay')); await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });
  it('leaves lights alone on startup and unchanged snapshots, including another connection', async () => {
    const run = vi.fn(async () => {}), sync = new DirectSceneHardwareSync(id, run, vi.fn());
    sync.observe('obs', snapshot('Gameplay'));
    sync.observe('obs', snapshot('Gameplay'));
    sync.observe('obs', { ...snapshot('BRB'), connectionId: 'obs-secondary' });
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    sync.observe('obs', snapshot('BRB'));
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });
});
