# Setup

These steps are for contributors running a source checkout. Public release users should follow [Getting started](getting-started.md) instead; it covers downloading, installing, Streamer.bot wiring, overlays, testing, add-ons, updating, and uninstalling.

1. Install Node.js 22 or later and Git.
2. Open PowerShell in the repository root.
3. Run `scripts\install.ps1`.
4. Start Streamer.bot's local WebSocket server, or explicitly enable `streamerbot.testMode` in a runtime-only configuration.
5. Run `scripts\start.ps1` with the selected configuration.
6. Run `scripts\health.ps1`; both values should be `healthy` and `ready`.
7. Run `npm run simulate` to submit the Twitch fixture through the authenticated mock ingress.
8. Run `scripts\stop.ps1`.

All scripts resolve the repository from `$PSScriptRoot`, so drive letters and spaces are supported.

## Platform support

Twitch, YouTube, and Kick use the included Streamer.bot native relay package; they are not direct platform API adapters. TikTok uses the TikFinity relay with conservative simulated/unverified provenance until live identity behavior is verified. Facebook is not supported. Review the consolidated [compatibility and platform matrix](compatibility.md) before importing packages or enabling progression, financial alerts, or speech.

The bridge installs as one service and unused features remain inert through configuration. Streamer.bot feature packages are separate and may be imported only when needed.

## Local files

- Runtime PID: `data/runtime/streambridge.pid`
- Active configuration pointer and private control token: `data/runtime`
- Atomic status: `data/state/bridge-status.json`
- Bounded structured log: `data/logs/streambridge.log`
- Process output: `data/logs/service.stdout.log` and `service.stderr.log`

These files are ignored by Git.
