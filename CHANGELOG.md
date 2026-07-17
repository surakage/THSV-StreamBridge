# Changelog

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project intends to use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.8] - 2026-07-16

### Fixed

- Limited standalone Chat to eight visible cards by default and faded the oldest card when the next message arrives.
- Added a larger bottom-safe area so the newest chat card remains fully visible after a browser source is cropped.

## [0.9.7] - 2026-07-16

### Fixed

- Applied the standalone Chat clarity treatment to Alerts with an opaque high-contrast card, crisp type, and an opacity-only entrance.
- Made standalone Alerts use a centered, bounded card on a full 1920 by 1080 browser canvas so broadcasting apps can crop transparent space without squeezing the webpage.
- Versioned the shared browser-event worker so updated overlay pages cannot remain attached to a stale event session after a source reload.

## [0.9.6] - 2026-07-16

### Fixed

- Replaced translucent blur on standalone Chat cards with an opaque high-contrast surface for crisp browser-source text.
- Made the Chat container fit narrow and wide source viewports without stretching text or changing card proportions.
- Replaced the translated arrival animation with an opacity-only transition to avoid compositor softening after messages settle.

## [0.9.5] - 2026-07-16

### Fixed

- Made the plain `/overlay/chat` URL use the Meld-safe, full-canvas layout without query-string sizing parameters.
- Removed vertical scale compensation so chat cards preserve their proportions at every browser-source size.
- Increased standalone chat readability with responsive card widths, spacing, names, labels, and message text.
- Disabled browser caching for overlay assets and added query-safe HTTP routing so broadcasting apps reliably receive overlay updates.

## [0.9.4] - 2026-07-16

### Fixed

- Added a canvas-native Chat layout for Meld Studio so its editor-controlled browser viewport no longer compresses chat inside a tall layer.
- Preserved the fill-source layout as `?layout=compact` for OBS Studio, Streamlabs Desktop, and hosts with explicit browser viewport sizing.

## [0.9.3] - 2026-07-16

### Fixed

- Kept the standalone Chat source transparent when empty and bottom-anchored message cards instead of stretching the chat panel across the entire browser-source canvas.

## [0.9.2] - 2026-07-16

### Added

- Independently movable Chat-only and Alerts-only browser-source URLs alongside the existing combined overlay.
- A same-origin `SharedWorker` that multiplexes separate overlay sections over one WebSocket when supported, with a safe direct-connection fallback for isolated browser-source hosts.

## [0.9.1] - 2026-07-16

### Changed

- Generalized Meld-specific naming into the Browser Overlay Hub for Meld Studio, OBS Studio, Streamlabs Desktop, and compatible Chromium/CEF browser sources.
- Renamed creator configuration to `browserOverlay` while automatically migrating the deprecated `meldOverlay` key.
- Preserved the existing `http://127.0.0.1:8787/overlay/` URL and event contract.

## [0.9.0] - 2026-07-16

### Added

- Local cross-compatible Browser layer/source and loopback-only public event WebSocket.
- Context-safe unified chat with bounded retention and moderation/deletion correlation.
- Priority-aware visual alert queue with explicit subscription lifecycle and gift provenance fields.
- HTTPS avatar/badge metadata, validated name colors, role badges, bot and simulated-event controls.
- Browser CSP, projection, injection-sink, fixed-asset, and live loopback WebSocket tests.

## [0.8.1] - 2026-07-16

### Added

- Timed actions remain dormant until an explicit session start or normalized `stream.online` event.
- Multi-platform live tracking stops timers only after every observed live platform goes offline.
- Token-protected runtime start, stop, pause, and resume endpoints plus a PowerShell operator script.
- Pause freezes the remaining interval instead of creating catch-up promotional messages.

## [0.8.0] - 2026-07-16

### Added

