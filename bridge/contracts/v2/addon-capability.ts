import type { JsonValueV2 } from './common.js';
import type { AddOnPermissionV2 } from './addon-package.js';

export const CORE_RECEIVER_ACTION_ID = '143fce1d-c5b0-4108-b766-ee2d0249e2d4';
export const PROTECTED_FRAMEWORK_ACTION_IDS = new Set([
  CORE_RECEIVER_ACTION_ID,
  '99e202ab-0ee9-58d1-b22c-95b30fdc702e',
  '9481fb18-98a4-5db2-b826-d89db463f490',
  '2a52e02b-fefe-5c89-8aeb-067aa773d621',
  'f021d77f-7eb8-55d8-87dd-d681c439dfef',
  '7d107c29-1127-5bb1-ae8b-6f04d89a71d4',
  '5b43c53a-1e4b-5608-b343-5f88c2884677',
  '38df4ccc-2d85-5a9d-8fa6-6711f513c2bd',
  'a6b02419-c344-5853-8166-eb6b6adb02d7',
  '9f37f61d-f2d6-50cc-bbca-3b1d951ef9ee',
  'ab0e5f0a-e714-516c-82ee-1f476a516f7e',
  '6bd402de-117e-56f4-8855-308e2894e66c',
  'b2ee7599-75b5-5c88-8ef2-4d715885c610',
  '23332128-445d-52ee-837a-0c79579e3c04',
  '4e9f0946-f33d-5309-b376-a16df5612b32',
  '04ca0087-578d-5c2e-9e06-249dc072e9f8',
  'c1d3a9e2-0f4b-4b78-91c2-7a65d8e309f1',
  'f5b716a8-eb6e-54d3-8e25-d7dd80f6baf2',
  '8d8e3667-fd96-510f-b2ae-a8affe5b789a',
  '18bdc91c-64eb-4787-8be9-6a921b272943',
].map((value) => value.toLowerCase()));

export function isProtectedFrameworkActionId(actionId: string): boolean { return PROTECTED_FRAMEWORK_ACTION_IDS.has(actionId.toLowerCase()); }

export type AddOnActionArgumentsV2 = Readonly<Record<string, JsonValueV2>>;
export type AddOnPrivateStateV2 = Readonly<Record<string, JsonValueV2>>;
export type AddOnScheduledTaskV2 = () => void | Promise<void>;

export interface AddOnStateCapabilityV2 {
  read(): Promise<AddOnPrivateStateV2>;
  write(value: AddOnPrivateStateV2): Promise<void>;
}

export interface AddOnStreamerBotCapabilityV2 {
  runApprovedAction(actionId: string, argumentsValue?: AddOnActionArgumentsV2): Promise<void>;
}

export interface AddOnScheduleCapabilityV2 {
  after(delayMs: number, task: AddOnScheduledTaskV2): string;
  cancel(taskId: string): boolean;
}

export interface AddOnOverlayCapabilityV2 {
  publish(topic: string, payload: Readonly<Record<string, JsonValueV2>>): Promise<void>;
  onLifecycle(listener: (event: AddOnOverlayLifecycleV2) => void): () => void;
}

export interface AddOnOverlayLifecycleV2 {
  readonly playbackId: string;
  readonly phase: 'loading' | 'started' | 'heartbeat' | 'ended' | 'stopped' | 'failed' | 'timeout';
  readonly occurredAt: string;
  readonly currentTime?: number;
  readonly duration?: number;
  readonly error?: string;
}

export type AddOnOutboundPlatformV2 = 'twitch' | 'youtube' | 'kick' | 'tiktok';

export interface AddOnOutboundMessageRequestV2 {
  readonly message: string;
  readonly routing: 'source' | 'selected';
  readonly sourcePlatform?: AddOnOutboundPlatformV2;
  readonly selectedPlatforms?: readonly AddOnOutboundPlatformV2[];
  readonly overflow?: 'reject' | 'split';
}

export interface AddOnOutboundMessageDeliveryV2 {
  readonly platform: AddOnOutboundPlatformV2;
  readonly accepted: boolean;
  readonly parts: number;
  readonly error?: string;
}

export interface AddOnChatCapabilityV2 {
  send(request: AddOnOutboundMessageRequestV2): Promise<readonly AddOnOutboundMessageDeliveryV2[]>;
}

export interface AddOnProviderDonationRequestV2 {
  readonly sourceEventId: string;
  readonly sourceEventType: string;
  readonly receivedAt: string;
  readonly channelName: string;
  readonly supporterName: string;
  readonly amount: string;
  readonly currency: string;
  readonly message?: string;
  readonly simulated: boolean;
}

export interface AddOnProviderCapabilityV2 {
  /** Publishes only the provider event types assigned to this installed module. Core constructs and validates the normalized event. */
  publishDonation(request: AddOnProviderDonationRequestV2): Promise<void>;
}

export interface ModuleRuntimeContextV2 {
  readonly moduleId: string;
  readonly grantedPermissions: readonly AddOnPermissionV2[];
  readonly approvedActionIds: readonly string[];
  has(permission: AddOnPermissionV2): boolean;
  /** The add-on's own creator-saved settings, already validated against its configurationSchema with defaults applied. Empty for a declarative package or one with no schema properties. */
  readonly settings: Readonly<Record<string, unknown>>;
  readonly state: AddOnStateCapabilityV2;
  readonly streamerbot: AddOnStreamerBotCapabilityV2;
  readonly schedule: AddOnScheduleCapabilityV2;
  readonly overlay: AddOnOverlayCapabilityV2;
  readonly chat: AddOnChatCapabilityV2;
  readonly provider: AddOnProviderCapabilityV2;
}
