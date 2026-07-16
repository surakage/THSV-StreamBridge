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
- [x] Milestone 3 — Multi-Chat
- [x] Milestone 4 — Multi-Commands
- [x] Milestone 5 — Multi-Alerts
- [x] Milestone 6 — Speaker.bot Orchestration
- [ ] Milestone 7 — Multi-Timed Actions (implementation complete; live verification pending)
- [ ] Milestone 8 — Meld Overlay Hub
- [ ] Milestone 9 — Viewer Identity and Progression
- [ ] Milestone 10 — Games and Companion Systems
- [ ] Milestone 11 — Installer and Public Release

## Milestone 3 — Multi-Chat

Status: **Complete and review-hardened** — verified on July 16, 2026 against bridge version `0.4.1`, core receiver `1.0.2`, Multi-Chat package `1.1.0`, and Streamer.bot `1.0.5-alpha.31`.

- [x] One versioned chat contract represents messages from every registered platform without platform checks in shared logic.
- [x] Chat messages require normalized user identity and string `payload.message` data.
- [x] Control characters and whitespace are normalized while Unicode and emoji remain intact.
- [x] Empty and over-2,000-character messages fail with readable errors.
- [x] Common broadcaster, moderator, subscriber, and member roles produce platform-neutral flags.
- [x] Non-chat events bypass Multi-Chat without failing the receiver.
- [x] A portable Streamer.bot Multi-Chat action, manifest, reviewed C# source, and reproducible import are tracked.
- [x] The package consumes only receiver-validated arguments and creates no globals, files, triggers, or platform output.
- [x] Twitch, YouTube, Kick, TikTok, and Facebook offline chat fixtures produce the same contract.
- [x] Unit and package-integrity tests cover valid, invalid, non-chat, Unicode, role, and export cases.
- [x] Streamer.bot compiles the imported C# action and an inline receiver invocation exposes verified `multiChat*` values.
- [x] Installed output exposes event ID, receive timestamp, bridge sequence, public visibility, and actor provenance.
- [x] Public chat excludes private chat, system chat, and operator messages by event type.
- [x] Caller-supplied sequence values are overwritten after deduplication, and consumers can reconstruct accepted arrival order.
- [x] A 100-event burst preserves FIFO delivery start order and respects the configured concurrency bound.

Verification evidence:

- `scripts\package-release.ps1`: clean build, lint, typecheck, configuration validation, 21 test files, and 61 tests passed.
- Package import: Streamer.bot accepted `THSV StreamBridge - Multi-Chat` and the receiver runs it immediately after successful envelope validation.
- Five-platform matrix: Twitch, YouTube, Kick, TikTok, and Facebook fixtures were accepted as new events and delivered to five completed receiver runs with 42 variables each.
- Facebook live output: `multiChatHandled=True`, `multiChatValid=True`, contract/package `1.0.0`, platform `facebook`, the expected viewer identity, and the expected normalized message.
- Kick live output: platform `kick`, role array `["moderator"]`, expected normalized message, and `multiChatIsModerator=True`.
- Lifecycle check: the bridge reported `healthy`/`ready` during the matrix and stopped successfully afterward.
- Review hardening: receiver `1.0.2` compiled successfully after removing an unnecessary `System.Core` dependency exposed by live Alpha compilation.
- Ordering live output: YouTube event `sim-youtube-chat-001` exposed receiver/Multi-Chat sequence `2`, event ID, validated receive timestamp, and `multiChatVisibility=public`.
- Bot live output: `review-bot-chat-001` exposed sequence `3`, `multiChatActorType=bot`, and `multiChatIsBot=True`.
- Privacy live output: `review-private-chat-001` was receiver-valid with sequence `4`, while Multi-Chat returned `multiChatHandled=False`, empty public fields, and no validation error.
- Delivery diagnostics: four review events were delivered with zero failures; readiness remained healthy and the bridge stopped with port 8787 closed.

## Milestone 4 — Multi-Commands

Status: **Complete and review-hardened** — verified on July 16, 2026 against bridge version `0.5.1`, core receiver `1.0.2`, Multi-Commands package `1.0.0`, and Streamer.bot `1.0.5-alpha.31`.

