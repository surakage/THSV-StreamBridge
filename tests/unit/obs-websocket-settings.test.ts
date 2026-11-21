import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { obsWebSocketConfigPath, readObsWebSocketSettings } from '../../bridge/services/obs-websocket-settings.js';
import { plainConnectMessage } from '../../bridge/services/direct-scene-connection-manager.js';

function obsConfig(content: string): string {
  const appData = mkdtempSync(join(tmpdir(), 'obs-settings-'));
  const folder = join(appData, 'obs-studio', 'plugin_config', 'obs-websocket');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'config.json'), content, 'utf8');
  return appData;
}

describe('OBS WebSocket settings from OBS itself', () => {
  it('reads the port and password OBS saved, so creators never copy them', () => {
    const appData = obsConfig(JSON.stringify({ alerts_enabled: false, auth_required: true, first_load: false, server_enabled: true, server_password: 'abc123XYZ', server_port: 4466 }));
    expect(readObsWebSocketSettings(obsWebSocketConfigPath(appData))).toEqual({ enabled: true, port: 4466, authRequired: true, password: 'abc123XYZ' });
  });

  it('says when the server is off or has no password, and copes with a BOM', () => {
    const appData = obsConfig(`\uFEFF${JSON.stringify({ auth_required: false, server_enabled: false, server_password: '', server_port: 4455 })}`);
    expect(readObsWebSocketSettings(obsWebSocketConfigPath(appData))).toEqual({ enabled: false, port: 4455, authRequired: false, password: '' });
  });

  it('is undefined when OBS was never opened or the file is broken', () => {
    expect(readObsWebSocketSettings(join(tmpdir(), 'no-such-obs', 'config.json'))).toBeUndefined();
    expect(readObsWebSocketSettings(obsWebSocketConfigPath(obsConfig('{not json')))).toBeUndefined();
    expect(obsWebSocketConfigPath('')).toBeUndefined();
  });

  it('explains a refused OBS connection in plain words', () => {
    expect(plainConnectMessage('obs', 'ws://127.0.0.1:4455', 'connect ECONNREFUSED 127.0.0.1:4455')).toMatch(/^(OBS isn't answering at ws:\/\/127\.0\.0\.1:4455|OBS's WebSocket server is switched off)/u);
    expect(plainConnectMessage('obs', 'ws://127.0.0.1:4455', 'Something else')).toBe('Something else');
  });
});