- Session-relative local scheduling with independent creator-configured minute intervals.
- Persistent shuffle-container message selection with no repeats until every configured message is used.
- Streamer.bot timestamp parsing preserves ISO strings instead of allowing Json.NET date coercion.
- Explicit skip or single-catch-up behavior with occurrence, missed-run, and lateness diagnostics.
- Atomic completed-occurrence state and deterministic scheduled-event identities.
- Platform-neutral `system.timed` projection and a triggerless concurrent Multi-Timed Actions Streamer.bot package.
- Deterministic scheduler, persistence, contract, safety, fixture, and export-integrity tests.

## [0.7.1] - 2026-07-16

### Changed

- Speaker Orchestration now requires a positive CPH transport result before reporting `speakerDispatched=True`.
- Dispatch documentation distinguishes local UDP send success from voice-alias validation, engine acceptance, audio generation, and playback.
- Creator-side cooldown, stable request-ID deduplication, URL/markup transformation, and speak serialization responsibilities are explicit; priority, caption timing, and audio ducking are carried into the appropriate future milestones.

## [0.7.0] - 2026-07-16

### Added

- Platform-neutral Speaker.bot orchestration contract for speak, stop, pause, resume, and clear operations.
- Triggerless, concurrent Streamer.bot package using the official `TtsSpeak` integration and Speaker.bot localhost UDP queue controls.
- Default-deny speech safety: explicit creator approval, approved text provenance, forced bad-word filtering, simulated-event blocking, and no-audio dry runs.
- Honest generated-audio metadata outputs that remain unavailable on the selected C# dispatch path.
- Automated contract, safety, source-integrity, and reproducible-export tests.

## [0.6.1] - 2026-07-16

### Added

- Schema-level stable source-event-ID requirement for public alerts, preventing legitimate repeated financial or engagement alerts from colliding in fallback deduplication.
- Machine-readable Multi-Alerts content-safety policy that classifies creator-controlled text as untrusted and defaults speech to denied until explicitly approved.
- Regression coverage proving a stalled delivery does not prevent a later delivery from completing when concurrency is available.
- A bounded `simulate:burst` tool for repeatable 2–100 event live Streamer.bot pressure checks with unique source identities.
- Serialized, sequence-aware accepted-state snapshots so concurrent Windows writes cannot race atomic renames or let an older event overwrite newer status.

### Changed

- Core Receiver, Multi-Chat, Multi-Commands, and Multi-Alerts exports now enable concurrent stateless invocations so one slow event cannot serialize the entire receiver pipeline.
- Streamer.bot package patch versions are now Core Receiver `1.0.3`, Multi-Chat `1.1.1`, Multi-Commands `1.0.1`, and Multi-Alerts `1.0.1`.

## [0.6.0] - 2026-07-16

### Added

- Platform-neutral Multi-Alerts projection for follows, subscriptions, memberships, gifted subscriptions, gifts, donations, cheers, Super Chats, raids, and milestones.
- Versioned Multi-Alerts Streamer.bot package with reviewed C# source and reproducible import.
- Exact decimal-string money validation, ISO currency codes, safe quantities, inert Unicode text, actor identity, and transport-verification outputs.
- Twitch follow fixture and comprehensive alert contract/package tests.

### Changed

- TikFinity like/share fixtures now use the standard `engagement.milestone` contract with explicitly unverified normalized fields.
- Adapter capabilities now represent engagement milestones explicitly.

## [0.5.1] - 2026-07-16

### Added

- Creator-facing command prefix and definition configuration with startup-time alias collision validation.
- Central derivation of structured command events from raw public chat, with deterministic correlation and consecutive bridge sequences.
- Atomic output-capacity reservation for source chat and its derived command.
- Unicode argument, cross-platform derivation, collision, malformed-input deduplication, and batch-capacity tests.

### Changed

- Production adapters must emit raw public command text as `chat.message`; the bridge now owns tokenization for every platform.
- Cooldowns and spam throttles are explicitly blocked on Milestone 9 cross-platform identity rather than being added with bypassable platform-scoped IDs.