- [x] One versioned command contract represents commands from every registered platform without platform checks in shared logic.
- [x] Canonical command names and case-insensitive aliases resolve deterministically.
- [x] Quoted and escaped arguments are parsed as plain strings with readable malformed-input errors.
- [x] Input, argument-count, argument-length, and command-name limits are enforced.
- [x] Viewer, subscriber/member, moderator, and broadcaster roles map to one permission hierarchy.
- [x] Bot command permission is explicit and defaults to denied.
- [x] Public commands exclude private and operator command types.
- [x] Command arguments remain inert data and are never evaluated or passed to a shell.
- [x] A portable Streamer.bot Multi-Commands action, manifest, reviewed C# source, and reproducible import are tracked.
- [x] Twitch, YouTube, Kick, TikTok, and Facebook fixtures produce the same normalized command contract.
- [x] Automated tests cover aliases, quoting, limits, permissions, bot provenance, privacy, hostile-looking input, and export integrity.
- [x] Streamer.bot compiles the imported C# action and a live five-platform matrix exposes verified `multiCommand*` values.
- [x] One creator-facing prefix and collision-validated definition registry controls raw public command chat across every adapter.
- [x] Raw command chat is tokenized centrally and produces an ordered, correlated `command.received` event without adapter-specific parsing.
- [x] Unicode arguments are preserved and control characters cannot merge separate tokens.
- [x] Source chat and its derived command reserve output capacity atomically.

Verification evidence:

- `scripts\package-release.ps1`: clean build, lint, typecheck, configuration validation, 24 test files, and 93 tests passed.
- Package import: Streamer.bot accepted `THSV StreamBridge - Multi-Commands`, and its reviewed C# source compiled without errors.
- Receiver chain: Multi-Chat and Multi-Commands run immediately after the successful core receiver action, and the saved configuration persists the chain.
- Five-platform matrix: Twitch, YouTube, Kick, TikTok, and Facebook command fixtures produced five completed receiver runs with 80 variables each.
- Facebook live output: `multiCommandHandled=True`, `multiCommandValid=True`, contract/package `1.0.0`, public visibility, platform `facebook`, canonical command `shoutout`, invoked alias `so`, and argument `["ExampleViewer"]`.
- Authorization live output: moderator role, minimum role `moderator`, bots disabled, `multiCommandAuthorized=True`, and reason `authorized`.
- Multi-Chat correctly bypassed command events with `multiChatHandled=False`, proving the package chain remains event-specific.
- Delivery diagnostics: five events enqueued and delivered, zero failures, queue depth zero, and bridge sequence five.
- Lifecycle check: bridge health/readiness remained healthy/ready during the matrix and port 8787 closed after shutdown.
- Review hardening live output: raw `!so "Example Viewer 🦥"` chat produced two delivered events, consecutive bridge sequences `1` and `2`, one deduplication identity, no failures, and a deterministic derived event ID.

## Milestone 5 — Multi-Alerts

Status: **Complete and review-hardened** — live behavior was verified on July 16, 2026 against bridge versions `0.6.0` and `0.6.1`, package exports Core Receiver `1.0.3`, Multi-Chat `1.1.1`, Multi-Commands `1.0.1`, Multi-Alerts `1.0.1`, and Streamer.bot `1.0.5-alpha.31`.

- [x] One versioned alert contract covers standard follow, subscription, membership, gifted subscription, gift, donation, cheer, Super Chat, raid, and milestone events.
- [x] Shared alert logic contains no platform-specific branches.
- [x] Event ID, receive timestamp, bridge sequence, public visibility, platform, and channel identity are exposed.
- [x] Actor identity is required for actor-driven alerts while actor-free milestones remain valid.
- [x] Monetary amounts use bounded decimal strings with separate uppercase ISO currency codes.
- [x] Quantities and milestone values require bounded safe integers.
- [x] Optional alert text is normalized as inert plain text while preserving Unicode and emoji.
- [x] TikFinity uncertainty is exposed through verified-transport and unverified-field outputs.
- [x] Chat, command, private, operator, and unsupported extension events bypass Multi-Alerts successfully.
- [x] A portable Streamer.bot Multi-Alerts action, manifest, reviewed C# source, and reproducible import are tracked.
- [x] The package creates no globals, files, triggers, response messages, sounds, TTS, shell execution, or platform output.
- [x] Automated tests cover the five-platform matrix, every alert category, money, quantities, Unicode, hostile-looking text, missing fields, privacy boundaries, and package integrity.
- [x] Streamer.bot compiles the imported C# action and a live alert matrix exposes verified `multiAlert*` values.

