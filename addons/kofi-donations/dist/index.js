// Ko-fi Donation Provider converts only authenticated Streamer.bot Ko-fi webhook relays into
// core donation events. The broker owns platform identity and normalized-event construction.
const RESULT_EVENT = 'addon.thsv.kofi-donations.donation-received';

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: 'thsv.kofi-donations', name: 'Ko-fi Donations', version: '1.0.1',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', dependencies: [], requiredCapabilities: [],
  configurationSchema: 'schemas/config.json', eventSubscriptions: [RESULT_EVENT], commandsProvided: [],
  actionsProvided: [{ id: 'kofi-donations.intake', name: 'Required Ko-fi donation intake' }], browserSourcesProvided: [],
  dataStorageOwned: ['data/addons/thsv.kofi-donations/'],
  installationSteps: [
    'Connect Ko-fi to Streamer.bot using Streamer.bot Website Webhooks and the Ko-fi verification token.',
    'Import the Ko-fi Donations Streamer.bot package and attach Ko-Fi > Donation to its intake action.',
    'Install this add-on, review its financial-event permission, configure privacy, enable it, and restart StreamBridge.',
  ],
  uninstallationSteps: ['Uninstall the add-on. StreamBridge stores no Ko-fi webhook secrets or payment history.'], migrations: [],
  healthChecks: [{ id: 'thsv.kofi-donations.runtime', description: 'Confirms stable-ID Ko-fi donations can enter the validated durable alert pipeline.' }],
};

const FALLBACKS = Object.freeze({ enabled: false, channelName: 'Ko-fi', includePublicMessage: true, showPublicSupporterName: true, privateSupporterLabel: 'Anonymous Ko-fi supporter' });
function clean(value, maximum) { const normalized = typeof value === 'string' ? value.replace(/[\p{Cc}\s]+/gu, ' ').trim() : ''; return [...normalized].slice(0, maximum).join(''); }
function settingsFor(context) { return { ...FALLBACKS, ...(context.settings ?? {}) }; }
function decimal(value) { const result = clean(value, 32); return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u.test(result) ? result : ''; }
function currency(value) { const result = clean(value, 8).toUpperCase(); return /^[A-Z]{3}$/u.test(result) ? result : ''; }

export async function handleKoFiDonation(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled || event?.eventType !== RESULT_EVENT) return false;
  const sourceEventId = clean(event.source?.eventId, 256); const amount = decimal(event.payload?.amount); const currencyCode = currency(event.payload?.currency);
  if (!sourceEventId || !amount || !currencyCode) return false;
  const isPublic = event.payload?.isPublic === true; const publicName = clean(event.payload?.from, 256);
  const supporterName = isPublic && settings.showPublicSupporterName && publicName ? publicName : clean(settings.privateSupporterLabel, 256) || 'Anonymous Ko-fi supporter';
  const publicMessage = isPublic && settings.includePublicMessage ? clean(event.payload?.message, 2000) : '';
  const providerTimestamp = clean(event.payload?.timestamp, 100); const receivedAt = Number.isNaN(Date.parse(providerTimestamp)) ? event.receivedAt : new Date(providerTimestamp).toISOString();
  await context.provider.publishDonation({ sourceEventId, sourceEventType: 'KofiDonation', receivedAt, channelName: clean(settings.channelName, 256) || 'Ko-fi', supporterName, amount, currency: currencyCode, ...(publicMessage ? { message: publicMessage } : {}), simulated: event.metadata?.simulated === true });
  return true;
}

export default { manifest, required: false, async onEvent(event, context) { await handleKoFiDonation(event, context); } };
