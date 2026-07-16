# THSV StreamBridge

THSV StreamBridge is a modular, local-first livestream automation foundation. It validates and normalizes events before routing them to Streamer.bot or future adapters without exposing downstream code to platform-specific payloads.

This is a clean rebuild and has no dependency on earlier Streamer.bot, Speaker.bot, overlay, chatbot, or JSON projects.

## Milestone 1

Bridge Core includes:

- A versioned normalized event contract and runtime validation
- Bounded TTL deduplication and an internal event bus
- Independently enabled platform adapters with honest capability reporting
- A deterministic mock adapter and event simulator
- A Streamer.bot WebSocket adapter foundation with authentication, acknowledgements, bounded reconnects, action aliases, and test mode
- Structured redacted logs, bounded log rotation, atomic local state, and graceful lifecycle handling
- Loopback-only HTTP health, readiness, diagnostics, and simulation endpoints
- Deterministic unit and integration tests that need no accounts or live stream

TikFinity, Meld Studio, and Speaker.bot production transports are deliberately deferred. TikFinity fixtures are marked unverified.

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

The checked-in example configuration is safe for local test mode. To create creator-specific settings, copy `config/bridge.example.json`, edit the copy, and pass it to `start.ps1 -Config <path>`. Do not place credentials in JSON.

See [setup](docs/setup.md), [architecture](docs/architecture.md), [configuration](docs/configuration.md), [testing](docs/testing.md), [security](docs/security.md), [troubleshooting](docs/troubleshooting.md), and [Streamer.bot setup](docs/streamerbot-setup.md).

## License

No open-source license has been selected. The current `LICENSE` file is an all-rights-reserved placeholder, not an open-source grant.
