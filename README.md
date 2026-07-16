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

TikFinity, Meld Studio, and Speaker.bot production transports are deliberately deferred. TikFinity fixtures are marked unverified.

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

See the [milestone checklist](docs/milestones.md), [setup](docs/setup.md), [architecture](docs/architecture.md), [configuration](docs/configuration.md), [testing](docs/testing.md), [security](docs/security.md), [troubleshooting](docs/troubleshooting.md), and [Streamer.bot setup](docs/streamerbot-setup.md).

## License

No open-source license has been selected. The current `LICENSE` file is an all-rights-reserved placeholder, not an open-source grant.
