import { describe, expect, it } from 'vitest';
import { createCommandAdministrationRequest, InvalidCommandAdministrationError } from '../../bridge/core/command-administration.js';

describe('command administration contract', () => {
  it('creates a creator-approved enable request', () => {
    expect(createCommandAdministrationRequest({
      operation: 'enable', commandId: 'sb-command-1', approvedByCreator: true, requestId: 'admin-001',
    })).toEqual({
      contractVersion: '1.0.0', operation: 'enable', commandId: 'sb-command-1', requestId: 'admin-001',
    });
  });

  it.each(['enable', 'disable'] as const)('supports the %s operation without a request id', (operation) => {
    expect(createCommandAdministrationRequest({ operation, commandId: 'sb-command-1', approvedByCreator: true })).toEqual({
      contractVersion: '1.0.0', operation, commandId: 'sb-command-1',
    });
  });

  it('denies missing creator approval', () => {
    expect(() => createCommandAdministrationRequest({ operation: 'enable', commandId: 'sb-command-1', approvedByCreator: false }))
      .toThrow(InvalidCommandAdministrationError);
    expect(() => createCommandAdministrationRequest({ operation: 'enable', commandId: 'sb-command-1', approvedByCreator: false }))
      .toThrow('explicit creator approval');
  });

  it('rejects an unrecognized operation', () => {
    expect(() => createCommandAdministrationRequest({ operation: 'delete', commandId: 'sb-command-1', approvedByCreator: true }))
      .toThrow('operation must be enable or disable');
  });

  it('rejects an empty or oversized command ID', () => {
    expect(() => createCommandAdministrationRequest({ operation: 'enable', commandId: '   ', approvedByCreator: true }))
      .toThrow('non-empty Streamer.bot command ID');
    expect(() => createCommandAdministrationRequest({ operation: 'enable', commandId: 'x'.repeat(129), approvedByCreator: true }))
      .toThrow('at most 128 characters');
  });

  it('rejects a malformed request id', () => {
    expect(() => createCommandAdministrationRequest({ operation: 'enable', commandId: 'sb-command-1', approvedByCreator: true, requestId: '  ' }))
      .toThrow('bounded identifier');
    expect(() => createCommandAdministrationRequest({ operation: 'enable', commandId: 'sb-command-1', approvedByCreator: true, requestId: 'has spaces' }))
      .toThrow('bounded identifier');
  });
});
