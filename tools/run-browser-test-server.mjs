import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'thsv-browser-test-'));
const config = JSON.parse(await readFile('config/bridge.example.json', 'utf8'));
config.service.port = Number(process.env.THVS_PLAYWRIGHT_PORT ?? 8799);
config.streamerbot.testMode = true;
// Visual storm tests exercise browser queue/layout behavior, not delivery backpressure.
// Keep the production default bounded at 100; give this isolated temporary harness room
// so unrelated simulated events cannot make a later visual assertion receive HTTP 429.
config.streamerbot.deliveryQueueCapacity = 10_000;
config.security.maxRequestsPerMinute = 10_000;
config.streamerbot.deliveryStateFile = join(directory, 'delivery-outbox.json');
config.deduplication.stateFile = join(directory, 'deduplication.json');
config.timedActions.stateFile = join(directory, 'timed-actions.json');
config.logging.directory = join(directory, 'logs');
config.security.controlTokenFile = join(directory, 'control-token');
const configPath = join(directory, 'bridge.json');
await writeFile(configPath, JSON.stringify(config), 'utf8');
process.env.THSV_STREAMBRIDGE_CONFIG = configPath;
process.env.THSV_STREAMBRIDGE_CONTROL_TOKEN = 'playwright-control-token-with-32-characters';
process.env.THSV_STREAMBRIDGE_DATA_ROOT = directory;
process.env.THSV_STREAMBRIDGE_ADDONS_ROOT = join(directory, 'addons', 'packages');
process.env.THSV_STREAMBRIDGE_ADDON_STATE_ROOT = join(directory, 'addons', 'state');
await import('../dist/apps/bridge-service.js');
