# Milestone Checklist

This checklist is the source of truth for THSV StreamBridge milestone completion. A milestone is checked only after its acceptance criteria have been implemented and verified. Pending milestones are not implied to be partially complete.

## Milestone 1 — Bridge Core

Status: **Complete** — verified on July 15, 2026 against version `0.2.0` and implementation baseline `c537fdb`.

- [x] Repository exists at `F:\The Hidden Sloth Village\THSV StreamBridge` and tracks `surakage/THSV-StreamBridge`.
- [x] Local service starts successfully.
- [x] Configuration can independently enable or disable adapters.
- [x] Health and readiness endpoints report service and adapter status.
- [x] The event validator accepts valid normalized events.
- [x] Invalid events are rejected with a readable HTTP 400 error.
- [x] Duplicate event IDs are accepted once and ignored on subsequent ingestion.
- [x] Simulated Twitch, YouTube, Kick, TikTok, and Facebook events can be generated.
- [x] Valid events are forwarded to the Streamer.bot test action.
- [x] Runtime activity uses structured, redacted JSON logs.
- [x] No credential-like secrets are committed; runtime credentials and control tokens are ignored.
- [x] Windows startup and shutdown scripts work.
- [x] All unit and integration tests pass.
- [x] Documentation explains deterministic testing without accounts, live streams, or a running Streamer.bot instance.

Verification evidence:

- `scripts\test.ps1`: lint, typecheck, 16 test files, and 47 tests passed.
- Live service: `/health` returned `healthy` and `/ready` returned `ready`.
- Live delivery: five representative fixtures were queued and delivered to Streamer.bot with zero failures.
- Duplicate check: the second Kick event returned `duplicate: true`, `delivery: none`, and no outputs.
- Invalid-event check: an empty event returned HTTP 400 with `Request body is not a valid normalized event`.
- Structured-log check: all 58 non-empty lines in the verification log parsed as JSON.
- Lifecycle check: the bridge started with `scripts\start.ps1` and port 8787 closed after `scripts\stop.ps1`.
- Offline testing instructions are in [Testing](testing.md) and the root README.

## Milestone 2 — Streamer.bot Package Foundation

Status: **Complete** — verified on July 16, 2026 against bridge version `0.3.1`, receiver package `1.0.1`, and Streamer.bot `1.0.5-alpha.31`.

- [x] A versioned Streamer.bot receiver package, manifest, reviewed C# source, and import file are tracked in the repository.
- [x] The portable package uses a stable action alias and group without relying on an installation-specific action GUID.
- [x] The receiver accepts normalized event JSON and validates the required envelope before exposing it to later actions.
- [x] The bridge and receiver share a stable, platform-neutral argument contract.
- [x] Validation failures are readable, and the receiver does not write raw event payloads to logs.
- [x] The receiver C# compiles in the target Streamer.bot Alpha release.
- [x] The exported import package decodes to the reviewed source and is checked by automated tests.
- [x] The Windows release package includes the Streamer.bot package and its installation guide.
- [x] A live simulated event completes the receiver action and exposes validated package variables.
- [x] Automated unit and integration tests cover the bridge contract, export contents, and live delivery request shape.

Verification evidence:

- `scripts\test.ps1`: lint, typecheck, 19 test files, and 51 tests passed.
- Streamer.bot compile: the receiver's `Execute C# Code` sub-action compiled successfully.
- Export integrity: the `.sb` import decodes with the `SBAE` header and contains the exact reviewed `ReceiveEvent.cs` source.
- Live delivery: the action completed with 24 variables, including `streamBridgeValid=True`, contract/schema version `1.0.0`, receiver package version `1.0.1`, platform `twitch`, and source adapter `mock`.
- Review hardening: the wire request contains only `streamBridgeEvent`; a spoofed invalid request was rejected with `streamBridgeValid=False`, a readable error, empty platform/user outputs, and `{}` payload.
- Runtime compatibility: ISO 8601 timestamps are preserved as strings during Json.NET parsing, and a `2026-07-16T05:15:00.000Z` event validated successfully.
- Delivery diagnostics: one event was enqueued and delivered with zero failures.
- Lifecycle check: the bridge stopped successfully after live verification.
- Installation and offline verification instructions are in [Streamer.bot setup](streamerbot-setup.md) and the package [README](../packages/streamerbot/core-receiver/README.md).

## Project Milestones

- [x] Milestone 1 — Bridge Core
- [x] Milestone 2 — Streamer.bot Package Foundation
- [ ] Milestone 3 — Multi-Chat
- [ ] Milestone 4 — Multi-Commands
- [ ] Milestone 5 — Multi-Alerts
- [ ] Milestone 6 — Speaker.bot Orchestration
- [ ] Milestone 7 — Multi-Timed Actions
- [ ] Milestone 8 — Meld Overlay Hub
- [ ] Milestone 9 — Viewer Identity and Progression
- [ ] Milestone 10 — Games and Companion Systems
- [ ] Milestone 11 — Installer and Public Release