Verification evidence:

- `scripts\package-release.ps1`: clean build, lint, typecheck, configuration validation, 26 test files, and 110 tests passed.
- Package import: Streamer.bot accepted `THSV StreamBridge - Multi-Alerts`, and its reviewed C# source compiled without errors.
- Receiver chain: Multi-Chat, Multi-Commands, and Multi-Alerts run immediately after the successful core receiver action, and the saved configuration persists the chain.
- Live matrix: Twitch follow, YouTube Super Chat, Kick follow, TikTok gift, Facebook donation, and TikTok milestone fixtures produced six completed receiver runs with 110 variables each.
- Facebook donation output: `multiAlertHandled=True`, `multiAlertValid=True`, actor identity preserved, exact `multiAlertAmount=10.00`, `multiAlertCurrency=USD`, and verified transport with no unverified fields.
- TikTok milestone output: `multiAlertMetric=likes`, `multiAlertValue=100`, no actor required, simulated provenance preserved, and TikFinity-specific uncertainty exposed through verified-transport and unverified-field outputs.
- Delivery diagnostics: six events enqueued and delivered, zero failures, queue depth zero, and bridge sequence six.
- Lifecycle check: bridge health/readiness remained healthy/ready during the matrix, shutdown succeeded, and port 8787 closed afterward.
- Review hardening: every public alert now requires a stable upstream source event ID before deduplication, preventing identical legitimate financial events from colliding through the fallback payload fingerprint.
- Queue hardening: all four stateless Streamer.bot actions export with concurrent execution enabled, and regression tests prove a later delivery can complete while an earlier one is stalled.
- Speech safety: the Multi-Alerts manifest identifies every untrusted text output and defaults speech to `deny-unless-creator-approved`; Milestone 6 must enforce that boundary.
- Live concurrency burst: 25 unique simulated chat events were accepted and delivered with zero failures and queue depth returning to zero; Streamer.bot action-history entries started in the same second rather than waiting on one global serial slot.
- Windows persistence hardening: the first burst exposed concurrent atomic status-file rename failures; sequence-aware serialized snapshots fixed the race, the repeated burst produced no `EPERM`, and the final persisted snapshot retained the highest sequence.

## Milestone 6 — Speaker.bot Orchestration

Status: **Complete and review-hardened** — live-verified on July 16, 2026 against bridge `0.7.1`, Speaker Orchestration package `1.0.1`, Streamer.bot `1.0.5-alpha.31`, and Speaker.bot `0.1.7`.

- [x] Streamer.bot remains the only decision engine that can approve speech or queue control.
- [x] Speak, stop, pause, resume, and clear use one versioned platform-neutral request contract.
- [x] The package has no direct triggers and requires explicit `speakerApproved=True`.
- [x] Raw-event text provenance is rejected; only creator templates or explicitly creator-approved text may speak.
- [x] Speaker.bot bad-word filtering is forced on for every dispatched speech request.
- [x] Simulated requests are denied by default and require an explicit allow flag; dry run validates without audio.
- [x] Voice aliases and messages are creator-supplied, bounded, normalized plain text with Unicode preserved.
- [x] Queue controls reject speech text/voice arguments and remain documented as trusted operator actions.
- [x] Dispatch does not claim playback completion, and unavailable generated-audio metadata is represented honestly.
- [x] A portable concurrent Streamer.bot action, manifest, reviewed C# source, and reproducible import are tracked.
- [x] Automated tests cover approval, provenance, simulation, dry run, limits, Unicode, all controls, safety invariants, and export integrity.
- [x] Streamer.bot compiles the imported action, connects to Speaker.bot, completes a no-audio dry run, and verifies stop/pause/resume/clear against the local queue.

Verification evidence:

