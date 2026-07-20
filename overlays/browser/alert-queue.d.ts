export interface QueuedAlert {
  readonly sequence?: number;
  readonly priority: 'low' | 'normal' | 'high' | 'critical';
  readonly quantity?: number;
  readonly display?: { readonly durationMs: number; readonly aggregation?: { readonly mode: 'sum-quantity'; readonly key: string; readonly windowMs: number } };
  readonly [key: string]: unknown;
}

export class AlertPresentationQueue {
  public constructor(capacity: number);
  public setCapacity(capacity: number): void;
  public enqueue(alert: QueuedAlert, queuedAt: number, activeAlert: QueuedAlert | undefined): { readonly aggregated: boolean; readonly preempt: boolean };
  public take(): QueuedAlert | undefined;
  public readonly length: number;
  public snapshot(): readonly QueuedAlert[];
}

export class AlertPresentationController {
  public constructor(options: {
    readonly capacity: number;
    readonly defaultDurationMs: number;
    readonly render: (alert: QueuedAlert) => void;
    readonly clear: () => void;
    readonly playSound: (alert: QueuedAlert) => void;
    readonly onError: (error: unknown) => void;
    readonly schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
    readonly cancel?: (timer: ReturnType<typeof setTimeout> | undefined) => void;
  });
  public configure(capacity: number, defaultDurationMs: number): void;
  public enqueue(alert: QueuedAlert, queuedAt?: number): void;
  private enqueueReady;
  public showNext(): void;
  public finish(): void;
}
