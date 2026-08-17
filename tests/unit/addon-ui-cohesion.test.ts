import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { verifyAddOnPackage } from '../../bridge/services/addon-package-manager.js';

interface AddOnDescriptor {
  entrypoint?: string;
  manifest?: unknown;
  packageKind?: string;
  settingsUi?: string;
  trust?: {
    supportUrl?: string;
  };
}

interface ConfigurationSchema {
  properties?: Record<string, unknown>;
}

interface SettingsSection {
  id?: string;
  title?: string;
  open?: boolean;
  fields?: string[];
}

interface SettingsUi {
  intro?: string;
  order?: string[];
  sections?: SettingsSection[];
}

describe('first-party add-on wizard cohesion', () => {
  it('keeps every shipped runtime manifest and integrity record installable', async () => {
    const addOnNames = (await readdir('addons', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const addOnName of addOnNames) {
      const verified = await verifyAddOnPackage(join('addons', addOnName));
      expect(verified, `${addOnName} must remain loadable by the production add-on verifier`).toBeDefined();

      if (verified.descriptor.packageKind !== 'executable' || verified.descriptor.entrypoint === undefined) continue;
      const imported = await import(pathToFileURL(join(verified.root, verified.descriptor.entrypoint)).href) as {
        readonly default?: unknown;
        readonly createModule?: () => unknown;
      };
      const candidate = imported.createModule === undefined ? imported.default : await imported.createModule();
      expect(candidate, `${addOnName} must export its executable runtime`).toBeTypeOf('object');
      const runtime = candidate as { readonly manifest?: unknown; readonly required?: unknown };
      expect(runtime.required, `${addOnName} must declare the correct runtime ownership`).toBe(addOnName === 'viewer-foundation');
      expect(JSON.stringify(runtime.manifest), `${addOnName} runtime and package manifests must match exactly`).toBe(JSON.stringify(verified.descriptor.manifest));
    }
  });

  it('keeps every add-on complete, guided, and bounded instead of rendering one long card', async () => {
    const addOnNames = (await readdir('addons', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(addOnNames.length).toBeGreaterThan(0);
    for (const addOnName of addOnNames) {
      const root = join('addons', addOnName);
      const descriptor = JSON.parse(await readFile(join(root, 'module-package.json'), 'utf8')) as AddOnDescriptor;
      expect(descriptor.settingsUi, `${addOnName} must declare settingsUi`).toBe('ui/settings.json');
      expect(descriptor.trust?.supportUrl, `${addOnName} must use the shared creator-support destination`).toBe('https://www.slothbloom.com/tip');

      const schema = JSON.parse(await readFile(join(root, 'schemas', 'config.json'), 'utf8')) as ConfigurationSchema;
      const ui = JSON.parse(await readFile(join(root, 'ui', 'settings.json'), 'utf8')) as SettingsUi;
      const propertyNames = Object.keys(schema.properties ?? {}).sort();
      const order = ui.order ?? [];
      const sections = ui.sections ?? [];
      const sectionFields = sections.flatMap((section) => section.fields ?? []);

      expect(ui.intro?.trim().length, `${addOnName} needs a short setup introduction`).toBeGreaterThan(20);
      expect(sections.length, `${addOnName} needs collapsible setup sections`).toBeGreaterThanOrEqual(2);
      expect(sections[0]?.open, `${addOnName} must open its quick-start section`).toBe(true);
      expect(new Set(sections.map((section) => section.id)).size, `${addOnName} section IDs must be unique`).toBe(sections.length);
      expect(sections.every((section) => Boolean(section.id?.trim()) && Boolean(section.title?.trim())), `${addOnName} sections need IDs and titles`).toBe(true);
      expect(Math.max(...sections.map((section) => section.fields?.length ?? 0)), `${addOnName} sections should remain scannable`).toBeLessThanOrEqual(12);
      expect([...order].sort(), `${addOnName} order must cover every setting once`).toEqual(propertyNames);
      expect([...sectionFields].sort(), `${addOnName} sections must cover every setting once`).toEqual(propertyNames);
      expect(new Set(order).size, `${addOnName} order must not repeat fields`).toBe(order.length);
      expect(new Set(sectionFields).size, `${addOnName} sections must not repeat fields`).toBe(sectionFields.length);
    }
  });
});
