# Architecture

```text
platform/integration -> adapter -> schema validation -> normalization
                     -> TTL deduplication -> internal event bus -> routing
                     -> Streamer.bot -> actions and future outputs
```

## Boundaries

- `schemas`: versioned event and configuration contracts.
- `bridge/adapters`: registered input/output transports, shared normalization helpers, and adapter factories. Shared logic never switches on platform payload shapes.
- `bridge/core`: deduplication, event bus, and orchestration.
- `bridge/services`: configuration, logging, atomic state, and HTTP diagnostics.
- `apps`: executable service entrypoints.
- `tools`: configuration validation and fixture simulation.

Core receives adapters from `AdapterRegistry`; it does not construct platform implementations. Platform configuration and output configuration are validated records, so a registered provider can be added without editing core. Streamer.bot implements the same output contract future sinks will use.

One adapter failure is logged and isolated. Disabled adapters are not started and do not create warnings. Readiness requires every enabled input/output adapter to be connected and degrades after the configured consecutive delivery-failure threshold. Liveness remains healthy while the process can serve diagnostics.

Input adapters that emit from a WebSocket, IRC, timer, SDK, or other background callback must await `AdapterContext.emit()` or attach an explicit rejection handler. An individual emission failure is adapter-local state and must never become an unhandled promise rejection. The mock adapter is HTTP-driven; this rule becomes mandatory when the first real-time input adapter is added.

## Normalized event

Schema version `1.0.0` requires identity, type, platform, source, receive time, channel, payload, and metadata. User data is conditional. Standard event names remain documented, while lowercase namespaced event types and new platform identifiers provide an extension point. Adapter authors can use `buildNormalizedEvent` for consistent boilerplate.

Raw payloads are discarded unless `security.preserveRawPayloads` is explicitly enabled. Log redaction always removes fields named like credentials or raw payloads.

## Multi-Chat

The core receiver remains the only Streamer.bot action that parses the normalized envelope. Multi-Chat runs inline after that receiver and consumes only its validated `streamBridge*` argument stack. It does not read Twitch, YouTube, Kick, TikTok, Facebook, or TikFinity payload shapes.

`bridge/core/multi-chat.ts` is the TypeScript reference contract for adapter and test authors. The versioned Streamer.bot package implements the same projection at the automation boundary: event identity, validated timestamp, process-local arrival sequence, explicit public visibility, normalized platform/channel/user identity, actor provenance, plain-text message, role flags, and simulated status. Non-chat events are successful no-ops, while invalid chat semantics fail with a readable feature-level error.

The bridge assigns `metadata.bridgeSequence` only after validation and deduplication, overwriting any caller value. The receiver and feature actions are stateless and export with concurrent execution enabled, so one slow invocation cannot hold the global event pipeline. Multiple delivery requests may therefore complete out of order; consumers reconstruct accepted arrival order with the feature sequence, receive timestamp, and event ID. Sequence numbers reset when the bridge restarts and may contain gaps after later delivery rejection.

Privacy is separated by event type before any public presentation exists. `chat.message` is public. `chat.private-message`, `chat.system-message`, and `operator.message` bypass Multi-Chat. Adapters must never normalize whispers, direct messages, moderator notes, or operator traffic as `chat.message`.

## Multi-Commands

Raw public command text follows the same adapter path as ordinary chat. After validation and deduplication, the bridge applies the single creator-configured prefix, command registry, alias map, quote/escape tokenizer, and role policy. A match produces a correlated `command.received` event immediately after its source `chat.message`; the delivery manager reserves capacity for both events atomically and preserves their sequence order.

This makes the shared parser mandatory for raw chat instead of an optional adapter utility. A transport may emit `command.received` directly only when the upstream integration already supplies a structured command name and string argument array. `command.private-received` and `operator.command-received` remain distinct and bypass the public Streamer.bot package.

## Multi-Alerts

