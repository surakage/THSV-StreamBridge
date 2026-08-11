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
export function startStreamerBotSafely(options?: {
  readonly executable?: string;
  readonly websocketPort?: number;
  readonly installRoot?: string;
  readonly checkOnly?: boolean;
  readonly save?: boolean;
  readonly output?: NodeJS.WriteStream;
}): Promise<SafeStartResult>;
