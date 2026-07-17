export type StreamerBotBroadcastHandler = (message: Readonly<Record<string, unknown>>) => void;

export class StreamerBotEventRelay {
  private readonly handlers = new Set<StreamerBotBroadcastHandler>();

  public subscribe(handler: StreamerBotBroadcastHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public publish(message: Readonly<Record<string, unknown>>): void {
    for (const handler of this.handlers) handler(message);
  }
}
