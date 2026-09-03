import { createHash } from 'node:crypto';
import { liveCaptionsSchema, type BridgeConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { StreamerBotEventRelay } from '../adapters/streamerbot-event-relay.js';
import type { BrowserOverlayHub } from './browser-overlay-hub.js';
import type { Logger } from './logger.js';

type JsonRecord = Readonly<Record<string, unknown>>;
type CaptionCandidate = Readonly<{ text: string; confidence: number; alternative: boolean }>;

const BUILT_IN_PROFANITY = Object.freeze([
  'asshole', 'bastard', 'bitch', 'bullshit', 'cunt', 'dick', 'fuck', 'fucked', 'fucker', 'fucking', 'motherfucker', 'motherfucking', 'pussy', 'shit', 'shitty',
]);

/** Sends native Streamer.bot dictation straight to the overlay without retaining transcript text. */
export class LiveCaptionService {
  private received = 0;
  private published = 0;
  private rejectedLowConfidence = 0;
  private rejectedStale = 0;
  private suppressedRepeats = 0;
  private corrected = 0;
  private alternativeSelections = 0;
  private profanityMasked = 0;
  private publishFailures = 0;
  private lastTextFingerprint = '';
  private lastPublishedAtMs = 0;
  private lastDictationAt: string | undefined;
  private lastCaptionAt: string | undefined;
  private unsubscribe: (() => void) | undefined;

  public constructor(
    private readonly config: BridgeConfig['liveCaptions'],
    private readonly overlay: BrowserOverlayHub,
    private readonly relay: StreamerBotEventRelay,
    private readonly logger: Logger,
    private readonly now = () => Date.now(),
  ) {}

  public start(): void {
    if (!this.config.enabled || this.unsubscribe !== undefined) return;
    this.unsubscribe = this.relay.subscribe((message) => this.receive(message));
    this.logger.info('Built-in live captions started', { provider: 'streamerbot-speech-to-text', storesTranscripts: false });
  }

  public stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.resetRepeatSuppression();
    this.safeClear('bridge-shutdown');
  }

  public observeBridgeEvent(event: NormalizedEvent): void {
    if (event.eventType !== 'stream.offline') return;
    this.resetRepeatSuppression();
    this.safeClear('stream-offline');
  }

  public preview(input?: unknown): Readonly<Record<string, unknown>> {
    const settings = previewSettings(input, this.config);
    const text = 'Live captions make every voice in the village easier to follow.';
    const durationMs = Math.max(settings.durationMs, 8_000);
    this.overlay.publishLiveCaption({ text, confidence: 0.98, durationMs, expiresAt: new Date(this.now() + durationMs).toISOString(), preview: true, style: captionStyle(settings) });
    return { published: true, characters: text.length, overlayUrl: '/overlay/captions' };
  }

  public clear(reason = 'creator-request'): Readonly<Record<string, unknown>> {
    this.overlay.clearLiveCaptions(reason);
    return { cleared: true };
  }

  public status(): Readonly<Record<string, unknown>> {
    return {
      enabled: this.config.enabled,
      listening: this.unsubscribe !== undefined,
      provider: 'streamerbot-speech-to-text',
      overlayUrl: '/overlay/captions',
      privacy: { storesAudio: false, storesTranscripts: false, logsCaptionText: false },
      minimumConfidence: this.config.minimumConfidence,
      received: this.received,
      published: this.published,
      rejectedLowConfidence: this.rejectedLowConfidence,
      rejectedStale: this.rejectedStale,
      suppressedRepeats: this.suppressedRepeats,
      corrected: this.corrected,
      alternativeSelections: this.alternativeSelections,
      profanityMasked: this.profanityMasked,
      correctionRules: this.config.corrections.length,
      profanityFilter: this.config.profanityFilter,
      publishFailures: this.publishFailures,
      ...(this.lastDictationAt === undefined ? {} : { lastDictationAt: this.lastDictationAt }),
      ...(this.lastCaptionAt === undefined ? {} : { lastCaptionAt: this.lastCaptionAt }),
    };
  }

  private receive(message: JsonRecord): void {
    const dictation = parseDictation(message);
    if (dictation === undefined) return;
    this.received += 1;
    this.lastDictationAt = dictation.receivedAt;
    const selected = selectCaptionCandidate(dictation.candidates, this.config);
    if (selected === undefined) {
      this.rejectedLowConfidence += 1;
      return;
    }
    const corrected = applyCorrections(selected.text, this.config.corrections);
    const filtered = this.config.profanityFilter ? maskProfanity(corrected.text, [...BUILT_IN_PROFANITY, ...this.config.additionalProfanity]) : { text: corrected.text, matches: 0 };
    const text = cleanCaption(filtered.text, this.config.maximumCharacters);
    if (text === '') return;
    const now = this.now();
    const sourceTime = Date.parse(dictation.receivedAt);
    const ageMs = Number.isFinite(sourceTime) ? Math.max(0, now - sourceTime) : 0;
    const remainingMs = this.config.durationMs - ageMs;
    if (remainingMs <= 0) {
      this.rejectedStale += 1;
      return;
    }
    if (this.config.repeatSuppressionMs > 0) {
      const fingerprint = createHash('sha256').update(text.toLocaleLowerCase('en-US'), 'utf8').digest('hex');
      if (fingerprint === this.lastTextFingerprint && now - this.lastPublishedAtMs < this.config.repeatSuppressionMs) {
        this.suppressedRepeats += 1;
        return;
      }
      this.lastTextFingerprint = fingerprint;
    } else {
      this.lastTextFingerprint = '';
    }
    this.lastPublishedAtMs = now;
    this.lastCaptionAt = new Date(now).toISOString();
    if (corrected.replacements > 0) this.corrected += 1;
    if (selected.alternative) this.alternativeSelections += 1;
    this.profanityMasked += filtered.matches;
    try {
      this.overlay.publishLiveCaption({ text, confidence: selected.confidence, durationMs: remainingMs, expiresAt: new Date(now + remainingMs).toISOString(), style: captionStyle(this.config) });
      this.published += 1;
      this.logger.debug('Live caption published', { characters: graphemes(text).length, confidence: selected.confidence, usedAlternative: selected.alternative });
    } catch (error) {
      this.publishFailures += 1;
      this.logger.warn('Live caption overlay publish failed', { error });
    }
  }

  private safeClear(reason: string): void {
    try { this.overlay.clearLiveCaptions(reason); }
    catch (error) { this.logger.warn('Live caption overlay clear failed', { reason, error }); }
  }

  private resetRepeatSuppression(): void {
    this.lastTextFingerprint = '';
    this.lastPublishedAtMs = 0;
  }
}

