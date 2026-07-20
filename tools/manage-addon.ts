import { resolve } from 'node:path';
import { installAddOnPackage, removeAddOnPackage, verifyAddOnPackage } from '../bridge/services/addon-package-manager.js';

const [operation, value, rootArgument, ...flags] = process.argv.slice(2);
const approved = flags.includes('--approve') || rootArgument === '--approve';
const addOnsRoot = resolve(rootArgument === undefined || rootArgument === '--approve' ? 'data/addons' : rootArgument);

if (operation === 'verify' && value !== undefined) {
  const result = await verifyAddOnPackage(value);
  process.stdout.write(`Verified ${result.descriptor.manifest.moduleId} ${result.descriptor.manifest.version}\n`);
} else if (operation === 'install' && value !== undefined) {
  const result = await installAddOnPackage(value, addOnsRoot, approved);
  process.stdout.write(`Installed ${result.descriptor.manifest.moduleId} ${result.descriptor.manifest.version} at ${result.root}\nRestart StreamBridge to load it.\n`);
} else if (operation === 'remove' && value !== undefined) {
  await removeAddOnPackage(value, addOnsRoot, approved);
  process.stdout.write(`Removed ${value}. Separately owned data was preserved.\nRestart StreamBridge to unload it.\n`);
} else {
  process.stderr.write('Usage:\n  manage-addon verify <package-directory>\n  manage-addon install <package-directory> [add-ons-root] --approve\n  manage-addon remove <module-id> [add-ons-root] --approve\n');
  process.exitCode = 2;
}