Multi-Alerts consumes only normalized public engagement event types. Shared logic maps event types to portable alert categories without platform checks. Every public alert requires a stable upstream source event ID before deduplication, so two legitimate identical donations or gifts cannot collide through the payload-fingerprint fallback. Monetary amounts remain validated decimal strings with separate uppercase ISO currencies; quantities and milestone values remain safe integers. Optional text is normalized as inert plain text while Unicode survives.

The package exposes transport uncertainty through `multiAlertVerifiedTransport` and `multiAlertUnverifiedFields`. It deliberately performs no visual rendering, audio, TTS, response routing, global persistence, or platform output. Its manifest classifies actor names, item names, tiers, and messages as untrusted and denies them for speech unless a creator explicitly approves them. Those responsibilities remain in creator Streamer.bot actions and later Meld/Speaker.bot milestones.

## Speaker.bot orchestration

Streamer.bot remains the authorization and composition boundary. A trusted creator action constructs an explicit `speaker*` request and invokes the triggerless Speaker Orchestration package. The package rejects missing approval, raw-event provenance, and simulated events by default. Approved speech uses Streamer.bot's Speaker.bot `TtsSpeak` integration with bad-word filtering forced on; stop, pause, resume, and clear use Speaker.bot's documented localhost UDP interface. No platform event automatically becomes speech.

The package treats only a positive CPH transport result as dispatched. That value confirms a local send, not voice-alias validity, engine acceptance, audio generation, or playback. Cooldowns, request-ID deduplication, URL/markup policy, priority, and speak serialization remain explicit creator-side responsibilities until the roadmap milestones named below provide shared identity and presentation orchestration.

The selected C# path is intentionally asynchronous and exposes no playback-completion or generated-file guarantee. It reports dispatch without claiming that audio finished. Generated duration/file metadata remain explicitly unavailable until a workflow adopts Streamer.bot's native delayed or silent Speaker.bot Speak sub-action.

## Multi-Timed Actions

The local `timed-actions` input adapter owns clock evaluation and emits only normalized `system.timed` events. Every definition uses an independent whole-minute interval measured from the current stream session start, with an optional first-run delay. Stream lifecycle events or authenticated runtime controls open and close that session. Bridge process restarts preserve an active session from persisted state instead of silently resetting its clocks.

Each occurrence has a deterministic source identity derived from timer ID and scheduled timestamp. Fixed definitions carry inert creator payload. Shuffle-container definitions randomly select from the remaining creator-authored messages, persist that pending choice before ingestion, and remove it only after acceptance. No message repeats until the container is exhausted; the next cycle avoids an immediate boundary repeat. `skip` advances past missed occurrences while `fire-once` collapses them into the latest due occurrence.

The Streamer.bot package is projection-only. It validates the receiver-derived payload and exposes timing diagnostics plus inert creator JSON. It has no direct triggers and never chooses or invokes a creator action, writes globals, executes a process, speaks, renders, or sends platform output. Streamer.bot remains the automation decision engine.

Timers are dormant until the first normalized `stream.online` event or an authenticated operator start. The bridge tracks every platform observed online and ends the session only after all of them emit `stream.offline`; this prevents one platform ending early from stopping a multistream session. Token-protected start/stop/pause/resume controls provide an immediate manual override. Pause shifts the persisted session anchor on resume, freezing remaining delays instead of treating paused time as missed runs.

## Deduplication

Identity uses `platform + eventType + source.eventId` when available. Without a source ID, it hashes canonical key-sorted JSON containing platform, type, normalized channel/user names, and payload. Entries expire after `deduplication.ttlMs`, oldest entries are evicted beyond `maxEntries`, and the bounded cache is persisted across restarts by default.

The fallback can collapse two genuinely separate non-alert events with identical normalized content inside the TTL. It can also miss duplicates whose normalized content changes. Public alerts cannot use this fallback: schema validation requires `source.eventId`. The cache is intentionally bounded and is not permanent event storage.
