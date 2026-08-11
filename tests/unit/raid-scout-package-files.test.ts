import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Raid Scout package files', () => {
  it('ships one stable triggerless controller, exact creator controls, and a provider stop confirmation', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/raid-scout/manifest.json', 'utf8')) as {
      version: string; actions: Array<{ id: string; name: string; group: string; importFile: string; arguments?: Array<{ name: string; value: string }> }>;
      triggerSafety: string;
    };
    expect(manifest.actions).toHaveLength(8);
    expect(manifest.actions[0]).toMatchObject({
      id: '6a78d950-17b5-4a98-9de7-1a5b4275f31c',
      name: 'THSV Addon - Raid Scout - Controller',
      group: 'THSV Addon - Raid Scout',
    });
    expect(manifest.actions.slice(1, 6).map((action) => action.arguments?.[0]?.value)).toEqual(['suggest', 'finish', 'confirm', 'cancel', 'broadcast-stopped']);
    expect(manifest.actions[6]).toMatchObject({
      id: '18a8de7c-1c5f-4a1e-8d58-7944c74060d5',
      name: 'THSV Addon - Raid Scout - Run Ending Ad',
      group: 'THSV Addon - Raid Scout',
    });
    expect(manifest.actions[7]).toMatchObject({
      id: '0c4d8af8-593c-5e6a-b07f-948079c22cd1',
      name: 'THSV Addon - Raid Scout - Stop All OBS Streaming Outputs',
      group: 'THSV Addon - Raid Scout',
    });
    expect(manifest.actions[6]?.arguments).toBeUndefined();
    expect(manifest.actions[7]?.arguments).toBeUndefined();
    expect(new Set(manifest.actions.map((action) => action.importFile))).toEqual(new Set([`THSV-StreamBridge-Raid-Scout-${manifest.version}.sb`]));
    expect(manifest.triggerSafety).toContain('Controller, Run Ending Ad, and Stop All OBS Streaming Outputs must remain triggerless');
    const control = await readFile('packages/streamerbot/raid-scout/src/RaidScoutControl.cs', 'utf8');
    expect(control).toContain('action == "broadcast-stopped"');
    expect(control).toContain('action == "finish"');
    expect(control).toContain('Broadcast Stopped');
    const stopAllOutputs = await readFile('packages/streamerbot/raid-scout/src/StopAllObsStreamingOutputs.cs', 'utf8');
    const runEndingAd = await readFile('packages/streamerbot/raid-scout/src/RunEndingAd.cs', 'utf8');
    expect(runEndingAd).toContain('CPH.TwitchRunCommercial(duration)');
    expect(runEndingAd).toContain('Twitch Ads > Ad Run');
    expect(runEndingAd).toContain('ending-ad-request');
    expect(stopAllOutputs).toContain('GetOutputList');
    expect(stopAllOutputs).toContain('StopOutput');
    expect(stopAllOutputs).toContain('ObsOutputServiceFlag');
    expect(stopAllOutputs).toContain('aitum_multi_output_');
    expect(stopAllOutputs).toContain('outputKind.Contains("mpegts")');
    expect(stopAllOutputs).not.toContain('JToken responseData');
    expect(stopAllOutputs).toContain('GetOutputStatus');
    expect(stopAllOutputs).toContain('int confirmationDeadline = Environment.TickCount + 3000');
    expect(stopAllOutputs).toContain('WaitForOutputToStopUntil(outputName, confirmationDeadline)');
    expect(stopAllOutputs).toContain('confirmed OBS plug-in streaming output');
    expect(stopAllOutputs).toContain('continuing to stop OBS main even though');
    expect(stopAllOutputs).toContain('CPH.ObsStopStreaming()');
    expect(stopAllOutputs.indexOf('continuing to stop OBS main even though')).toBeLessThan(stopAllOutputs.indexOf('CPH.ObsStopStreaming()'));
    expect(stopAllOutputs).not.toMatch(/ObsStopRecording|ObsReplayBufferStop/u);
  });

  it('bounds Twitch discovery and keeps credentials inside fixed Helix requests', async () => {
    const controller = await readFile('packages/streamerbot/raid-scout/src/RaidScoutController.cs', 'utf8');
    for (const contract of [
      'CPH.TwitchGetBroadcaster()',
      'CPH.TwitchGetExtendedUserInfoById',
      'CPH.TwitchStartRaidById',
      'CPH.TwitchStartRaidByName',
      'CPH.TwitchRedemptionFulfill',
      'CPH.TwitchRedemptionCancel',
      'https://api.twitch.tv/helix/',
      'TimeSpan.FromSeconds(10)',
      'MaximumResponseCharacters = 262144',
      'MaximumCandidates = 100',
      'sourceResults',
      'clips?broadcaster_id=',
      'https://clips.twitch.tv/embed?',
    ]) expect(controller).toContain(contract);
    expect(controller).toContain('CPH.TwitchOAuthToken');
    expect(controller).toContain('CPH.TwitchClientId');
    expect(controller).not.toMatch(/System\.IO|File\.|Directory\.|WebClient|\.Result\b|SetGlobalVar|GetGlobalVar/u);
    expect(controller).not.toMatch(/Log(?:Info|Warn|Error)\([^;]*(?:token|clientId)/iu);
  });

  it('has a guided UI, safe default confirmation, and no public progress spam', async () => {
    const descriptor = JSON.parse(await readFile('addons/raid-scout/module-package.json', 'utf8')) as {
      permissions: string[];
      manifest: { eventSubscriptions: string[] };
    };
    const schema = JSON.parse(await readFile('addons/raid-scout/schemas/config.json', 'utf8')) as {
      properties: Record<string, { default?: unknown }>;
    };
    const ui = JSON.parse(await readFile('addons/raid-scout/ui/settings.json', 'utf8')) as {
      sections: Array<{ id: string }>;
    };
    const runtime = await readFile('addons/raid-scout/dist/index.js', 'utf8');
    expect(schema.properties['confirmationMode']?.default).toBe('required');
    expect(schema.properties['autoStartSceneEnabled']?.default).toBe(false);
    expect(schema.properties['showSuggestionCard']?.default).toBe(true);
    expect(schema.properties['showSearchProgress']?.default).toBe(true);
    expect(schema.properties['previewClipBeforeRaid']?.default).toBe(false);
    expect(schema.properties['pauseOtherVideoOverlays']?.default).toBe(true);
    expect(schema.properties['viewerSuggestionsEnabled']?.default).toBe(false);
    expect(schema.properties['maximumViewerSuggestions']?.default).toBe(20);
    expect(schema.properties['endBroadcastAfterRaid']?.default).toBe(false);
    expect(schema.properties['endBroadcastAcknowledged']?.default).toBe(false);
    expect(ui.sections.map((section) => section.id)).toEqual([
      'quick-start', 'discovery', 'preferred', 'limits', 'audience', 'language-category',
      'channels-history', 'legacy-audience', 'messages', 'overlay-content', 'clip-preview', 'broadcast-ending', 'overlay-style', 'maintenance',
    ]);
    expect(runtime).toContain('Starting a safe destination search');
    expect(runtime).toContain('NO SAFE MATCH');
    expect(runtime).toContain('thsv.raid-scout.media.play');
    expect(runtime).toContain('context.mediaSlot.acquire');
    expect(runtime).toContain('releaseRaidMediaSlot');
    expect(runtime).toContain('SEARCH TIMED OUT');
    expect(runtime).toContain('FINISH STREAM');
    expect(descriptor.permissions).toContain('media.exclusive');
    expect(descriptor.manifest.eventSubscriptions).toContain('stream.scene-changed');
    expect(runtime).not.toMatch(/innerHTML/u);
  });
});
