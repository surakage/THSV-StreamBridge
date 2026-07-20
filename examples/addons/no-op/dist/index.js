const manifest = {
  contractVersion: '2.0.0-preview.1',
  moduleId: 'sample.no-op',
  name: 'Sample No-Op Add-On',
  version: '1.0.0',
  minimumCoreVersion: '2.0.0-preview.1',
  maximumTestedCoreVersion: '2.0.0-preview.1',
  dependencies: [],
  requiredCapabilities: [],
  configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['system.health'],
  commandsProvided: [],
  actionsProvided: [],
  browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/sample.no-op/'],
  installationSteps: ['Review the source and install with explicit creator approval.'],
  uninstallationSteps: ['Remove the add-on package; its separately owned data remains preserved.'],
  migrations: [],
  healthChecks: [{ id: 'sample.no-op.runtime', description: 'Confirms the sample add-on starts without affecting core.' }],
};

export default {
  manifest,
  required: false,
  async start() {},
  async stop() {},
  async onEvent() {},
};
