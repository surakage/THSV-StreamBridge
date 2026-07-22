import { randomBytes } from 'node:crypto';

const TOKEN_TTL_MS = 120_000;
const MAXIMUM_TOKENS = 500;

interface RelayGrant { readonly moduleId: string; readonly expiresAt: number }

export class AddOnRelayAuthorizer {
  private readonly grants = new Map<string, RelayGrant>();

  public issue(moduleId: string): string {
    this.prune();
    while (this.grants.size >= MAXIMUM_TOKENS) this.grants.delete(this.grants.keys().next().value ?? '');
    const token = randomBytes(32).toString('base64url');
    this.grants.set(token, { moduleId, expiresAt: Date.now() + TOKEN_TTL_MS });
    return token;
  }

  public consume(moduleId: string, token: string): boolean {
    this.prune();
    const grant = this.grants.get(token);
    this.grants.delete(token);
    return grant !== undefined && grant.moduleId === moduleId && grant.expiresAt > Date.now();
  }

  private prune(): void {
    const now = Date.now();
    for (const [token, grant] of this.grants) if (grant.expiresAt <= now) this.grants.delete(token);
  }
}

export const addOnRelayAuthorizer = new AddOnRelayAuthorizer();
