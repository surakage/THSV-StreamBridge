import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseOptionalStartupWarnings, StreamerBotLauncherService } from '../../bridge/services/streamerbot-launcher-service.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('public Streamer.bot launcher configuration', () => {
  it('extracts only explicit optional-app warning lines from successful launcher output', () => {
    expect(parseOptionalStartupWarnings('Streamer.bot is ready.\nOptional app warning: Speaker.bot exited during startup.\nEnabled core tools are ready.')).toEqual(['Speaker.bot exited during startup.']);
    expect(parseOptionalStartupWarnings('Streamer.bot and THSV StreamBridge are ready.')).toEqual([]);
  });
  it('stores the selected portable executable outside versioned application files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-streamerbot-launcher-')); temporaryRoots.push(root);
    const dataRoot = join(root, 'data'); const executable = join(root, 'portable', 'Streamer.bot.exe');
    await mkdir(join(root, 'portable'), { recursive: true }); await writeFile(executable, 'test executable');
    const service = new StreamerBotLauncherService(dataRoot, 'ws://127.0.0.1:65534/');
    const status = await service.save(executable);
    expect(status).toMatchObject({ configured: true, executable, executableExists: true, websocketPort: 65534, state: 'stopped', installRoot: root, streamDeckTarget: join(root, 'Start THSV Streaming Tools.cmd') });
    expect(JSON.parse(await readFile(join(dataRoot, 'configuration', 'streamerbot-launcher.json'), 'utf8'))).toMatchObject({ version: 2, executable, websocketPort: 65534, optionalApps: {} });
  });

  it('migrates version 1 settings and keeps optional applications explicitly opt-in', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-streaming-apps-')); temporaryRoots.push(root);
    const dataRoot = join(root, 'data'); const configurationRoot = join(dataRoot, 'configuration');
    const streamerBot = join(root, 'portable', 'Streamer.bot.exe'); const obs = join(root, 'obs64.exe'); const speaker = join(root, 'Speaker.bot.exe');
    await mkdir(join(root, 'portable'), { recursive: true }); await mkdir(configurationRoot, { recursive: true });
    await Promise.all([writeFile(streamerBot, 'streamerbot'), writeFile(obs, 'obs'), writeFile(speaker, 'speaker')]);
    await writeFile(join(configurationRoot, 'streamerbot-launcher.json'), JSON.stringify({ version: 1, executable: streamerBot, websocketPort: 65534 }));
    const service = new StreamerBotLauncherService(dataRoot, 'ws://127.0.0.1:65534/');
    let status = await service.saveOptionalApplication('obs', obs, true);
    expect(status.optionalApps.obs).toMatchObject({ configured: true, enabled: true, executable: obs, executableExists: true });
    expect(status.optionalApps.speakerbot).toMatchObject({ configured: false, enabled: false });
    status = await service.saveOptionalApplication('speakerbot', speaker, false);
    expect(status.optionalApps.speakerbot).toMatchObject({ configured: true, enabled: false, executable: speaker, executableExists: true });
    const saved = JSON.parse(await readFile(join(configurationRoot, 'streamerbot-launcher.json'), 'utf8')) as unknown;
    expect(saved).toMatchObject({ version: 2, executable: streamerBot, optionalApps: { obs: { executable: obs, enabled: true }, speakerbot: { executable: speaker, enabled: false } } });
  });

  it('rejects missing files and misleading executable names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-streamerbot-launcher-invalid-')); temporaryRoots.push(root);
    const service = new StreamerBotLauncherService(join(root, 'data'), 'ws://127.0.0.1:65534/');
    await expect(service.save(join(root, 'not-streamerbot.exe'))).rejects.toThrow('real Streamer.bot.exe');
    await expect(service.save(join(root, 'Streamer.bot.exe'))).rejects.toThrow('real Streamer.bot.exe');
    const executable = join(root, 'portable', 'Streamer.bot.exe'); await mkdir(join(root, 'portable'), { recursive: true }); await writeFile(executable, 'test'); await service.save(executable);
    await expect(service.saveOptionalApplication('obs', join(root, 'fake-obs.exe'), true)).rejects.toThrow('real OBS Studio executable');
    await expect(service.setOptionalApplicationEnabled('speakerbot', true)).rejects.toThrow('Choose Speaker.bot');
  });

  it('requires the installed one-button launcher before starting the complete tool set', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-start-all-missing-')); temporaryRoots.push(root);
    const executable = join(root, 'portable', 'Streamer.bot.exe'); await mkdir(join(root, 'portable'), { recursive: true }); await writeFile(executable, 'test');
    const service = new StreamerBotLauncherService(join(root, 'data'), 'ws://127.0.0.1:65534/'); await service.save(executable);
    await expect(service.startAllStreamingTools()).rejects.toThrow('one-button streaming tools launcher is missing');
  });
});
