# THSV StreamBridge

THSV StreamBridge is a modular, local-first livestream automation foundation. It validates and normalizes events before routing them to Streamer.bot or future adapters without exposing downstream code to platform-specific payloads.

The `overhaul/v2-preview` branch is the isolated `2.0.0-preview.1` development line for the approved revised core scope. Stable `1.x` remains on `main`. Stages 2 through 6 are complete: v2 contracts, compatibility migration preview, excluded-feature extraction, the module host, the authenticated setup wizard, provider-authoritative capability reports, platform controls, scoped blocker rules, Streamer.bot command design and synchronization, and session-relative timed actions are implemented and accepted. See [Stage 2 completion](docs/stage-2-completion.md), [Stage 3 completion](docs/stage-3-completion.md), [Stage 4 completion](docs/stage-4-completion.md), [Stage 5 completion](docs/stage-5-completion.md), [Stage 6 completion](docs/stage-6-completion.md), [Revised product scope](docs/product-scope.md), [v2 contracts](docs/contracts-v2.md), and [module system](docs/module-system.md).

This is a clean rebuild and has no dependency on earlier Streamer.bot, Speaker.bot, overlay, chatbot, or JSON projects.

## Milestone 1

Bridge Core includes:

- A versioned normalized event contract and runtime validation
- Bounded TTL deduplication and an internal event bus
- Independently enabled platform adapters with honest capability reporting
- A deterministic mock adapter and event simulator
- A Streamer.bot output adapter with authentication, acknowledgements, bounded reconnects, action aliases, bounded asynchronous delivery, and explicit test mode
- Structured redacted logs, bounded log rotation, atomic local state, and graceful lifecycle handling
- Token-protected loopback HTTP controls plus health, readiness, diagnostics, and simulation endpoints
- Deterministic unit and integration tests that need no accounts or live stream

TikFinity production transport and direct broadcasting-app scene control are deliberately deferred. TikFinity fixtures are marked unverified.

## Milestone 2

Streamer.bot Package Foundation adds:

- A versioned, portable `THSV StreamBridge - Receive Event` action package
- Reviewed C# receiver source with normalized-event validation
- A stable platform-neutral action-argument contract for future packages
- Automated checks that the exported package contains the reviewed source
- Live validation against Streamer.bot `1.0.5-alpha.31`

Import the package and follow the instructions in the [Streamer.bot receiver package](packages/streamerbot/core-receiver/README.md).

## Milestone 3

Multi-Chat adds:

- One platform-neutral chat projection for every supported normalized `chat.message` event
- A portable `THSV StreamBridge - Multi-Chat` Streamer.bot action package
- Validated plain-text messages, consistent user identity and role flags, and safe non-chat handling
- Deterministic offline fixtures for Twitch, YouTube, Kick, and TikTok

Import the package and follow the inline action-chain instructions in the [Multi-Chat package guide](packages/streamerbot/multi-chat/README.md). Production platform transports remain deferred; these fixtures prove the shared contract without claiming live platform API support.

## Milestone 4

Multi-Commands adds:

- Deterministic command parsing with case-insensitive canonical names, aliases, quoted arguments, and explicit limits
- One creator-facing command prefix and definition registry applied centrally to raw chat from every adapter
- Portable viewer, subscriber/member, moderator, broadcaster, and bot authorization policy
- A public command boundary that excludes private and operator commands
- A versioned `THSV StreamBridge - Multi-Commands` Streamer.bot package
- Offline command fixtures for Twitch, YouTube, Kick, and TikTok

Import the package and follow the inline action-chain instructions in the [Multi-Commands package guide](packages/streamerbot/multi-commands/README.md). Command arguments remain inert data; Streamer.bot creator actions decide what authorized commands do.

## Milestone 5

Multi-Alerts adds:

- One public alert contract for follows, subscriptions, memberships, gifted subscriptions, gifts, donations, cheers, Super Chats, raids, and milestones
- Exact bounded decimal-string monetary values, ISO currency validation, and safe integer quantities
- Normalized actor identity, event ordering, Unicode-safe inert text, and honest transport-verification metadata
- A versioned `THSV StreamBridge - Multi-Alerts` Streamer.bot package with no rendering, sound, TTS, globals, or platform output

Import the package and follow the inline action-chain instructions in the [Multi-Alerts package guide](packages/streamerbot/multi-alerts/README.md). Browser-source presentation is Milestone 8. Speaker.bot orchestration is outside Stage 2 core and is preserved in the future-add-on archive.

## Milestone 7

Multi-Timed Actions adds:

- Creator-configured intervals measured from each stream-session start
- Fixed timed actions or persistent random message containers with no repeats until every message is used
- Explicit `skip` or single catch-up behavior for occurrences missed while the bridge is stopped
- Atomic restart state and deterministic occurrence identities
- Normalized `system.timed` events with scheduled time, actual fire time, lateness, occurrence, and missed-run counts
- A triggerless concurrent `THSV StreamBridge - Multi-Timed Actions` package that exposes inert data while leaving action selection to Streamer.bot

Configure schedules in `timedActions.definitions`, then import the package described in the [Multi-Timed Actions guide](packages/streamerbot/multi-timed-actions/README.md). The example starts with no scheduled definitions, so installing the bridge never creates surprise automation.

## Milestone 8

Browser Overlay Hub adds one local transparent browser source for Meld Studio, OBS Studio, Streamlabs Desktop, and compatible broadcast software, with:

