const HEADINGS: readonly (readonly [RegExp, string])[] = [
  [/^Added:?\s+/u, 'New'],
  [/^Changed:?\s+/u, 'Changed'],
  [/^Fixed:?\s+/u, 'Fixed'],
  [/^Removed:?\s+/u, 'Removed'],
];

/** The bullet points listed under one version in CHANGELOG.md, without the leading "- ". */
export function changelogEntries(changelog: string, version: string): readonly string[] {
  const lines = changelog.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) return [];
  const entries: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (line.startsWith('- ')) entries.push(line.slice(2).trim());
    else if (line.trim() !== '' && entries.length > 0) entries[entries.length - 1] = `${entries[entries.length - 1] ?? ''} ${line.trim()}`;
  }
  return entries;
}

/** Release text for one version, grouped into New, Changed, Fixed and Removed. Undefined when the version has no entries. */
export function releaseNotesFromChangelog(changelog: string, version: string): string | undefined {
  const entries = changelogEntries(changelog, version);
  if (entries.length === 0) return undefined;
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    const match = HEADINGS.find(([pattern]) => pattern.test(entry));
    const heading = match?.[1] ?? 'Also in this update';
    const text = match === undefined ? entry : entry.replace(match[0], '');
    const sentence = text.charAt(0).toUpperCase() + text.slice(1);
    groups.set(heading, [...(groups.get(heading) ?? []), sentence]);
  }
  const order = [...HEADINGS.map(([, heading]) => heading), 'Also in this update'];
  const sections = order.filter((heading) => groups.has(heading))
    .map((heading) => `## ${heading}\n\n${(groups.get(heading) ?? []).map((entry) => `- ${entry}`).join('\n')}`);
  return `# THSV StreamBridge ${version}\n\n${sections.join('\n\n')}\n\n## How to update\n\nOpen the Wizard, press Check for updates and then Update now. Your settings and extensions are kept, and it never installs while you are live.\n`;
}