- `npm test`, `npm run lint`, and `npm run typecheck`: 28 test files and 123 tests passed with no lint or type errors.
- Compatibility hardening: live Alpha compilation exposed an undeclared `System.Text.RegularExpressions` dependency; the package now performs bounded identifier and plain-text normalization using only the declared runtime references, and the regenerated import compiles successfully.
- Package import: Streamer.bot replaced the earlier action with the corrected triggerless concurrent export and compiled its reviewed C# source without errors.
- Safe dry run: the completed action exposed 31 variables, including `speakerHandled=True`, `speakerValid=True`, empty validation error, contract `1.0.0`, package `1.0.1`, transport `speakerbot-cph`, `speakerDispatched=False`, and `speakerDryRunResult=True`; no audio was produced.
- Local connection: Speaker.bot `0.1.7` ran its WebSocket server at `ws://127.0.0.1:7580` and its fixed UDP listener at localhost port `6669`.
- Queue controls: stop, pause, resume, and clear each completed in Streamer.bot with 26 result variables and no dispatch exception. Speaker.bot's log independently recorded `UDP Pause`, `UDP Resume`, and `UDP Clear`; stop was dispatched while no speech was active, so it correctly had no current speech to terminate.
- Safety evidence: the dry run used creator-authored text, explicit approval, explicit simulated-event permission, and forced bad-word filtering while remaining non-dispatching.
- Focused-review hardening: the C# action now requires a positive `TtsSpeak`/`BroadcastUdp` result before setting `speakerDispatched=True`; zero or negative transport results fail with a readable error.
- Hardened-package live check: Streamer.bot replaced package `1.0.0` with `1.0.1`, compiled the imported C# action on first execution, and completed the safety dry run in 116 ms with no C# error or dispatch.
- Runtime truthfulness check: Streamer.bot returned `151` for a deliberately nonexistent voice alias, proving the integer represents local UDP dispatch rather than Speaker.bot voice acceptance. Documentation now explicitly reserves alias validation and playback acknowledgement instead of overstating success.
- Carried policy: creator actions own speech cooldown, stable request-ID deduplication, URL/markup transformation, and speak serialization; Milestones 8 and 9 own the shared priority/caption/ducking and cross-platform identity decisions respectively.

## Milestone 7 — Multi-Timed Actions

Status: **Implementation complete; live verification pending** — implemented in bridge `0.8.0` with Multi-Timed Actions package `1.0.0`.

- [x] Creator configuration supports uniquely identified independent minute intervals measured from session start.
- [x] Fixed actions and random message containers are selectable per definition.
- [x] Every container message is used once before repetition, with persistent progress and cycle-boundary repeat avoidance.
- [x] Every occurrence has a deterministic source identity and normalized `system.timed` event.
- [x] `skip` and `fire-once` missed-run policies are explicit and test-covered.
- [x] Completed scheduled occurrences persist atomically across restarts without retaining event or viewer content.
- [x] State advances only after bridge ingestion accepts the timed event; failed ingestion is retried.
- [x] The normalized projection exposes scheduled/actual timestamps, lateness, occurrence, collapsed missed runs, sequence, simulation, and inert creator payload.
- [x] The Streamer.bot action is triggerless, concurrent, receiver-dependent, and has no action-execution or global-state side effects.
- [x] Disabled definitions and the disabled timers input remain inactive without deleting configuration.
- [x] Offline simulation and deterministic clock/persistence tests require no live stream or platform credentials.
- [ ] Import package `1.0.0` into Streamer.bot Alpha and confirm the C# action compiles.
- [ ] Deliver the timed fixture live and verify the complete `multiTimed*` output contract in Action History.

Verification evidence:

- `npm test`: 30 test files and 129 tests passed.
- `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run config:validate` passed.
- Deterministic scheduler tests verify independent intervals, no-repeat container exhaustion, persistent bag state, and exact session-relative timing without wall-clock waiting.
- Package-integrity tests prove the portable export contains the reviewed C# source, remains concurrent and triggerless, and contains no action invocation, global writes, process execution, speech, or UDP dispatch.
- Live Streamer.bot import and action-history verification remain the only acceptance items not yet completed.
