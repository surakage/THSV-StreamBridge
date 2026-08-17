import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_INTEGRATION_IDS, isBuiltInIntegrationModuleId } from '../../bridge/core/built-in-integrations.js';
import { verifyAddOnPackage } from '../../bridge/services/addon-package-manager.js';

describe('built-in integration consistency', () => {
  it('keeps runtime, installer, release packaging, docs, and wizard ownership aligned', async () => {
    expect(BUILT_IN_INTEGRATION_IDS).toEqual([
      'thsv.viewer-foundation',
      'thsv.community-analytics',
      'thsv.kofi-donations',
    ]);
    expect(isBuiltInIntegrationModuleId('thsv.viewer-foundation')).toBe(true);
    expect(isBuiltInIntegrationModuleId('thsv.random-clip-player')).toBe(false);

    const [installer, packager, docsGenerator, installedModules, wizardService] = await Promise.all([
      readFile('installer/install.mjs', 'utf8'),
      readFile('scripts/package-release.ps1', 'utf8'),
      readFile('tools/generate-addon-setup-docs.ts', 'utf8'),
      readFile('bridge/core/installed-modules.ts', 'utf8'),
      readFile('bridge/services/addon-wizard-service.ts', 'utf8'),
    ]);

    expect(installedModules).toContain('isBuiltInIntegrationModuleId(verified.descriptor.manifest.moduleId)');
    expect(wizardService).toContain('!isBuiltInIntegrationModuleId(addOn.moduleId)');
    for (const moduleId of BUILT_IN_INTEGRATION_IDS) {
      const folder = moduleId.slice('thsv.'.length);
      const verified = await verifyAddOnPackage(`addons/${folder}`);
      expect(verified.descriptor.manifest.moduleId).toBe(moduleId);
      expect(installer).toContain(`moduleId === '${moduleId}'`);
      expect(packager).toContain(`'${moduleId}'`);
      expect(packager).toContain(`'addons\\${folder}'`);
      expect(packager).toContain(`'integrations\\${folder}'`);
      expect(docsGenerator).toContain(`['${moduleId}'`);
    }
  });
});
