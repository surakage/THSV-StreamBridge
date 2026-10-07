import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './atomic-state.js';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown): string => typeof value === 'string' ? value.slice(0, 100) : '';
const number = (value: unknown): number => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/u;
const fields: Readonly<Record<string, string>> = { 'thsv.first-five': 'leaderboardMonth', 'thsv.fan-crown': 'seasonMonth', 'thsv.village-roll-call': 'month', 'thsv.lurk-tracker': 'month', 'thsv.chat-play-pack': 'month' };

export function trackerMonth(moduleId: string, value: unknown): string | undefined {
  const state = record(value);
  const month = moduleId === 'thsv.community-analytics' ? record(state['season'])['id'] : state[fields[moduleId] ?? ''];
  return typeof month === 'string' && MONTH.test(month) ? month : undefined;
}

/** Only participation fields cross into reports. Tokens, chat text, pending actions and user IDs never do. */
export function summarizeTracker(moduleId: string, value: unknown): RecordValue {
  const state = record(value);
  const entries = (Array.isArray(state['entries']) ? state['entries'] : Array.isArray(state['leaderboard']) ? state['leaderboard'] : []).map(record);
  const names = (keys: readonly string[]) => entries.slice(0, 10).map(entry => Object.fromEntries<string | number>([['name', text(entry['displayName'])], ...keys.map((key): [string, number] => [key, number(entry[key])])]));
  if (moduleId === 'thsv.first-five') return { participants: entries.length, claims: entries.reduce((total, entry) => total + (Array.isArray(entry['placements']) ? entry['placements'].reduce((sum: number, count: unknown) => sum + number(count), 0) : 0), 0), leaders: names(['points']) };
  if (moduleId === 'thsv.fan-crown') return { participants: entries.length, captures: entries.reduce((total, entry) => total + number(entry['captures']), 0), leaders: names(['totalSpent', 'captures', 'totalReignSeconds']) };
  if (moduleId === 'thsv.village-roll-call') return { participants: entries.length, checkIns: entries.reduce((total, entry) => total + number(entry['count']), 0), leaders: names(['count']) };
  if (moduleId === 'thsv.lurk-tracker') return { participants: entries.length, lurks: entries.reduce((total, entry) => total + number(entry['visits']), 0), seconds: entries.reduce((total, entry) => total + number(entry['seconds']), 0), leaders: names(['visits', 'seconds']) };
  if (moduleId === 'thsv.chat-play-pack') return { completedRounds: number(state['monthlyRounds']) };
  if (moduleId === 'thsv.community-analytics') {
    const viewers = Object.values(record(record(state['season'])['viewers'])).map(record);
    return { participants: viewers.length, messages: viewers.reduce((total, entry) => total + number(entry['messages']), 0), commands: viewers.reduce((total, entry) => total + number(entry['commands']), 0), attendance: viewers.reduce((total, entry) => total + number(entry['sessions']), 0) };
  }
  return {};
}

export async function archiveTrackerRollover(root: string, moduleId: string, previous: unknown, next: unknown): Promise<boolean> {
  const month = trackerMonth(moduleId, previous), nextMonth = trackerMonth(moduleId, next);
  if (!month || !nextMonth || nextMonth <= month) return false;
  // Called before replacing the private state. A failed archive leaves the old scores recoverable.
  await writeJsonAtomic(join(root, month, moduleId + '.json'), { moduleId, month, generatedAt: new Date().toISOString(), summary: summarizeTracker(moduleId, previous) });
  return true;
}

export async function readMonthlyTrackerReports(root: string): Promise<readonly RecordValue[]> {
  let months: string[];
  try { months = (await readdir(root)).filter(month => MONTH.test(month)).sort().reverse().slice(0, 12); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  return Promise.all(months.map(async month => {
    const trackers = [];
    for (const moduleId of [...Object.keys(fields), 'thsv.community-analytics']) {
      try {
        const source = await readFile(join(root, month, moduleId + '.json'), 'utf8');
        if (Buffer.byteLength(source) > 32_768) continue;
        const report = record(JSON.parse(source) as unknown);
        if (report['moduleId'] === moduleId && report['month'] === month) trackers.push(report);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return { month, trackers, notice: 'Observed monthly participation. Monthly rankings restart; points, identities, lifetime totals and active stream state are preserved.' };
  }));
}
