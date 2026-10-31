import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MAIN_FEATURE_FAMILIES } from '../bridge/core/main-feature-registry.js';

interface AddOnDescriptor {
  author: string;
  description: string;
  packageKind: string;
  permissions: string[];
  manifest: {
    moduleId: string;
    name: string;
    version: string;
    dependencies: string[];
    eventSubscriptions: string[];
    dataStorageOwned: string[];
    installationSteps: string[];
    uninstallationSteps: string[];
    healthChecks: Array<{ id: string; description: string }>;
    commandsProvided?: Array<{ id: string; name: string }>;
  };
}

interface SettingsProperty {
  title?: string;
  description?: string;
  type?: string | string[];
  default?: unknown;
}

interface SettingsSchema {
  properties?: Record<string, SettingsProperty>;
}

interface StreamerBotAction {
  name: string;
  group?: string;
  importFile?: string;
}

interface StreamerBotManifest {
  minimumStreamerBotVersion?: string;
  action?: StreamerBotAction;
  actions?: StreamerBotAction[];
  manualTriggerSetup?: unknown;
  triggerSafety?: string;
}

const root = process.cwd();
const addOnsRoot = join(root, 'addons');
const outputRoot = join(root, 'docs', 'addons');
const builtInIntegrations = new Map<string, { readonly management: string; readonly browserSource: string }>([
  ['thsv.viewer-foundation', { management: 'its dedicated **Viewer Foundation** wizard page', browserSource: 'Viewer Foundation has no browser source. Features request only its bounded private projections.' }],
  ['thsv.community-analytics', { management: 'its dedicated **Community Analytics** wizard page', browserSource: 'Community Analytics has no browser source. Its private reports remain in the authenticated local wizard.' }],
  ['thsv.kofi-donations', { management: '**Alerts > Donation provider setup**', browserSource: 'Ko-fi donations use the main alert overlay at `http://127.0.0.1:8787/overlay/alerts`; no provider-specific browser source is needed.' }],
]);
const bundledExtensions = new Map(MAIN_FEATURE_FAMILIES.flatMap((family) => family.modules.map((moduleId) => [moduleId, family.name] as const)));
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const index: Array<{ name: string; moduleId: string; folder: string; streamerBot: boolean; builtIn: boolean }> = [];
for (const folder of (await readdir(addOnsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const descriptor = await readJson<AddOnDescriptor>(join(addOnsRoot, folder.name, 'module-package.json'));
  const streamerBotPath = join(root, 'packages', 'streamerbot', folder.name, 'manifest.json');
  const streamerBot = await optionalJson<StreamerBotManifest>(streamerBotPath);
  const actions = streamerBot === undefined ? [] : streamerBot.actions ?? (streamerBot.action === undefined ? [] : [streamerBot.action]);
  const imports = [...new Set(actions.map((action) => action.importFile).filter((value): value is string => typeof value === 'string'))];
  const groups = [...new Set(actions.map((action) => action.group).filter((value): value is string => typeof value === 'string'))];
  const overlayPath = `/overlay/addons/${descriptor.manifest.moduleId}`;
  const integration = builtInIntegrations.get(descriptor.manifest.moduleId);
  const extensionFamily = bundledExtensions.get(descriptor.manifest.moduleId);
  const builtIn = integration !== undefined || extensionFamily !== undefined;
  const featureKind = extensionFamily !== undefined ? 'extension' : integration !== undefined ? 'integration' : 'add-on';
  const management = integration?.management ?? (extensionFamily === undefined ? 'the **Add-ons** page' : `the **Extensions > ${extensionFamily}** component catalogue`);
  const installSteps = numberedSteps(!builtIn ? [
    `Download and extract \`THSV-StreamBridge-AddOn-${safeName(descriptor.manifest.name)}-${descriptor.manifest.version}.zip\` from the same GitHub release as StreamBridge.`,
    `In **Setup Wizard > Add-ons**, install \`THSV-${safeName(descriptor.manifest.name)}-${descriptor.manifest.version}.thsv-addon\` and review its permissions.`,
    ...imports.map((name) => `Import \`Streamer.bot/${name}\` in Streamer.bot.`),
    'Return to the wizard, configure the extension, approve only the actions it needs, enable it, and restart StreamBridge when prompted.',
  ] : [
    `This ${featureKind} ships with THSV StreamBridge and updates with it; there is nothing separate to download.`,
    ...(imports.length === 0 ? [] : [`In **Setup Wizard > Streamer.bot**, include this ${featureKind} in the one Streamer.bot import, then import that \`.sb\` file in Streamer.bot.`]),
    `Configure it from ${management}, save, and restart StreamBridge when prompted.`,
  ]);
  const readme = await optionalText(join(addOnsRoot, folder.name, 'README.md'));
  const guide = readme === undefined ? [] : readmeBody(readme);
  const settingsSchema = await optionalJson<SettingsSchema>(join(addOnsRoot, folder.name, 'schemas', 'config.json'));
  const commands = descriptor.manifest.commandsProvided ?? [];
  const lines = [
    `# ${descriptor.manifest.name}`,
    '',
    `**Module:** \`${descriptor.manifest.moduleId}\` · **Version:** \`${descriptor.manifest.version}\` · **${builtIn ? `Built in (${featureKind})` : 'Separate download'}**`,
    '',
    descriptor.description,
    '',
    ...(guide.length === 0 ? [] : [...guide, '']),
    builtIn ? '## Where to find it' : '## Install',
    '',
    ...installSteps,
    '',
    ...(guide.length === 0 ? ['### Setup checklist', '', ...numbered(descriptor.manifest.installationSteps), ''] : []),
    ...(guide.length === 0 && commands.length > 0 ? ['## Chat commands', '', `Default command names: ${commands.map((command) => `\`!${command.name}\``).join(', ')}. You can rename them in the settings.`, ''] : []),
    '## Streamer.bot',
    '',
    ...(actions.length === 0 ? ['Nothing to import. This feature works from the chat and events StreamBridge already receives.'] : [
      `Minimum supported Streamer.bot version: \`${streamerBot?.minimumStreamerBotVersion ?? 'See package manifest'}\`.`,
      '',
      `Imported group${groups.length === 1 ? '' : 's'}: ${groups.map((group) => `\`${group}\``).join(', ')}`,
      '',
      ...actions.map((action) => `- \`${action.name}\`${action.group ? ` in \`${action.group}\`` : ''}`),
      '',
      streamerBot?.triggerSafety ?? 'Do not attach triggers to these actions unless this guide asks for one; StreamBridge runs them itself.',
      ...triggerInstructions(streamerBot?.manualTriggerSetup),
    ]),
    '',
    '## Browser source',
    '',
    integration?.browserSource ?? `If this ${featureKind} shows anything on stream, add a browser source with \`http://127.0.0.1:8787${overlayPath}\` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.`,
    '',
    ...settingsTable(settingsSchema),
    '## Health checks',
    '',
    ...(descriptor.manifest.healthChecks.length === 0 ? ['- No feature-specific health check is declared.'] : descriptor.manifest.healthChecks.map((check) => `- **${check.id}:** ${check.description}`)),
    '',
    '## Data and permissions',
    '',
    `Package kind: **${descriptor.packageKind}**. Requested permissions: ${descriptor.permissions.length === 0 ? 'none' : descriptor.permissions.map((value) => `\`${value}\``).join(', ')}.`,
    '',
    `Private storage: ${descriptor.manifest.dataStorageOwned.length === 0 ? 'none declared' : descriptor.manifest.dataStorageOwned.map((value) => `\`${value}\``).join(', ')}.`,
    '',
    `Dependencies: ${descriptor.manifest.dependencies.length === 0 ? 'none' : descriptor.manifest.dependencies.map((value) => `\`${value}\``).join(', ')}.`,
    '',
    '## Remove or repair',
    '',
    ...numbered(descriptor.manifest.uninstallationSteps),
    '',
    actions.length === 0
      ? 'If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.'
      : 'If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.',
  ];
  await writeFile(join(outputRoot, `${folder.name}.md`), `${lines.join('\n')}\n`, 'utf8');
  index.push({ name: descriptor.manifest.name, moduleId: descriptor.manifest.moduleId, folder: folder.name, streamerBot: actions.length > 0, builtIn });
}

const indexLines = [
  '# Extension setup guides', '',
  'One page per feature: what it does, what it needs, how to set it up, its chat commands and every setting. Built-in extensions ship with StreamBridge; download a separate add-on only where the table says so. For core setup (install, Streamer.bot, platforms, OBS, scene roles), start at the [feature guide](../guide/README.md).', '',
  'These pages are generated from each feature\'s README, settings schema and package manifest, so they stay in step with the wizard.', '',
  '| Feature | Module | Streamer.bot import |', '| --- | --- | --- |',
  ...index.map((entry) => `| [${entry.name}](./${entry.folder}.md) | \`${entry.moduleId}\` | ${entry.builtIn ? (entry.streamerBot ? 'Built in; select its action in the universal import' : 'Built in; no import required') : entry.streamerBot ? 'Included in add-on ZIP' : 'Not required'} |`),
];
await writeFile(join(outputRoot, 'README.md'), `${indexLines.join('\n')}\n`, 'utf8');
process.stdout.write(`Generated ${String(index.length)} add-on setup guides in docs/addons.\n`);

