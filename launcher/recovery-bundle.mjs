import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const PRODUCT = 'THSV StreamBridge Recovery Bundle';
const AAD = Buffer.from('THSV StreamBridge recovery bundle v1', 'utf8');
const MAX_FILES = 5_000;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const ROOTS = Object.freeze(['data/configuration', 'data/state', 'data/secrets', 'addons/packages', 'addons/state']);
const TRANSFER_ROOTS = Object.freeze(['data/configuration', 'data/state', 'addons/packages', 'addons/state']);
const TRANSFER_SECRET_PATH = /(?:^|\/)(?:secrets?|credentials?|vault|private)(?:\/|[-_.])/iu;
const TRANSFER_SENSITIVE_KEY = /token|password|secret|cookie|authorization|credential|webhookUrl|apiKey/iu;

export async function exportRecoveryBundle({ installRoot, passphrase, outputPath, overwrite = false }) {
  validatePassphrase(passphrase);
  const root = resolve(installRoot);
  const payload = await collectPayload(root, ROOTS, false);
  const plaintext = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = {
    product: PRODUCT,
    schemaVersion: 1,
    createdAt: payload.createdAt,
    cipher: { name: 'aes-256-gcm', iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') },
    kdf: { name: 'scrypt', salt: salt.toString('base64'), cost: 32768, blockSize: 8, parallelization: 1 },
    summary: { fileCount: payload.files.length, plaintextBytes: plaintext.length, plaintextSha256: sha256(plaintext) },
    ciphertext: ciphertext.toString('base64'),
  };
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: 'utf8', flag: overwrite ? 'w' : 'wx', mode: 0o600 });
  await verifyRecoveryBundle({ bundlePath: output, passphrase });
  return { outputPath: output, fileCount: payload.files.length, plaintextBytes: plaintext.length, encrypted: true, verified: true };
}

export async function exportTransferBundle({ installRoot, passphrase, outputPath, overwrite = false }) {
  validatePassphrase(passphrase);
  const root = resolve(installRoot);
  const payload = { ...await collectPayload(root, TRANSFER_ROOTS, true), portableTransfer: true, credentialsRequired: true };
  const plaintext = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
  const salt = randomBytes(16); const iv = randomBytes(12); const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = { product: PRODUCT, schemaVersion: 1, createdAt: payload.createdAt, portableTransfer: true, cipher: { name: 'aes-256-gcm', iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') }, kdf: { name: 'scrypt', salt: salt.toString('base64'), cost: 32768, blockSize: 8, parallelization: 1 }, summary: { fileCount: payload.files.length, plaintextBytes: plaintext.length, plaintextSha256: sha256(plaintext), credentialsRequired: true }, ciphertext: ciphertext.toString('base64') };
  const output = resolve(outputPath); await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: 'utf8', flag: overwrite ? 'w' : 'wx', mode: 0o600 });
  await verifyTransferBundle({ bundlePath: output, passphrase });
  return { outputPath: output, fileCount: payload.files.length, plaintextBytes: plaintext.length, encrypted: true, verified: true, portableTransfer: true, credentialsRequired: true };
}

export async function previewTransferBundle({ installRoot }) {
  const payload = await collectPayload(resolve(installRoot), TRANSFER_ROOTS, true);
  return {
    portableTransfer: true,
    credentialsRequired: true,
    roots: payload.roots,
    fileCount: payload.files.length,
    totalBytes: payload.files.reduce((sum, file) => sum + file.size, 0),
    redactedFields: payload.transferSummary?.redactedFields ?? 0,
    omittedFiles: payload.transferSummary?.omittedFiles ?? 0,
    omittedCategories: ['credentials', 'secrets', 'private data', 'vaults'],
    files: payload.files.map((file) => ({ path: file.path, size: file.size })),
  };
}

export async function verifyTransferBundle({ bundlePath, passphrase }) {
  const result = await verifyRecoveryBundle({ bundlePath, passphrase });
  if (result.portableTransfer !== true) throw new Error('Choose a THSV move-computer bundle, not a full recovery bundle.');
  return result;
}

export async function restoreTransferBundle(options) {
  await verifyTransferBundle({ bundlePath: options.bundlePath, passphrase: options.passphrase });
  const result = await restoreRecoveryBundle(options);
  return { ...result, portableTransfer: true, credentialsRequired: true, nextStep: 'Open the Setup Wizard and re-enter Streamer.bot, broadcast-app, provider, and webhook credentials.' };
}

