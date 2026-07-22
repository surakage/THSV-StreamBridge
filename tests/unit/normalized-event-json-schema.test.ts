import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('published normalized-event JSON Schema', () => {
  it('tracks runtime presentation, bounds, JSON values, and stable financial identity', async () => {
    const schema = JSON.parse(await readFile('schemas/normalized-event.schema.json', 'utf8')) as Record<string, unknown>;
    const serialized = JSON.stringify(schema);
    expect(serialized).toContain('avatarUrl');
    expect(serialized).toContain('nameColor');
    expect(serialized).toContain('presentationBadge');
    expect(serialized).toContain('jsonValue');
    expect(serialized).toContain('maxItems');
    expect(serialized).toContain('reward.redemption');
    expect(serialized).toContain('eventId');
    expect(serialized).toContain('https://');
  });
});
