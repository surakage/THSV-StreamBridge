import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ACTION_USE_PATTERN = /^\s*(?:-\s*)?uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)(?:\s+#\s*(\S+))?\s*$/u;
const APPROVED_ACTION_PUBLISHERS = new Set(['actions']);
const DEFAULT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export async function collectPinnedActions(root) {
  const workflowRoot = resolve(root, '.github', 'workflows');
  const files = (await readdir(workflowRoot)).filter((name) => /\.ya?ml$/u.test(name)).sort();
  const pins = new Map();
  for (const file of files) {
    const source = await readFile(resolve(workflowRoot, file), 'utf8');
    for (const line of source.split(/\r?\n/u)) {
      const match = ACTION_USE_PATTERN.exec(line);
      if (!match) continue;
      const [, repository, sha, tag] = match;
      const publisher = repository.split('/')[0]?.toLowerCase();
      if (!publisher || !APPROVED_ACTION_PUBLISHERS.has(publisher)) throw new Error(`${file} uses ${repository}, whose publisher is not in the approved GitHub Action publisher allowlist.`);
      if (!/^[0-9a-f]{40}$/u.test(sha) || !/^v[^\s#]+$/u.test(tag ?? '')) throw new Error(`${file} contains ${repository}@${sha} without an immutable commit and documented upstream version tag.`);
      const key = `${repository}@${sha}#${tag}`;
      const entry = pins.get(key) ?? { repository, sha, tag, files: [] };
      entry.files.push(file);
      pins.set(key, entry);
    }
  }
  return [...pins.values()];
}

async function githubJson(path, fetcher, token) {
  const response = await fetcher(`https://api.github.com${path}`, { headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (!response.ok) {
    const error = new Error(`GitHub tag lookup failed (${response.status}) for ${path}.`);
    error.retryable = response.status === 403 || response.status === 429 || response.status >= 500;
    throw error;
  }
  return response.json();
}

export async function resolveTagCommit(repository, tag, fetcher = fetch, token = '') {
  let object = (await githubJson(`/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`, fetcher, token)).object;
  for (let depth = 0; object?.type === 'tag' && depth < 4; depth += 1) object = (await githubJson(`/repos/${repository}/git/tags/${object.sha}`, fetcher, token)).object;
  if (object?.type !== 'commit' || !/^[0-9a-f]{40}$/u.test(String(object.sha))) throw new Error(`${repository}@${tag} did not resolve to a commit.`);
  return object.sha;
}

async function loadCache(path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    return value?.schemaVersion === 1 && value.entries && typeof value.entries === 'object' ? value : { schemaVersion: 1, entries: {} };
  } catch { return { schemaVersion: 1, entries: {} }; }
}

async function saveCache(path, cache) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, path);
}

const delay = async (milliseconds) => await new Promise((done) => setTimeout(done, milliseconds));

export async function verifyPinnedActions({ root = process.cwd(), fetcher = fetch, token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '', cachePath = resolve(root, '.cache', 'action-tag-resolution-v1.json'), now = Date.now(), cacheMaxAgeMs = DEFAULT_CACHE_MAX_AGE_MS, retryDelaysMs = [250, 750] } = {}) {
  const pins = await collectPinnedActions(root);
  if (pins.length === 0) throw new Error('No tagged immutable GitHub Action pins were found.');
  const cache = await loadCache(cachePath);
  const results = [];
  let cacheChanged = false;
  for (const pin of pins) {
    const key = `${pin.repository}@${pin.tag}`;
    let resolvedSha;
    let source = 'live';
    let lastError;
    let fallbackAllowed = false;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      try { resolvedSha = await resolveTagCommit(pin.repository, pin.tag, fetcher, token); break; }
      catch (error) {
        lastError = error;
        fallbackAllowed = error?.retryable === true || error instanceof TypeError;
        if (!fallbackAllowed) break;
        if (attempt < retryDelaysMs.length) await delay(Math.max(0, Math.min(2_000, Number(retryDelaysMs[attempt]) || 0)));
      }
    }
    if (resolvedSha === undefined) {
      if (!fallbackAllowed) throw lastError;
      const cached = cache.entries[key];
      const verifiedAt = Date.parse(String(cached?.verifiedAt ?? ''));
      const ageMs = now - verifiedAt;
      if (!/^[0-9a-f]{40}$/u.test(String(cached?.sha ?? '')) || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > cacheMaxAgeMs) throw lastError;
      resolvedSha = cached.sha;
      source = 'verified-cache';
    } else {
      cache.entries[key] = { sha: resolvedSha, verifiedAt: new Date(now).toISOString() };
      cacheChanged = true;
    }
    if (resolvedSha !== pin.sha) throw new Error(`${pin.repository}@${pin.sha} is documented as ${pin.tag}, but that tag resolves to ${resolvedSha}.`);
    results.push({ ...pin, resolvedSha, resolutionSource: source, verified: true });
  }
  if (cacheChanged) await saveCache(cachePath, cache);
  return { schemaVersion: 2, checkedAt: new Date(now).toISOString(), approvedPublishers: [...APPROVED_ACTION_PUBLISHERS], cachedResolutions: results.filter((item) => item.resolutionSource === 'verified-cache').length, pins: results, verified: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyPinnedActions().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