export async function verifyRecoveryBundle({ bundlePath, passphrase }) {
  validatePassphrase(passphrase);
  const payload = await decryptBundle(await readFile(resolve(bundlePath)), passphrase);
  return { valid: true, createdAt: payload.createdAt, fileCount: payload.files.length, totalBytes: payload.files.reduce((sum, file) => sum + file.size, 0), roots: payload.roots, portableTransfer: payload.portableTransfer === true, credentialsRequired: payload.credentialsRequired === true };
}

export async function restoreRecoveryBundle({ installRoot, bundlePath, passphrase, approvedByCreator = false }) {
  if (!approvedByCreator) throw new Error('Restore requires explicit creator approval.');
  validatePassphrase(passphrase);
  const root = resolve(installRoot);
  const payload = await decryptBundle(await readFile(resolve(bundlePath)), passphrase);
  const identifier = randomUUID();
  const stageRoot = join(root, `.thsv-recovery-stage-${identifier}`);
  const rollbackRoot = join(root, `.thsv-recovery-rollback-${identifier}`);
  const recoveryKeyPath = join(root, 'THSV StreamBridge Recovery Key.txt');
  const originalRecoveryKey = await readFileIfPresent(recoveryKeyPath);
  const moved = [];
  try {
    for (const bundleRoot of payload.roots) await mkdir(safeBundlePath(stageRoot, bundleRoot), { recursive: true });
    for (const file of payload.files) {
      const target = safeBundlePath(stageRoot, file.path);
      await mkdir(dirname(target), { recursive: true });
      const content = Buffer.from(file.content, 'base64');
      if (content.length !== file.size || sha256(content) !== file.sha256) throw new Error(`Recovery file failed integrity validation: ${file.path}`);
      await writeFile(target, content, { mode: file.path === 'data/secrets/control-token' ? 0o600 : 0o640 });
    }
    for (const bundleRoot of payload.roots) {
      const target = safeBundlePath(root, bundleRoot);
      const staged = safeBundlePath(stageRoot, bundleRoot);
      const saved = safeBundlePath(rollbackRoot, bundleRoot);
      await mkdir(dirname(target), { recursive: true });
      await mkdir(dirname(saved), { recursive: true });
      if (await exists(target)) { await rename(target, saved); moved.push({ target, saved }); }
      await rename(staged, target);
      moved.push({ target, saved: undefined });
    }
    await refreshRecoveryKey(root);
    const evidencePath = join(root, 'data', 'backups', 'recovery-restore-latest.json');
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify({ schemaVersion: 1, product: PRODUCT, restoredAt: new Date().toISOString(), bundleCreatedAt: payload.createdAt, fileCount: payload.files.length, roots: payload.roots }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rm(rollbackRoot, { recursive: true, force: true }).catch(() => undefined);
    return { restored: true, fileCount: payload.files.length, roots: payload.roots, evidencePath };
  } catch (error) {
    for (const operation of moved.reverse()) {
      if (operation.saved === undefined) await rm(operation.target, { recursive: true, force: true });
      else if (await exists(operation.saved)) { await rm(operation.target, { recursive: true, force: true }); await rename(operation.saved, operation.target); }
    }
    if (originalRecoveryKey === undefined) await rm(recoveryKeyPath, { force: true });
    else await writeFile(recoveryKeyPath, originalRecoveryKey, { mode: 0o600 });
    throw error;
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
    await rm(rollbackRoot, { recursive: true, force: true });
  }
}

async function collectPayload(installRoot, selectedRoots = ROOTS, portableTransfer = false) {
  const files = [];
  const roots = [];
  let totalBytes = 0;
  let redactedFields = 0;
  let omittedFiles = 0;
  for (const bundleRoot of selectedRoots) {
    const absoluteRoot = safeBundlePath(installRoot, bundleRoot);
    if (!await exists(absoluteRoot)) continue;
    roots.push(bundleRoot);
    const pending = [absoluteRoot];
    while (pending.length > 0) {
      const directory = pending.pop();
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Recovery bundles do not follow symbolic links: ${relative(installRoot, absolute)}`);
        if (entry.isDirectory()) { pending.push(absolute); continue; }
        if (!entry.isFile()) throw new Error(`Unsupported recovery entry: ${relative(installRoot, absolute)}`);
        const info = await lstat(absolute);
        if (info.size > MAX_FILE_BYTES) throw new Error(`Recovery file exceeds the 16 MiB limit: ${relative(installRoot, absolute)}`);
        totalBytes += info.size;
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Recovery bundle exceeds the 128 MiB plaintext limit.');
        if (files.length >= MAX_FILES) throw new Error('Recovery bundle exceeds the 5,000-file limit.');
        const normalizedPath = normalizeBundlePath(relative(installRoot, absolute));
        if (portableTransfer && TRANSFER_SECRET_PATH.test(normalizedPath)) { omittedFiles += 1; continue; }
        let content = await readFile(absolute);
        if (portableTransfer && normalizedPath.endsWith('.json')) {
          const redacted = redactTransferJsonWithSummary(JSON.parse(content.toString('utf8').replace(/^\uFEFF/u, '')));
          redactedFields += redacted.redactedFields;
          content = Buffer.from(`${JSON.stringify(redacted.value, null, 2)}\n`, 'utf8');
        }
        files.push({ path: normalizedPath, size: content.length, sha256: sha256(content), content: content.toString('base64') });
      }
    }
  }
  if (roots.length === 0) throw new Error('No persistent StreamBridge creator data was found.');
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { product: PRODUCT, schemaVersion: 1, createdAt: new Date().toISOString(), roots, files, ...(portableTransfer ? { transferSummary: { redactedFields, omittedFiles } } : {}) };
}

function redactTransferJsonWithSummary(value) {
  let redactedFields = 0;
  const visit = (current, key = '') => {
    if (typeof current === 'string' && /(?:File|Env)$/u.test(key)) return current;
    if (TRANSFER_SENSITIVE_KEY.test(key)) { redactedFields += 1; return undefined; }
    if (Array.isArray(current)) return current.map((item) => visit(item)).filter((item) => item !== undefined);
    if (current !== null && typeof current === 'object') return Object.fromEntries(Object.entries(current).map(([childKey, childValue]) => [childKey, visit(childValue, childKey)]).filter(([, childValue]) => childValue !== undefined));
    return current;
  };
  return { value: visit(value), redactedFields };
}

async function decryptBundle(input, passphrase) {
  let envelope;
  try { envelope = JSON.parse(input.toString('utf8')); } catch { throw new Error('Recovery bundle is not valid JSON.'); }
  if (envelope?.product !== PRODUCT || envelope?.schemaVersion !== 1 || envelope?.cipher?.name !== 'aes-256-gcm' || envelope?.kdf?.name !== 'scrypt') throw new Error('Recovery bundle identity is invalid.');
  try {
    const salt = strictBase64(envelope.kdf.salt, 16, 'salt');
    const iv = strictBase64(envelope.cipher.iv, 12, 'initialization vector');
    const authTag = strictBase64(envelope.cipher.authTag, 16, 'authentication tag');
    const ciphertext = strictBase64(envelope.ciphertext, undefined, 'ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (plaintext.length !== envelope.summary?.plaintextBytes || sha256(plaintext) !== envelope.summary?.plaintextSha256) throw new Error('Recovery plaintext integrity summary does not match.');
    const payload = JSON.parse(plaintext.toString('utf8'));
    validatePayload(payload);
    return payload;
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('Recovery ') || error.message.startsWith('Unsafe '))) throw error;
    throw new Error('Recovery bundle authentication failed. Check the passphrase and bundle integrity.', { cause: error });
  }
}

function validatePayload(payload) {
  if (payload?.product !== PRODUCT || payload?.schemaVersion !== 1 || !Array.isArray(payload.roots) || !Array.isArray(payload.files)) throw new Error('Recovery payload identity is invalid.');
  if (payload.files.length > MAX_FILES || payload.roots.length === 0 || payload.roots.some((root) => !ROOTS.includes(root)) || (payload.portableTransfer === true && payload.roots.includes('data/secrets'))) throw new Error('Recovery payload scope is invalid.');
  const roots = new Set(payload.roots);
  const paths = new Set();
  let totalBytes = 0;
  for (const file of payload.files) {
    if (typeof file?.path !== 'string' || typeof file?.content !== 'string' || !Number.isSafeInteger(file?.size) || file.size < 0 || file.size > MAX_FILE_BYTES || !/^[a-f0-9]{64}$/u.test(file?.sha256)) throw new Error('Recovery payload contains an invalid file record.');
    const normalized = normalizeBundlePath(file.path);
    if (normalized !== file.path || paths.has(normalized) || ![...roots].some((root) => normalized.startsWith(`${root}/`))) throw new Error(`Unsafe recovery path: ${file.path}`);
    paths.add(normalized);
    totalBytes += file.size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Recovery payload exceeds the 128 MiB plaintext limit.');
  }
}

async function refreshRecoveryKey(installRoot) {
  const tokenPath = join(installRoot, 'data', 'secrets', 'control-token');
  if (!await exists(tokenPath)) return;
  const token = (await readFile(tokenPath, 'utf8')).trim();
  if (!token) throw new Error('Restored control token is empty.');
  const keyPath = join(installRoot, 'THSV StreamBridge Recovery Key.txt');
  const content = [`${PRODUCT.replace(' Bundle', '')} key`, '', `Control token: ${token}`, '', `Installed folder: ${installRoot}`, '', 'Keep this file private. Anyone with this token and access to your Windows session could change StreamBridge settings.', ''].join('\n');
  await writeFile(keyPath, content, { encoding: 'utf8', mode: 0o600 });
}

function deriveKey(passphrase, salt) { return scryptSync(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function normalizeBundlePath(value) { return value.replaceAll('\\', '/').replace(/^\.\//u, ''); }
function validatePassphrase(value) { if (typeof value !== 'string' || value.length < 12 || value.length > 512) throw new Error('Recovery passphrase must contain 12 to 512 characters.'); }
function strictBase64(value, expectedBytes, label) { if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) throw new Error(`Recovery ${label} is invalid.`); const result = Buffer.from(value, 'base64'); if (expectedBytes !== undefined && result.length !== expectedBytes) throw new Error(`Recovery ${label} has an invalid length.`); return result; }
function safeBundlePath(root, bundlePath) { const normalized = normalizeBundlePath(bundlePath); if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) throw new Error(`Unsafe recovery path: ${bundlePath}`); const result = resolve(root, ...normalized.split('/')); const prefix = resolve(root) + sep; if (!result.startsWith(prefix)) throw new Error(`Unsafe recovery path: ${bundlePath}`); return result; }
async function exists(path) { try { await lstat(path); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; } }
async function readFileIfPresent(path) { try { return await readFile(path); } catch (error) { if (error?.code === 'ENOENT') return undefined; throw error; } }

async function main() {
  const [command, ...values] = process.argv.slice(2);
  const options = parseArguments(values);
  if (command === 'transfer-preview') {
    process.stdout.write(`${JSON.stringify(await previewTransferBundle({ installRoot: required(options, 'install-root') }))}\n`);
    return;
  }
  const passphraseName = options.get('passphrase-env') || 'THSV_RECOVERY_PASSPHRASE';
  const passphrase = process.env[passphraseName];
  if (!passphrase) throw new Error(`Set the ${passphraseName} environment variable to the recovery passphrase.`);
  let result;
  if (command === 'export') result = await exportRecoveryBundle({ installRoot: required(options, 'install-root'), outputPath: required(options, 'output'), passphrase, overwrite: options.has('overwrite') });
  else if (command === 'transfer-export') result = await exportTransferBundle({ installRoot: required(options, 'install-root'), outputPath: required(options, 'output'), passphrase, overwrite: options.has('overwrite') });
  else if (command === 'transfer-verify') result = await verifyTransferBundle({ bundlePath: required(options, 'bundle'), passphrase });
  else if (command === 'transfer-restore') result = await restoreTransferBundle({ installRoot: required(options, 'install-root'), bundlePath: required(options, 'bundle'), passphrase, approvedByCreator: options.has('approve') });
  else if (command === 'verify') result = await verifyRecoveryBundle({ bundlePath: required(options, 'bundle'), passphrase });
  else if (command === 'restore') result = await restoreRecoveryBundle({ installRoot: required(options, 'install-root'), bundlePath: required(options, 'bundle'), passphrase, approvedByCreator: options.has('approve') });
  else throw new Error('Usage: recovery-bundle.mjs <export|verify|restore|transfer-preview|transfer-export|transfer-verify|transfer-restore> [options]. Passphrases are accepted only through --passphrase-env.');
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function parseArguments(values) { const result = new Map(); for (let index = 0; index < values.length; index += 1) { const key = values[index]; if (!key?.startsWith('--')) throw new Error(`Unexpected argument: ${key ?? ''}`); if (key === '--approve' || key === '--overwrite') { result.set(key.slice(2), 'true'); continue; } const value = values[++index]; if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}.`); result.set(key.slice(2), value); } return result; }
function required(options, name) { const value = options.get(name); if (!value) throw new Error(`--${name} is required.`); return value; }

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
