# THSV StreamBridge

THSV StreamBridge is a modular, local-first livestream automation foundation. It validates and normalizes events before routing them to Streamer.bot or future adapters without exposing downstream code to platform-specific payloads.

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
- Deterministic offline fixtures for Twitch, YouTube, Kick, TikTok, and Facebook

Import the package and follow the inline action-chain instructions in the [Multi-Chat package guide](packages/streamerbot/multi-chat/README.md). Production platform transports remain deferred; these fixtures prove the shared contract without claiming live platform API support.

## Milestone 4

Multi-Commands adds:

- Deterministic command parsing with case-insensitive canonical names, aliases, quoted arguments, and explicit limits
- One creator-facing command prefix and definition registry applied centrally to raw chat from every adapter
- Portable viewer, subscriber/member, moderator, broadcaster, and bot authorization policy
- A public command boundary that excludes private and operator commands
- A versioned `THSV StreamBridge - Multi-Commands` Streamer.bot package
- Offline command fixtures for Twitch, YouTube, Kick, TikTok, and Facebook

Import the package and follow the inline action-chain instructions in the [Multi-Commands package guide](packages/streamerbot/multi-commands/README.md). Command arguments remain inert data; Streamer.bot creator actions decide what authorized commands do.

## Milestone 5

Multi-Alerts adds:

- One public alert contract for follows, subscriptions, memberships, gifted subscriptions, gifts, donations, cheers, Super Chats, raids, and milestones
- Exact bounded decimal-string monetary values, ISO currency validation, and safe integer quantities
- Normalized actor identity, event ordering, Unicode-safe inert text, and honest transport-verification metadata
- A versioned `THSV StreamBridge - Multi-Alerts` Streamer.bot package with no rendering, sound, TTS, globals, or platform output
- A triggerless `THSV StreamBridge - Speaker Orchestration` package for creator-approved speech and queue controls with default-deny raw text

Import the package and follow the inline action-chain instructions in the [Multi-Alerts package guide](packages/streamerbot/multi-alerts/README.md). Browser-source presentation is Milestone 8; Speaker.bot orchestration was live-verified in `0.7.0` and review-hardened in `0.7.1`.

Speaker.bot setup and safe dry-run testing are documented in [Speaker.bot setup](docs/speakerbot-setup.md). The orchestration package never speaks raw event fields automatically.

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

## Milestone 9

Viewer Identity and Progression adds:

- Explicit creator-approved account links with no automatic name-based identity guessing
- Stable platform-scoped pseudonyms for unlinked human viewers
- Fixed, creator-configured points and level thresholds with a unified cross-platform chat cooldown
- Atomic local state containing points, timestamps, and event fingerprints but no display names, chat text, or raw platform IDs
- A derived `viewer.progression` contract and projection-only Streamer.bot package
- `multiCommandViewerId` for cooldowns and spam policies that cannot be bypassed merely by switching linked platforms

Identity and progression are disabled by default. Configure them using the [Viewer Identity and Progression guide](docs/viewer-identity.md), then import the updated Core Receiver, Multi-Commands, and Viewer Progression packages.

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

See the [milestone checklist](docs/milestones.md), [setup](docs/setup.md), [architecture](docs/architecture.md), [configuration](docs/configuration.md), [testing](docs/testing.md), [security](docs/security.md), [troubleshooting](docs/troubleshooting.md), [Streamer.bot setup](docs/streamerbot-setup.md), and [Browser Overlay Hub](docs/browser-overlay.md).

## License

No open-source license has been selected. The current `LICENSE` file is an all-rights-reserved placeholder, not an open-source grant.
