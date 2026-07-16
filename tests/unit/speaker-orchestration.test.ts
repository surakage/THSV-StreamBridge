import { describe, expect, it } from 'vitest';
import { createSpeakerOrchestrationRequest, InvalidSpeakerOrchestrationError } from '../../bridge/core/speaker-orchestration.js';

describe('Speaker.bot orchestration contract', () => {
  it('creates a creator-approved speak request with mandatory filtering', () => {
    expect(createSpeakerOrchestrationRequest({
      operation: 'speak', approvedByCreator: true, simulated: false,
      voiceAlias: 'Event Voice', message: 'Thank you  🦥\n friend!', textSource: 'creator-template', requestId: 'speech-001',
    })).toEqual({
      contractVersion: '1.0.0', operation: 'speak', requestId: 'speech-001', transport: 'speakerbot-cph',
      shouldDispatch: true, dryRun: false, simulated: false, badWordFilter: true,
      voiceAlias: 'Event Voice', message: 'Thank you 🦥 friend!', textSource: 'creator-template',
    });
  });

  it.each(['stop', 'pause', 'resume', 'clear'] as const)('routes approved %s through Speaker.bot UDP', (operation) => {
    expect(createSpeakerOrchestrationRequest({ operation, approvedByCreator: true, simulated: false })).toMatchObject({
      operation, transport: 'speakerbot-udp', shouldDispatch: true, badWordFilter: true,
    });
  });

  it('denies missing approval and raw event text', () => {
    expect(() => createSpeakerOrchestrationRequest({ operation: 'stop', approvedByCreator: false, simulated: false })).toThrow(InvalidSpeakerOrchestrationError);
    expect(() => createSpeakerOrchestrationRequest({
      operation: 'speak', approvedByCreator: true, simulated: false,
      voiceAlias: 'EventVoice', message: 'raw donation text', textSource: 'raw-event',
    })).toThrow('creator template');
  });

  it('denies simulated speech by default and supports an explicit no-audio dry run', () => {
    const input = {
      operation: 'speak' as const, approvedByCreator: true, simulated: true,
      voiceAlias: 'TestVoice', message: 'Offline test', textSource: 'creator-template' as const,
    };
    expect(() => createSpeakerOrchestrationRequest(input)).toThrow('Simulated events are denied');
    expect(createSpeakerOrchestrationRequest({ ...input, allowSimulated: true, dryRun: true })).toMatchObject({
      shouldDispatch: false, dryRun: true, simulated: true,
    });
  });

  it('rejects malformed or oversized values and text on control operations', () => {
    expect(() => createSpeakerOrchestrationRequest({
      operation: 'speak', approvedByCreator: true, simulated: false,
      voiceAlias: '', message: 'hello', textSource: 'creator-template',
    })).toThrow('voiceAlias is empty');
    expect(() => createSpeakerOrchestrationRequest({
      operation: 'speak', approvedByCreator: true, simulated: false,
      voiceAlias: 'Voice', message: 'x'.repeat(501), textSource: 'creator-approved',
    })).toThrow('exceeds 500');
    expect(() => createSpeakerOrchestrationRequest({
      operation: 'clear', approvedByCreator: true, simulated: false, message: 'not allowed',
    })).toThrow('does not accept speech text');
  });
});
