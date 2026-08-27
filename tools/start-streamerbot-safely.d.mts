export interface StreamerBotListener {
  readonly address: string;
  readonly pid: number;
}

export interface SafeStartResult {
  readonly pid: number;
  readonly repaired: boolean;
}

export function parseNetstatListeners(output: string, port?: number): StreamerBotListener[];
export function samePath(left: string, right: string): boolean;
export function recoverStaleListener(options: {
  readonly port: number;
  readonly listenerPid: number;
  readonly installRoot?: string;
  readonly output: { write(message: string): unknown };
  readonly waitForNaturalRelease?: (port: number, timeout: number) => Promise<void>;
  readonly listenerForPort?: (port: number) => StreamerBotListener | undefined;
  readonly stopBridge?: (installRoot: string | undefined, port: number, listenerPid: number, output: { write(message: string): unknown }) => boolean;
  readonly waitForFinalRelease?: (port: number, timeout: number) => Promise<void>;
}): Promise<boolean>;
export function startStreamerBotSafely(options?: {
  readonly executable?: string;
  readonly websocketPort?: number;
  readonly installRoot?: string;
  readonly checkOnly?: boolean;
  readonly save?: boolean;
  readonly output?: NodeJS.WriteStream;
}): Promise<SafeStartResult>;
