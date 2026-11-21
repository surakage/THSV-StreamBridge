import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** What OBS's own WebSocket server settings say, read from OBS's config file on this PC. */
export interface ObsWebSocketSettings {
  readonly enabled: boolean;
  readonly port: number;
  readonly authRequired: boolean;
  readonly password: string;
}

/** OBS 28 and newer keep the built-in WebSocket server's settings here (per Windows user). */
export function obsWebSocketConfigPath(appData: string | undefined = process.env['APPDATA']): string | undefined {
  return appData === undefined || appData === '' ? undefined : join(appData, 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json');
}

/**
 * Reads OBS's WebSocket port and password so a creator never has to copy them by hand.
 * Undefined when OBS was never opened on this PC, or the file is unreadable.
 */
export function readObsWebSocketSettings(path: string | undefined = obsWebSocketConfigPath()): ObsWebSocketSettings | undefined {
  if (path === undefined) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')); } catch { return undefined; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const value = parsed as Record<string, unknown>;
  const port = typeof value['server_port'] === 'number' && Number.isInteger(value['server_port']) && value['server_port'] > 0 && value['server_port'] < 65_536 ? value['server_port'] : 4455;
  const password = typeof value['server_password'] === 'string' ? value['server_password'].slice(0, 512) : '';
  return { enabled: value['server_enabled'] === true, port, authRequired: value['auth_required'] !== false && password !== '', password };
}

/** OBS closes the socket with 4009 when the password is wrong. */
export const OBS_WRONG_PASSWORD = 'OBS turned down the password. Leave the password box empty so StreamBridge reads it from OBS, or copy it again in OBS under Tools › WebSocket Server Settings › Show Connect Info.';
export const OBS_PASSWORD_NEEDED = 'OBS asks for a password. Leave the password box empty so StreamBridge reads it from OBS, or copy it in OBS under Tools › WebSocket Server Settings › Show Connect Info.';
export const OBS_SERVER_OFF = 'OBS\'s WebSocket server is switched off. In OBS open Tools › WebSocket Server Settings, tick Enable WebSocket server, press OK, then try again.';
