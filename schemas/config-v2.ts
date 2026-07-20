import { z } from 'zod';
import { CORE_CONTRACT_VERSION, jsonValueV2Schema } from '../bridge/contracts/v2/common.js';
import { platformCapabilityIdSchema } from '../bridge/contracts/v2/capability.js';

// Preview contract only: the live service still validates creator configuration through
// schemas/config.ts, then migration code projects a fully resolved value into this schema.

const reconnectV2Schema = z.object({
  enabled: z.boolean(),
  initialDelayMs: z.number().int().min(10).max(60_000),
  maxDelayMs: z.number().int().min(10).max(300_000),
  maxAttempts: z.number().int().min(0).max(100),
}).strict().refine((value) => value.maxDelayMs >= value.initialDelayMs, 'maxDelayMs must be greater than or equal to initialDelayMs');

const platformV2Schema = z.object({
  enabled: z.boolean(),
  inputEnabled: z.boolean(),
  outputEnabled: z.boolean(),
  adapter: z.string().min(1).max(100),
  requiredCapabilities: z.array(platformCapabilityIdSchema).max(50).default([]),
  settings: z.record(z.string(), jsonValueV2Schema).default({}),
  reconnect: reconnectV2Schema,
}).strict();

const moduleConfigurationV2Schema = z.object({
  enabled: z.boolean(),
  schemaVersion: z.string().min(1).max(50),
  config: z.record(z.string(), jsonValueV2Schema).default({}),
}).strict();

export const coreConfigV2Schema = z.object({
  configVersion: z.literal(CORE_CONTRACT_VERSION),
  service: z.object({
    name: z.string().min(1).max(100),
    host: z.string().min(1).max(255),
    port: z.number().int().min(1_024).max(65_535),
    allowNetworkAccess: z.boolean(),
    shutdownTimeoutMs: z.number().int().min(100).max(60_000),
  }).strict().refine((service) => service.allowNetworkAccess || ['127.0.0.1', 'localhost', '::1'].includes(service.host), {
    message: 'Non-loopback hosts require allowNetworkAccess=true', path: ['host'],
  }),
  security: z.object({
    maxPayloadBytes: z.number().int().min(1_024).max(10_485_760),
    preserveRawPayloads: z.boolean(),
    controlTokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).default('THSV_STREAMBRIDGE_CONTROL_TOKEN'),
    controlTokenFile: z.string().min(1).default('data/runtime/control-token'),
    allowedOrigins: z.array(z.url()).max(20).default([]),
    maxRequestsPerMinute: z.number().int().min(1).max(10_000).default(60),
    maxConcurrentRequests: z.number().int().min(1).max(100).default(4),
  }).strict(),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    directory: z.string().min(1),
    maxFileBytes: z.number().int().min(1_024).max(1_073_741_824),
    backups: z.number().int().min(1).max(20),
  }).strict(),
  deduplication: z.object({
    ttlMs: z.number().int().min(1_000).max(86_400_000),
    maxEntries: z.number().int().min(10).max(1_000_000),
    persistAcrossRestarts: z.boolean(),
    stateFile: z.string().min(1),
  }).strict(),
  streamerbot: z.object({
    enabled: z.boolean(), url: z.url(), allowRemote: z.boolean().default(false), passwordEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    actionAlias: z.string().min(1).max(200), actionId: z.uuid().optional(),
    commandAdministrationActionAlias: z.string().min(1).max(200).default('THSV StreamBridge - Command Administration'),
    rewardAdministrationActionAlias: z.string().min(1).max(200).default('THSV StreamBridge - Reward Administration'),
    acknowledgementTimeoutMs: z.number().int().min(100).max(60_000),
    maxPendingRequests: z.number().int().min(1).max(1_000).default(16), deliveryQueueCapacity: z.number().int().min(1).max(100_000).default(100), deliveryConcurrency: z.number().int().min(1).max(32).default(2), deliveryFailureThreshold: z.number().int().min(1).max(100).default(3),
    deliveryStateFile: z.string().min(1).default('data/state/delivery-outbox.json'), deliveryMaxAttempts: z.number().int().min(1).max(100).default(8),
    deliveryRetryInitialDelayMs: z.number().int().min(10).max(60_000).default(500), deliveryRetryMaxDelayMs: z.number().int().min(10).max(600_000).default(30_000), deliveryDeadLetterCapacity: z.number().int().min(1).max(100_000).default(1_000),
    testMode: z.boolean(), reconnect: reconnectV2Schema,
  }).strict().superRefine((streamerbot, context) => {
    const url = new URL(streamerbot.url);
    const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
    if (!['ws:', 'wss:'].includes(url.protocol)) context.addIssue({ code: 'custom', path: ['url'], message: 'URL must use ws:// or wss://' });
    if (url.username.length > 0 || url.password.length > 0 || url.search.length > 0) context.addIssue({ code: 'custom', path: ['url'], message: 'URL must not embed credentials or query parameters.' });
    if (!loopback && !streamerbot.allowRemote) context.addIssue({ code: 'custom', path: ['url'], message: 'Remote Streamer.bot URLs require allowRemote=true.' });
    if (!loopback && url.protocol !== 'wss:') context.addIssue({ code: 'custom', path: ['url'], message: 'Remote Streamer.bot URLs must use wss://' });
    if (streamerbot.deliveryRetryMaxDelayMs < streamerbot.deliveryRetryInitialDelayMs) context.addIssue({ code: 'custom', path: ['deliveryRetryMaxDelayMs'], message: 'Maximum delivery retry delay must be at least the initial delay' });
  }),
  platforms: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), platformV2Schema),
  outputs: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), z.object({ enabled: z.boolean(), adapter: z.string().min(1).max(100), settings: z.record(z.string(), jsonValueV2Schema).default({}) }).strict()),
  modules: z.record(z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/), moduleConfigurationV2Schema).default({}),
}).strict();

export type CoreConfigV2 = z.infer<typeof coreConfigV2Schema>;
