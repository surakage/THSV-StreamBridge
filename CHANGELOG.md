# Changelog

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project intends to use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
