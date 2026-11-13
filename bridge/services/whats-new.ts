import { readFile } from 'node:fs/promises';

export interface WhatsNew { readonly version: string; readonly items: readonly string[] }

/**
 * The CHANGELOG lines for one version, as plain sentences ("Added: ..." prefixes and Markdown removed), so the
 * Wizard can show what changed once after an update. A missing file or section gives an empty list.
 */
export async function whatsNew(version: string, changelogPath = 'CHANGELOG.md', limit = 8): Promise<WhatsNew> {
  const text = await readFile(changelogPath, 'utf8').catch(() => '');
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start < 0) return { version, items: [] };
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    const bullet = /^- (?:(?:Added|Changed|Fixed|Removed|Security):\s*)?(.+)$/u.exec(line.trim());
    if (bullet?.[1] === undefined) continue;
    const plain = bullet[1].replace(/\*\*(.+?)\*\*/gu, '$1').replace(/`([^`]+)`/gu, '$1').replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1').trim();
    if (plain !== '') items.push(plain.length > 400 ? `${plain.slice(0, 397)}…` : plain);
    if (items.length >= limit) break;
  }
  return { version, items };
}