export function captionStyle(config: BridgeConfig['liveCaptions']): Readonly<Record<string, unknown>> {
  return {
    fontFamily: config.fontFamily, fontSizePx: config.fontSizePx, fontWeight: config.fontWeight, textColor: config.textColor, textAlign: config.textAlign,
    outlineColor: config.outlineColor, outlineWidthPx: config.outlineWidthPx, backgroundMode: config.backgroundMode, backgroundColor: config.backgroundColor,
    backgroundOpacity: config.backgroundOpacity, paddingPx: config.paddingPx, borderRadiusPx: config.borderRadiusPx, shadowEnabled: config.shadowEnabled,
    shadowColor: config.shadowColor, shadowBlurPx: config.shadowBlurPx, shadowOffsetXpx: config.shadowOffsetXpx, shadowOffsetYpx: config.shadowOffsetYpx,
    position: config.position, maximumWidthPercent: config.maximumWidthPercent, maximumLines: config.maximumLines, animation: config.animation,
  };
}

function previewSettings(input: unknown, fallback: BridgeConfig['liveCaptions']): BridgeConfig['liveCaptions'] {
  if (input === undefined) return fallback;
  const outer = record(input);
  if (outer !== undefined && Object.keys(outer).length === 0) return fallback;
  return liveCaptionsSchema.parse(outer?.['settings']);
}

