import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { changelogEntries, releaseNotesFromChangelog } from '../../tools/release-notes.js';

const changelog = '# Changelog\n\n## [Unreleased]\n\n## [9.9.9] - 2030-01-01\n\n- Added: a new card.\n- Fixed: the card no longer blinks.\n- Changed: quieter logs.\n- Something else.\n\n## [9.9.8] - 2029-12-31\n\n- Fixed: older.\n';

describe('release notes', () => {
  it('reads only the entries of the asked version', () => {
    expect(changelogEntries(changelog, '9.9.9')).toEqual(['Added: a new card.', 'Fixed: the card no longer blinks.', 'Changed: quieter logs.', 'Something else.']);
    expect(changelogEntries(changelog, '1.0.0')).toEqual([]);
  });

  it('groups entries under plain headings', () => {
    const notes = releaseNotesFromChangelog(changelog, '9.9.9') ?? '';
    expect(notes).toContain('# THSV StreamBridge 9.9.9');
    expect(notes.indexOf('## New')).toBeLessThan(notes.indexOf('## Changed'));
    expect(notes.indexOf('## Changed')).toBeLessThan(notes.indexOf('## Fixed'));
    expect(notes).toContain('- A new card.');
    expect(notes).toContain('## Also in this update\n\n- Something else.');
    expect(notes).not.toContain('older');
    expect(releaseNotesFromChangelog(changelog, '1.0.0')).toBeUndefined();
  });

  it('has a notes file for the current version, matching the changelog', () => {
    const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
    const expected = releaseNotesFromChangelog(readFileSync('CHANGELOG.md', 'utf8'), version);
    if (expected === undefined) return;
    const path = `docs/releases/${version}.md`;
    expect(existsSync(path), `Run "npm run release:notes" to write ${path}`).toBe(true);
    expect(readFileSync(path, 'utf8').replace(/\r\n/gu, '\n')).toBe(expected);
  });
});