- Unified public chat with bounded in-memory retention and message-deletion correlation
- Context-safe text rendering with no HTML injection sinks
- Platform, role, bot, badge, avatar, and validated name-color presentation
- Priority-aware public alerts with subscription lifecycle and gift provenance fields
- Loopback-only live WebSocket delivery and creator controls for duration, retention, bots, and simulated events
- Independently movable Chat and Alerts browser sources that share one WebSocket when the host supports `SharedWorker`

Use `http://127.0.0.1:8787/overlay/` for the combined canvas, or add `http://127.0.0.1:8787/overlay/chat` and `http://127.0.0.1:8787/overlay/alerts` as independently movable Browser layers/sources. Follow the [Browser Overlay Hub guide](docs/browser-overlay.md). Combined and separate-source rendering are live-verified in Meld Studio and OBS Studio; OBS is the accepted Streamlabs Browser Source compatibility gate.

## Archived future add-ons

The former Viewer Identity and Progression, Bloom Companion, and Speaker.bot Orchestration implementations are no longer core features. Their source, packages, tests, documentation, and assets are preserved under `archive/future-add-ons/` until they can be rebuilt against the public module API. Core does not load their state, expose their endpoints, emit their legacy events, or serve their browser surfaces. See [Future add-ons](docs/future-add-ons.md).

## V2 preview setup wizard

Stages 3 through 6 provide an authenticated loopback wizard at `http://127.0.0.1:8787/wizard/`. Unlock it with the installation token in `data/runtime/control-token`, or import and run the reviewed [Streamer.bot wizard launcher](packages/streamerbot/wizard-launcher/README.md).

Streamer.bot inspection sends only documented `GetActions` and `GetCommands` requests. Creator-approved command administration is limited to commands already tracked by THSV StreamBridge; unrelated commands remain read-only. Configuration drafts cover platform switches, scoped blockers, command settings, and timed actions. One tab holds the mutation lease; commit rechecks the source file hash, validates the complete candidate, creates a backup, writes atomically, verifies the result, and restores the backup on failure. Safe exports omit secrets. Restart StreamBridge after committing configuration.

## TikFinity intake

Bridge `0.10.2` adds a reviewed TikFinity-to-Streamer.bot intake for TikTok chat, follows, gifts, and likes. Import `packages\streamerbot\tikfinity-intake\THSV-StreamBridge-TikFinity-Intake-1.0.0.sb`, keep TikFinity pointed at `127.0.0.1:8080/`, and enable the `tiktok` platform only after the simulator acceptance check in [Streamer.bot setup](docs/streamerbot-setup.md).

TikFinity does not currently document a stable source-event ID or reliable simulator marker. Intake events therefore expose those limitations explicitly and default to simulated until live provenance is verified; do not use them for production progression or financial statistics yet.

## Native Streamer.bot platform intake

Twitch, YouTube, and Kick use one native intake action per platform, each placed in its own Streamer.bot group. Import `packages\streamerbot\native-platform-intake\THSV-StreamBridge-Native-Platform-Intake-1.0.0.sb`, configure the trigger matrix declared in its manifest, and enable each platform with adapter `streamerbot-native`. Native triggers reuse the existing authenticated Streamer.bot WebSocket connection and preserve Streamer.bot's test-event provenance.

## Requirements

- Windows 10 or later
- Node.js 22 or later
- PowerShell 5.1 or later

Docker and a database are not required.

## Install and run

```powershell
Set-Location 'F:\The Hidden Sloth Village\THSV StreamBridge'
.\scripts\install.ps1
.\scripts\start.ps1
.\scripts\health.ps1
npm run simulate
.\scripts\stop.ps1
```

The checked-in example uses live Streamer.bot delivery and will report not-ready until Streamer.bot's WebSocket server is available. For a network-free check, copy the configuration and explicitly set `streamerbot.testMode` to `true`. Test mode is clearly reported as non-live in diagnostics and never contacts Streamer.bot.

To create creator-specific settings, copy `config/bridge.example.json` into `data/runtime`, edit the copy, and pass it to `start.ps1 -Config <path>`. Do not place credentials in JSON. A per-installation control token is generated automatically in ignored runtime storage.

See the [Stage 2 completion record](docs/stage-2-completion.md), [Stage 3 completion record](docs/stage-3-completion.md), [Stage 4 completion record](docs/stage-4-completion.md), [Stage 5 completion record](docs/stage-5-completion.md), [Stage 6 completion record](docs/stage-6-completion.md), [milestone checklist](docs/milestones.md), [setup](docs/setup.md), [architecture](docs/architecture.md), [configuration](docs/configuration.md), [testing](docs/testing.md), [security](docs/security.md), [troubleshooting](docs/troubleshooting.md), [Streamer.bot setup](docs/streamerbot-setup.md), [Browser Overlay Hub](docs/browser-overlay.md), and [Future add-ons](docs/future-add-ons.md).

For a versioned archive, checksum verification, state-preserving upgrades, and uninstall instructions, use the [Installer and public release guide](docs/release.md).

Latest stable release: [THSV StreamBridge v1.0.1](https://github.com/surakage/THSV-StreamBridge/releases/tag/v1.0.1).

## License

THSV StreamBridge is open-source software licensed under the [MIT License](LICENSE).

Archived Bloom asset provenance and production dependency licenses are documented in [Asset and third-party notices](THIRD-PARTY-NOTICES.md).
