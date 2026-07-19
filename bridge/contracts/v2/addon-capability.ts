import type { JsonValueV2 } from './common.js';
import type { AddOnPermissionV2 } from './addon-package.js';

export const CORE_RECEIVER_ACTION_ID = '143fce1d-c5b0-4108-b766-ee2d0249e2d4';

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
}

export interface ModuleRuntimeContextV2 {
  readonly moduleId: string;
  readonly grantedPermissions: readonly AddOnPermissionV2[];
  readonly approvedActionIds: readonly string[];
  has(permission: AddOnPermissionV2): boolean;
  readonly state: AddOnStateCapabilityV2;
  readonly streamerbot: AddOnStreamerBotCapabilityV2;
  readonly schedule: AddOnScheduleCapabilityV2;
  readonly overlay: AddOnOverlayCapabilityV2;
}