function parseDictation(message: JsonRecord): { readonly candidates: readonly CaptionCandidate[]; readonly receivedAt: string } | undefined {
  const event = record(message['event']);
  const data = record(message['data']);
  if (event?.['source'] !== 'SpeechToText' || event['type'] !== 'Dictation' || data === undefined) return undefined;
  const candidates: CaptionCandidate[] = [];
  appendCandidate(candidates, data['text'], data['confidence'], false);
  if (Array.isArray(data['alternatives'])) for (const value of data['alternatives']) {
    const alternative = record(value);
    appendCandidate(candidates, alternative?.['text'], alternative?.['confidence'], true);
  }
  if (candidates.length === 0) return undefined;
  return { candidates, receivedAt: isoDate(message['timeStamp']) ?? isoDate(message['time']) ?? new Date().toISOString() };
}

function appendCandidate(target: CaptionCandidate[], text: unknown, confidence: unknown, alternative: boolean): void {
  const normalizedText = cleanCaption(text, 2_000);
  const normalizedScore = normalizedConfidence(confidence);
  if (normalizedText === '' || normalizedScore === undefined) return;
  const duplicate = target.findIndex((candidate) => candidate.text.toLocaleLowerCase('en-US') === normalizedText.toLocaleLowerCase('en-US'));
  if (duplicate >= 0) {
    const existing = target[duplicate];
    if (existing !== undefined && normalizedScore > existing.confidence) target[duplicate] = { text: normalizedText, confidence: normalizedScore, alternative: existing.alternative };
    return;
  }
  target.push({ text: normalizedText, confidence: normalizedScore, alternative });
}

function selectCaptionCandidate(candidates: readonly CaptionCandidate[], config: BridgeConfig['liveCaptions']): CaptionCandidate | undefined {
  const primary = candidates[0];
  if (primary === undefined) return undefined;
  const allowed = (config.useAlternatives ? candidates : candidates.slice(0, 1))
    .filter((candidate) => candidate.confidence >= config.minimumConfidence)
    .filter((candidate) => !candidate.alternative || candidate.confidence >= primary.confidence - config.alternativeConfidenceTolerance)
    .map((candidate, index) => ({ candidate, index, corrections: correctionCount(candidate.text, config.corrections) }));
  allowed.sort((left, right) => right.corrections - left.corrections || right.candidate.confidence - left.candidate.confidence || left.index - right.index);
  return allowed[0]?.candidate;
}

function applyCorrections(value: string, corrections: BridgeConfig['liveCaptions']['corrections']): { text: string; replacements: number } {
  let text = value;
  let replacements = 0;
  for (const correction of [...corrections].sort((left, right) => right.heard.length - left.heard.length)) {
    text = text.replace(literalPhrasePattern(correction.heard), () => { replacements += 1; return correction.intended; });
  }
  return { text, replacements };
}

function correctionCount(value: string, corrections: BridgeConfig['liveCaptions']['corrections']): number {
  return corrections.reduce((total, correction) => total + (literalPhrasePattern(correction.heard).test(value) ? 1 : 0), 0);
}

function maskProfanity(value: string, configured: readonly string[]): { text: string; matches: number } {
  let text = value;
  let matches = 0;
  const unique = [...new Set(configured.map((item) => item.trim().toLocaleLowerCase('en-US')).filter(Boolean))].sort((left, right) => right.length - left.length);
  for (const term of unique) text = text.replace(literalPhrasePattern(term), (match) => {
    matches += 1;
    return graphemes(match).map((character) => /\s/u.test(character) ? character : '•').join('');
  });
  return { text, matches };
}

function literalPhrasePattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
}

function normalizedConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.max(0, Math.min(1, value > 1 && value <= 100 ? value / 100 : value));
}

function cleanCaption(value: unknown, maximum: number): string {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  const points = graphemes(clean);
  return points.length <= maximum ? clean : `${points.slice(0, Math.max(1, maximum - 1)).join('')}…`;
}

function graphemes(value: string): string[] {
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (item) => item.segment);
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function record(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined;
}
