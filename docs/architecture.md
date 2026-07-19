# Architecture

```text
platform/integration -> adapter -> schema validation -> normalization
                     -> TTL deduplication -> durable output outbox
                     -> internal event bus/module routing
                     -> Streamer.bot acknowledgement/actions
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

Accepted output obligations are persisted before local subscribers receive the event. The durable outbox replays pending records after restart, retries with bounded exponential backoff, and retains exhausted records in a bounded dead-letter queue. Ordering is FIFO within a platform/channel lane; separate lanes may progress concurrently. This is an at-least-once boundary: a crash between a downstream acknowledgement and its atomic removal can replay the event, so stable event IDs remain the downstream idempotency key.

Input adapters that emit from a WebSocket, IRC, timer, SDK, or other background callback must await `AdapterContext.emit()` or attach an explicit rejection handler. An individual emission failure is adapter-local state and must never become an unhandled promise rejection. The mock adapter is HTTP-driven; this rule becomes mandatory when the first real-time input adapter is added.

## Normalized event

Schema version `1.0.0` requires identity, type, platform, source, receive time, channel, payload, and metadata. User data is conditional. Standard event names remain documented, while lowercase namespaced event types and new platform identifiers provide an extension point. Adapter authors can use `buildNormalizedEvent` for consistent boilerplate.

Raw payloads are discarded unless `security.preserveRawPayloads` is explicitly enabled. Log redaction always removes fields named like credentials or raw payloads.

## Multi-Chat

The core receiver remains the only Streamer.bot action that parses the normalized envelope. Multi-Chat runs inline after that receiver and consumes only its validated `streamBridge*` argument stack. It does not read Twitch, YouTube, Kick, TikTok, or TikFinity payload shapes.

`bridge/core/multi-chat.ts` is the TypeScript reference contract for adapter and test authors. The versioned Streamer.bot package implements the same projection at the automation boundary: event identity, validated timestamp, process-local arrival sequence, explicit public visibility, normalized platform/channel/user identity, actor provenance, plain-text message, role flags, and simulated status. Non-chat events are successful no-ops, while invalid chat semantics fail with a readable feature-level error.

The bridge assigns `metadata.bridgeSequence` only after validation and deduplication, overwriting any caller value. The receiver and feature actions are stateless and export with concurrent execution enabled, so one slow invocation cannot hold the global event pipeline. Multiple delivery requests may therefore complete out of order; consumers reconstruct accepted arrival order with the feature sequence, receive timestamp, and event ID. Sequence numbers reset when the bridge restarts and may contain gaps after later delivery rejection.

Privacy is separated by event type before any public presentation exists. `chat.message` is public. `chat.private-message`, `chat.system-message`, and `operator.message` bypass Multi-Chat. Adapters must never normalize whispers, direct messages, moderator notes, or operator traffic as `chat.message`.

## Multi-Commands

Raw public command text follows the same adapter path as ordinary chat. After validation and deduplication, the bridge applies the single creator-configured prefix, command registry, alias map, quote/escape tokenizer, and role policy. A match produces a correlated `command.received` event immediately after its source `chat.message`; the delivery manager reserves capacity for both events atomically and preserves their sequence order.

This makes the shared parser mandatory for raw chat instead of an optional adapter utility. A transport may emit `command.received` directly only when the upstream integration already supplies a structured command name and string argument array. `command.private-received` and `operator.command-received` remain distinct and bypass the public Streamer.bot package.

## Multi-Alerts

Multi-Alerts consumes only normalized public engagement event types. Shared logic maps event types to portable alert categories without platform checks. Every public alert requires a stable upstream source event ID before deduplication, so two legitimate identical donations or gifts cannot collide through the payload-fingerprint fallback. Monetary amounts remain validated decimal strings with separate uppercase ISO currencies; quantities and milestone values remain safe integers. Optional text is normalized as inert plain text while Unicode survives.

The package exposes transport uncertainty through `multiAlertVerifiedTransport` and `multiAlertUnverifiedFields`. It deliberately performs no visual rendering, audio, TTS, response routing, global persistence, or platform output. Its manifest classifies actor names, item names, tiers, and messages as untrusted and denies them for speech unless a creator explicitly approves them. Those responsibilities remain in creator Streamer.bot actions and the Browser Overlay Hub/Speaker.bot milestones.

## Multi-Timed Actions

The local `timed-actions` input adapter owns clock evaluation and emits only normalized `system.timed` events. Every definition uses an independent whole-minute interval measured from the current stream session start, with an optional first-run delay. Stream lifecycle events or authenticated runtime controls open and close that session. Bridge process restarts preserve an active session from persisted state instead of silently resetting its clocks.

Each occurrence has a deterministic source identity derived from timer ID and scheduled timestamp. Fixed definitions carry inert creator payload. Shuffle-container definitions randomly select from the remaining creator-authored messages, persist that pending choice before ingestion, and remove it only after acceptance. No message repeats until the container is exhausted; the next cycle avoids an immediate boundary repeat. `skip` advances past missed occurrences while `fire-once` collapses them into the latest due occurrence.

The Streamer.bot package is projection-only. It validates the receiver-derived payload and exposes timing diagnostics plus inert creator JSON. It has no direct triggers and never chooses or invokes a creator action, writes globals, executes a process, speaks, renders, or sends platform output. Streamer.bot remains the automation decision engine.

Timers are dormant until the first normalized `stream.online` event or an authenticated operator start. The bridge tracks every platform observed online and ends the session only after all of them emit `stream.offline`; this prevents one platform ending early from stopping a multistream session. Token-protected start/stop/pause/resume controls provide an immediate manual override. Pause shifts the persisted session anchor on resume, freezing remaining delays instead of treating paused time as missed runs.

## Browser Overlay Hub

The overlay hub subscribes to the accepted internal event stream and projects only public chat, public alerts, and correlated message-removal events. It never forwards normalized events wholesale. The browser channel is a loopback-only WebSocket on `/overlay/events`; the fixed browser assets and non-secret client configuration share the diagnostics HTTP origin.

Chat and alert projections reuse the reviewed shared contracts, then add presentation-only metadata. The browser uses DOM node construction and `textContent`, has a restrictive Content Security Policy, bounds chat retention, and removes moderated messages by their stable event ID. Alert ordering is a visual type-priority queue; it does not infer financial importance and does not claim Speaker.bot playback control. Private, system, operator, and command event types are excluded before broadcast.

The combined, Chat-only, and Alerts-only pages are independent layout surfaces. Pages in the same Chromium/CEF browser-source host connect to one same-origin `SharedWorker`; that worker owns one WebSocket and distributes projected events to the pages. Hosts that isolate sources or do not implement `SharedWorker` fall back to one reconnecting WebSocket per page without changing the event contract.

## Module host

The service composes built-in projections through `ModuleRegistry`. Manifests define dependencies and event subscriptions; dependency order is deterministic, event-handler failures are isolated, and health is reported per module. Required built-ins participate in readiness. Optional add-ons may later use the same contracts, but archived progression, Bloom, and Speaker.bot implementations are inert and are never imported by core.

## Channel rewards

Twitch and Kick reward redemptions enter through the native platform intake and are projected into a bounded v2 reward contract only after a stable source ID, bridge sequence, actor, reward identity, and nonnegative cost are validated. Twitch administration is a separate creator-approved, authenticated action path. Kick remains intake-only; unsupported mutations are never inferred or attempted.

## Add-on module manager

Optional add-ons install beneath an isolated add-on root through schema validation, safe resolved-path checks, staged atomic writes, rollback, and manifest compatibility checks. Add-ons declare their dependencies, subscriptions, capabilities, owned storage, migrations, and health checks. A failed optional add-on is isolated from required core modules and cannot silently expand the core contract.

Package verification is repeated after copying into a creator-private staging directory and again after migration, immediately before activation. This closes the verify-then-copy gap and prevents a migration from rewriting activated module code without a matching manifest hash. Add-ons are still trusted local code with the bridge process's permissions; package hashes provide integrity, while release provenance provides publisher authentication.

Executable modules use a loader-owned capability broker for supported access to namespaced state, bounded one-shot schedules, exact creator-approved Streamer.bot actions over the bridge's existing correlated WebSocket, and namespaced overlay publication. Per-module action concurrency and rolling rate limits prevent one add-on from consuming the shared request pool. The Core Receiver action is never grantable. The fixed `/overlay/addons/<module-id>` renderer shares the existing overlay transport and never serves package HTML or JavaScript.

## Deduplication

Identity uses `platform + eventType + source.eventId` when available. Without a source ID, it hashes canonical key-sorted JSON containing platform, type, normalized channel/user names, and payload. Entries expire after `deduplication.ttlMs`, oldest entries are evicted beyond `maxEntries`, and the bounded cache is persisted across restarts by default.

The fallback can collapse two genuinely separate non-alert events with identical normalized content inside the TTL. It can also miss duplicates whose normalized content changes. Public alerts cannot use this fallback: schema validation requires `source.eventId`. The cache is intentionally bounded and is not permanent event storage.
