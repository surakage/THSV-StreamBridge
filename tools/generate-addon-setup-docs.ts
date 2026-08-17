import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  };
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
  const installSteps = integration === undefined ? [
    `1. Download and extract \`THSV-StreamBridge-AddOn-${safeName(descriptor.manifest.name)}-${descriptor.manifest.version}.zip\` from the same GitHub release as StreamBridge.`,
    `2. In **Setup Wizard > Add-ons**, install \`THSV-${safeName(descriptor.manifest.name)}-${descriptor.manifest.version}.thsv-addon\` and review its permissions.`,
    ...(imports.length === 0 ? ['3. No separate Streamer.bot import is required.'] : imports.map((name, position) => `${String(position + 3)}. Import \`Streamer.bot/${name}\` in Streamer.bot.`)),
    `${String(imports.length + 3)}. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.`,
  ] : [
    '1. This integration is installed and updated with THSV StreamBridge; do not install a separate `.thsv-addon`.',
    ...(imports.length === 0 ? [] : ['2. Select this integration when generating the one universal Streamer.bot import, then import that one `.sb` file.']),
    `${imports.length === 0 ? '2' : '3'}. Configure it from ${integration.management}, save, and restart StreamBridge when prompted.`,
  ];
  const lines = [
    `# ${descriptor.manifest.name} setup`,
    '',
    `**Module:** \`${descriptor.manifest.moduleId}\``,
    `**Version:** \`${descriptor.manifest.version}\``,
    `**Publisher:** ${descriptor.author}`,
    '',
    descriptor.description,
    '',
    integration === undefined ? '## Install' : '## Built-in setup',
    '',
    ...installSteps,
    '',
    '### Add-on-specific steps',
    '',
    ...numbered(descriptor.manifest.installationSteps),
    '',
    '## Streamer.bot',
    '',
    ...(actions.length === 0 ? ['This add-on uses normalized bridge events and does not install a Streamer.bot action package.'] : [
      `Minimum supported Streamer.bot version: \`${streamerBot?.minimumStreamerBotVersion ?? 'See package manifest'}\`.`,
      '',
      `Imported group${groups.length === 1 ? '' : 's'}: ${groups.map((group) => `\`${group}\``).join(', ')}`,
      '',
      ...actions.map((action) => `- \`${action.name}\`${action.group ? ` in \`${action.group}\`` : ''}`),
      '',
      streamerBot?.triggerSafety ?? 'Do not attach triggers to broker-dispatched worker actions unless this guide explicitly asks for one.',
      ...triggerInstructions(streamerBot?.manualTriggerSetup),
    ]),
    '',
    '## Browser source',
    '',
    integration?.browserSource ?? `When this add-on publishes visual output, use \`http://127.0.0.1:8787${overlayPath}\` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.`,
    '',
    '## Offline test',
    '',
    integration === undefined ? '1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.' : `1. Keep the bridge and Streamer.bot running, then open ${integration.management}.`,
    '2. Save the intended settings and use its preview, test, or manual control where available.',
    '3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.',
    '4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.',
    '',
    '### Health checks',
    '',
    ...(descriptor.manifest.healthChecks.length === 0 ? ['- No add-on-specific health check is declared.'] : descriptor.manifest.healthChecks.map((check) => `- **${check.id}:** ${check.description}`)),
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
      ? 'If setup drifts, inspect the main THSV intake actions in the wizard, verify the saved add-on command settings, restart StreamBridge, then rerun the offline test.'
      : 'If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.',
  ];
  await writeFile(join(outputRoot, `${folder.name}.md`), `${lines.join('\n')}\n`, 'utf8');
  index.push({ name: descriptor.manifest.name, moduleId: descriptor.manifest.moduleId, folder: folder.name, streamerBot: actions.length > 0, builtIn: integration !== undefined });
}

const indexLines = [
  '# Add-on setup guides', '',
  'These guides are generated from the same reviewed manifests used by the setup wizard and release packager. Always use an add-on bundle from the same release as the installed bridge.', '',
  '| Add-on | Module | Streamer.bot import |', '| --- | --- | --- |',
  ...index.map((entry) => `| [${entry.name}](./${entry.folder}.md) | \`${entry.moduleId}\` | ${entry.builtIn ? (entry.streamerBot ? 'Built in; select its action in the universal import' : 'Built in; no import required') : entry.streamerBot ? 'Included in add-on ZIP' : 'Not required'} |`),
];
await writeFile(join(outputRoot, 'README.md'), `${indexLines.join('\n')}\n`, 'utf8');
process.stdout.write(`Generated ${String(index.length)} add-on setup guides in docs/addons.\n`);

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
async function optionalJson<T>(path: string): Promise<T | undefined> { try { return await readJson<T>(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; } }
