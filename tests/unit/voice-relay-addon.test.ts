import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call -- executable add-on entrypoints are plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { textFor } from '../../addons/voice-relay/dist/index.js';
const settings = { eventTypes: new Set(['chat.message']), maximumCharacters: 100, allowChatRoles: new Set(['moderator']), blockedTerms: ['blocked'] };
describe('Voice Relay', () => { it('role-gates chat, strips links, and blocks configured terms', () => { const base = { eventType: 'chat.message', metadata: {}, user: { actorType: 'human', roles: ['moderator'], displayName: 'Alex' }, payload: { message: 'visit https://example.com now' } }; expect(textFor(base, settings)).toBe('visit link now'); expect(textFor({ ...base, user: { ...base.user, roles: ['viewer'] } }, settings)).toBe(''); expect(textFor({ ...base, payload: { message: 'a blocked phrase' } }, settings)).toBe(''); }); });
