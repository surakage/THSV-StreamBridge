import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const installRoot = resolve(argument('--install-root') ?? join(process.env.LOCALAPPDATA ?? '', 'THSV StreamBridge'));
const configuration = await readJson(join(installRoot, 'data', 'configuration', 'bridge.local.json'));
const tokenFile = String(configuration?.security?.controlTokenFile ?? '');
if (tokenFile === '') throw new Error('Installed control-token path is unavailable.');
const token = (await readFile(isAbsolute(tokenFile) ? tokenFile : join(installRoot, tokenFile), 'utf8')).trim();
const port = Number(configuration?.service?.port ?? 8787);
const base = `http://127.0.0.1:${String(port)}`;
const acceptance = await request(`${base}/wizard/api/broadcast-connections/acceptance`, token, {});
const results = (acceptance.results ?? []).filter((result) => ['meld', 'streamlabs'].includes(result.provider)).map((result) => ({ ...result, fixtureRefreshEligible: result.outcome === 'passed', fixtureRefreshGuidance: result.outcome === 'passed' ? 'Installed-app protocol acceptance passed. Refresh only genericized protocol fixtures; never copy real scene names or credentials.' : 'Keep the existing sanitized replay fixture until installed-app acceptance passes.' }));
process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(), mutationFree: true, results }, null, 2)}\n`);
if (results.some((result) => ['failed', 'no-profile'].includes(result.outcome))) process.exitCode = 1;

function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function request(url, token, body) { const response = await fetch(url, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, signal: AbortSignal.timeout(10_000) }); const value = await response.json(); if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : `Acceptance request failed (${String(response.status)}).`); return value; }