function numberedSteps(values: string[]): string[] { return values.map((value, index) => `${String(index + 1)}. ${value}`); }
function readmeBody(text: string): string[] {
  const lines = text.replace(/\r\n/gu, '\n').trim().split('\n');
  if (lines[0]?.startsWith('# ') === true) lines.shift();
  while (lines[0]?.trim() === '') lines.shift();
  return lines;
}
function settingsTable(schema: SettingsSchema | undefined): string[] {
  const entries = Object.entries(schema?.properties ?? {}).filter(([, property]) => typeof property.title === 'string');
  if (entries.length === 0) return [];
  return [
    '## Settings',
    '',
    'Change these in the wizard. Defaults are what a fresh install uses.',
    '',
    '| Setting | What it does | Default |',
    '| --- | --- | --- |',
    ...entries.map(([, property]) => `| ${cell(property.title ?? '')} | ${cell(property.description ?? '')} | ${cell(defaultText(property.default))} |`),
    '',
  ];
}
function defaultText(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'string') return value === '' ? '(blank)' : `\`${value}\``;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '(none)';
    if (value.every((item) => typeof item === 'string' || typeof item === 'number')) return value.map((item) => `\`${String(item)}\``).join(', ');
    return `${String(value.length)} preset${value.length === 1 ? '' : 's'}`;
  }
  return 'See wizard';
}
function cell(value: string): string { return value.replace(/\|/gu, '\\|').replace(/\s*\n\s*/gu, ' '); }
function numbered(values: string[]): string[] { return values.length === 0 ? ['1. No extra step is declared.'] : values.map((value, index) => `${String(index + 1)}. ${value}`); }
function safeName(value: string): string { return value.replace(/[^A-Za-z0-9]+/gu, '-').replace(/^-|-$/gu, ''); }
function triggerInstructions(value: unknown): string[] {
  if (Array.isArray(value)) {
    const entries = value.filter((step): step is string => typeof step === 'string').map((step) => `- ${step}`);
    return entries.length === 0 ? [] : ['', 'Creator-selected triggers:', '', ...entries];
  }
  if (typeof value !== 'object' || value === null) return [];
  const entries = Object.entries(value).flatMap(([key, raw]) => {
    const steps = Array.isArray(raw) ? raw.filter((step): step is string => typeof step === 'string') : (typeof raw === 'string' ? [raw] : []);
    return steps.map((step) => `- **${key}:** ${step}`);
  });
  return entries.length === 0 ? [] : ['', 'Creator-selected triggers:', '', ...entries];
}
async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')) as T; }
async function optionalText(path: string): Promise<string | undefined> { try { return await readFile(path, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; } }
async function optionalJson<T>(path: string): Promise<T | undefined> { try { return await readJson<T>(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; } }
