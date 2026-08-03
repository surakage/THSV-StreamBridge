import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_IGNORED_BOT_NAMES } from '../schemas/config.js';

const installRoot = resolve(process.argv[2] ?? '.');
const scopedRules = ['twitch:nightbot', 'twitch:streamelements', 'youtube:streamelements', 'kick:streamelements', 'twitch:fossabot', 'twitch:moobot', 'twitch:sery_bot', 'twitch:soundalerts', 'twitch:wizebot', 'twitch:kofistreambot', 'twitch:streamlabs', 'twitch:botrix', 'youtube:botrix', 'kick:botrix', 'tiktok:botrix'];
const platformRules = scopedRules.map((rule) => rule.replace(':', '|name:'));

await merge(join(installRoot, 'data', 'configuration', 'bridge.local.json'), ['browserOverlay', 'chat', 'ignoredNames'], [...DEFAULT_IGNORED_BOT_NAMES]);
for (const [moduleId, key, values] of [
  ['thsv.automated-shoutouts', 'ignoredUsers', scopedRules],
  ['thsv.chat-guard', 'ignoredAccounts', platformRules],
  ['thsv.community-analytics', 'ignoredAccounts', platformRules],
  ['thsv.discord-chat-archive', 'ignoredUsers', scopedRules],
  ['thsv.quote-vault', 'ignoredUsers', scopedRules],
  ['thsv.user-translate', 'automaticIgnoredNames', [...DEFAULT_IGNORED_BOT_NAMES]],
  ['thsv.viewer-lobby', 'ignoredUsers', [...DEFAULT_IGNORED_BOT_NAMES]],
] as const) await merge(join(installRoot, 'addons', 'state', moduleId, 'settings.json'), [key], values);

async function merge(path: string, keys: readonly string[], defaults: readonly string[]): Promise<void> {
  let value: Record<string, unknown> = {};
  try { value = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  let target = value;
  for (const key of keys.slice(0, -1)) {
    const existing = target[key];
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) target[key] = {};
    target = target[key] as Record<string, unknown>;
  }
  const finalKey = keys.at(-1);
  if (finalKey === undefined) throw new Error('A settings key is required.');
  const existing = Array.isArray(target[finalKey]) ? target[finalKey].filter((item): item is string => typeof item === 'string') : [];
  const seen = new Set(existing.map((item) => item.toLowerCase()));
  target[finalKey] = [...existing, ...defaults.filter((item) => !seen.has(item.toLowerCase()))];
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, path);
  process.stdout.write(`Updated ${path}\n`);
}
