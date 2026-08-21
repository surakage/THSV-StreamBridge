import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE_ACCEPTANCE_MODULES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  startup: ['./build-provenance-service', './config-loader', './atomic-state'],
  delivery: ['../core/durable-delivery-manager', '../core/outbound-message-router', './delivery-outbox-store'],
  overlay: ['../core/browser-overlay', './browser-overlay-hub', './obs-source-inventory-service'],
  persistence: ['./atomic-state', './deduplication-store', './delivery-outbox-store'],
});

export async function coreAcceptanceFingerprints(): Promise<Readonly<Record<string, string>>> {
  const directory = fileURLToPath(new URL('.', import.meta.url));
  const extension = extname(fileURLToPath(import.meta.url));
  const entries = await Promise.all(Object.entries(CORE_ACCEPTANCE_MODULES).map(async ([component, modules]) => {
    const hash = createHash('sha256');
    for (const module of [...modules].sort()) {
      const content = (await readFile(join(directory, `${module}${extension}`), 'utf8')).replaceAll('\r\n', '\n');
      hash.update(`${module}\0${content}\0`);
    }
    return [component, `sha256:${hash.digest('hex')}`] as const;
  }));
  return Object.freeze(Object.fromEntries(entries));
}
