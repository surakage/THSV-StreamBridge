import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STREAMBRIDGE_VERSION } from '../../bridge/version.js';

interface AddOnDescriptor {
  manifest: {
    contractVersion: string;
    version: string;
    minimumCoreVersion: string;
    maximumTestedCoreVersion: string;
  };
}

interface StreamerBotManifest {
  version: string;
  action?: { importFile: string };
  actions?: Array<{ importFile: string }>;
}

describe('stable release version cohesion', () => {
  it('aligns every first-party product package while preserving the add-on API contract', async () => {
    const rootPackage = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
    const stableVersion = rootPackage.version;
    expect(STREAMBRIDGE_VERSION).toBe(stableVersion);

    const addOnFolders = (await readdir('addons', { withFileTypes: true })).filter((entry) => entry.isDirectory());
    for (const folder of addOnFolders) {
      const descriptor = JSON.parse(await readFile(join('addons', folder.name, 'module-package.json'), 'utf8')) as AddOnDescriptor;
      expect(descriptor.manifest.version, `${folder.name} add-on version`).toBe(stableVersion);
      expect(descriptor.manifest.minimumCoreVersion, `${folder.name} minimum API contract`).toBe(descriptor.manifest.contractVersion);
      expect(descriptor.manifest.maximumTestedCoreVersion, `${folder.name} tested API contract`).toBe(descriptor.manifest.contractVersion);
    }

    const packageFolders = (await readdir(join('packages', 'streamerbot'), { withFileTypes: true })).filter((entry) => entry.isDirectory());
    for (const folder of packageFolders) {
      const packageRoot = join('packages', 'streamerbot', folder.name);
      const manifest = JSON.parse(await readFile(join(packageRoot, 'manifest.json'), 'utf8')) as StreamerBotManifest;
      const imports = manifest.actions?.map((action) => action.importFile) ?? (manifest.action === undefined ? [] : [manifest.action.importFile]);
      const files = (await readdir(packageRoot)).filter((name) => name.endsWith('.sb'));

      expect(manifest.version, `${folder.name} Streamer.bot version`).toBe(stableVersion);
      expect(new Set(imports).size, `${folder.name} must use one import file`).toBe(1);
      expect(files, `${folder.name} must contain only its current generated import`).toEqual([...new Set(imports)]);
      expect(imports[0], `${folder.name} import filename`).toContain(`-${stableVersion}.sb`);
    }
  });
});
