import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export class RequestGuardError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

export class MutableRequestGuard {
  private windowStartedAt = Date.now();
  private requestsInWindow = 0;
  private activeRequests = 0;

  public constructor(
    private readonly token: string,
    private readonly allowedOrigins: readonly string[],
    private readonly maxRequestsPerMinute: number,
    private readonly maxConcurrentRequests: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  public acquire(request: IncomingMessage, requireJson: boolean): () => void {
    if (!isLoopback(request.socket.remoteAddress)) throw new RequestGuardError(403, 'Mutable endpoints are loopback-only');
    const origin = request.headers.origin;
    if (origin !== undefined && !this.allowedOrigins.includes(origin)) throw new RequestGuardError(403, 'Browser origin is not allowed');
    if (requireJson && !isJsonContentType(request.headers['content-type'])) throw new RequestGuardError(415, 'Content-Type must be application/json');
    if (!this.authorized(request.headers.authorization)) throw new RequestGuardError(401, 'Missing or invalid control token');

    const now = this.now();
    if (now - this.windowStartedAt >= 60_000) {
      this.windowStartedAt = now;
      this.requestsInWindow = 0;
    }
    if (this.requestsInWindow >= this.maxRequestsPerMinute) throw new RequestGuardError(429, 'Mutable endpoint rate limit exceeded');
    if (this.activeRequests >= this.maxConcurrentRequests) throw new RequestGuardError(429, 'Mutable endpoint concurrency limit exceeded');
    this.requestsInWindow += 1;
    this.activeRequests += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeRequests = Math.max(0, this.activeRequests - 1);
    };
  }

  private authorized(header: string | undefined): boolean {
    if (header === undefined || !header.startsWith('Bearer ')) return false;
    const provided = Buffer.from(header.slice(7), 'utf8');
    const expected = Buffer.from(this.token, 'utf8');
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }
}

export function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isJsonContentType(contentType: string | undefined): boolean {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}