## [0.5.0] - 2026-07-16

### Added

- Platform-neutral Multi-Commands parsing and projection contract with canonical names, aliases, quoted arguments, and explicit input limits.
- Portable role and bot authorization results while leaving final command behavior in Streamer.bot.
- Public, private, and operator command event boundaries.
- Versioned Multi-Commands Streamer.bot package with reviewed C# source and reproducible import.
- Five-platform simulated command fixtures plus parser, permission, privacy, inert-input, and package-integrity tests.

## [0.4.1] - 2026-07-16

### Added

- Process-local bridge arrival sequences that overwrite caller values after deduplication and let consumers reconstruct cross-platform order.
- Multi-Chat event ID, received timestamp, sequence, public visibility, actor type, and bot provenance outputs.
- Standard private chat, system chat, and operator message event types that never enter the public Multi-Chat path.
- Deterministic sequence, privacy-boundary, actor-provenance, and 100-event burst tests.

### Changed

- Core receiver package updated to `1.0.2` with argument contract `1.1.0`.
- Multi-Chat package and contract updated to `1.1.0`.
- Streamer.bot export generation preserves stable action and C# sub-action IDs across package upgrades.

## [0.4.0] - 2026-07-16

### Added

- Platform-neutral Multi-Chat projection contract for Twitch, YouTube, Kick, TikTok, Facebook, and future registered platforms.
- Versioned `THSV StreamBridge - Multi-Chat` Streamer.bot package with reviewed C# source and reproducible import generation.
- Plain-text normalization, message-length validation, user-role flags, defensive argument initialization, and readable feature-level errors.
- Offline chat fixtures for all five planned platforms plus unit and package-integrity coverage.
- Deterministic `package:streamerbot` export builder for reviewed Streamer.bot C# packages.

## [0.3.1] - 2026-07-16

### Fixed

- Streamer.bot requests now send only the normalized event envelope, eliminating redundant unvalidated flattened wire arguments.
- Receiver failure paths clear every derived argument before validation, and identifier/type validation now mirrors the open normalized schema.
- Receiver JSON parsing now preserves ISO 8601 timestamps as strings before validating them in Streamer.bot.
- Streamer.bot package documentation now describes the actual Base64/SBAE/gzip export representation.
- Streamer.bot reconnection backoff now includes bounded equal jitter.

### Added

- Receiver queue, concurrency, dependency, uninstall, compatibility, and manual QA documentation.
- Adapter-author guidance for safely handling asynchronous emissions from real-time callbacks.

## [0.3.0] - 2026-07-15

### Added

- Versioned Streamer.bot core receiver package with a portable import, manifest, reviewed C# source, and installation guide.
- Stable platform-neutral Streamer.bot argument contract with envelope, user, channel, payload, metadata, and correlation fields.
- Export-integrity, contract, and live request-shape tests for the receiver package.

### Changed

- Streamer.bot delivery now forwards the complete receiver argument contract instead of only the raw event, event ID, and event type.
- Windows release packaging now includes the Streamer.bot package directory.

## [0.2.0] - 2026-07-15

### Added

- Token-authenticated, Origin-checked, rate/concurrency-bounded local control endpoints.
- Registry-backed input/output adapters, open platform/output records, namespaced events, and normalization helpers.
- Bounded asynchronous output queues, delivery metrics, failure-aware readiness, pending acknowledgement limits, and persisted deduplication state.
- Tests for security, delivery pressure, lifecycle, persistence, redaction, adapter registration, and failure paths.

### Changed

- Example configuration now defaults to truthful live Streamer.bot delivery; test mode is explicit and visibly non-live.
- Canonical deduplication is stable across payload key order and mixed channel ID availability.
- Post-acceptance state-write failures are reported diagnostically without falsely rejecting delivered or queued events.

## [0.1.0] - 2026-07-15

### Added

- Initial repository scaffold and Bridge Core milestone.
