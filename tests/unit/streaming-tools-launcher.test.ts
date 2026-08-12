import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('one-button streaming tools launcher', () => {
  it('starts Streamer.bot, then Speaker.bot, makes the bridge ready, and opens OBS last', async () => {
    const source = await readFile('launcher/start-streaming-tools.mjs', 'utf8');
    const streamerBotStart = source.indexOf("runLauncher(join(launcherRoot, 'start-streamerbot.mjs')");
    const speakerBotStart = source.indexOf("startOptionalApplication('speakerbot'");
    const bridgeCheck = source.indexOf('if (await bridgeReady(baseUrl))');
    const obsStart = source.indexOf("startOptionalApplication('obs'");
    expect(streamerBotStart).toBeGreaterThan(-1);
    expect(streamerBotStart).toBeLessThan(speakerBotStart);
    expect(speakerBotStart).toBeLessThan(bridgeCheck);
    expect(bridgeCheck).toBeLessThan(obsStart);
    expect(source).toContain('already ready. No restart was needed');
    expect(source).toContain("join(launcherRoot, 'start.mjs')");
    expect(source).toContain("`${url}/ready`");
    expect(source).toContain('readLauncherConfiguration()');
    expect(source).toContain('startOptionalApplication(application, launcherConfig)');
    expect(source).toContain("saved?.enabled !== true");
    expect(source).toContain('Optional app warning:');
    expect(source).toContain("child.once('error', rejectLaunch)");
    expect(source).toContain('OPTIONAL_STARTUP_GRACE_MS = 1_500');
    expect(source).toContain('to initialize before continuing');
    expect(source).toContain('exited during startup; continuing with Streamer.bot and StreamBridge');
    expect(source).toContain('await new Promise((resolveDelay) => setTimeout(resolveDelay, OPTIONAL_STARTUP_GRACE_MS))');
    expect(source).not.toContain('taskkill');
    expect(source).not.toContain('Stop-Process');
  });

  it('ships a visible command wrapper suitable for Stream Deck System Open', async () => {
    const source = await readFile('launcher/Start THSV Streaming Tools.cmd', 'utf8');
    expect(source).toContain('launcher\\start-streaming-tools.mjs');
    expect(source).toContain('Streamer.bot, Speaker.bot, StreamBridge, then OBS');
    expect(source).toContain('[SUCCESS] Your THSV streaming tools are ready.');
    expect(source).toContain('Optional OBS or Speaker.bot issues are warnings');
    expect(source).toContain('Closing automatically in 2 seconds.');
    expect(source).toContain('runtime\\node.exe" -e "setTimeout(function(){},2000)"');
    expect(source).not.toContain('timeout /t');
    expect(source.indexOf('exit /b 0')).toBeLessThan(source.indexOf('Press any key to close this window.'));
    expect(source).toContain('exit /b %THSV_TOOLS_EXIT%');
  });

  it('is also exposed through the authenticated wizard launcher service', async () => {
    const source = await readFile('bridge/services/streamerbot-launcher-service.ts', 'utf8');
    const wizard = await readFile('wizard/browser/app.js', 'utf8');
    expect(source).toContain('startAllStreamingTools');
    expect(source).toContain("join(this.installRoot, 'launcher', 'start-streaming-tools.mjs')");
    expect(wizard).toContain('/wizard/api/streamerbot-launcher/start-all');
    expect(source).toContain('Start THSV Streaming Tools.lnk');
    expect(source).toContain('THSV_SHORTCUT_TARGET: target');
    expect(source).toContain('process.env.ComSpec');
    expect(source).toContain("'System32', 'cmd.exe'");
    expect(source).toContain('THSV_SHORTCUT_ICON: `${commandIcon},0`');
    expect(source).not.toContain('THSV_SHORTCUT_ICON: `${configuration.executable},0`');
    expect(source).not.toContain('THSV_SHORTCUT_ARGS');
  });
});
