# Setup

1. Install Node.js 22 or later and Git.
2. Open PowerShell in the repository root.
3. Run `scripts\install.ps1`.
4. Start Streamer.bot's local WebSocket server, or explicitly enable `streamerbot.testMode` in a runtime-only configuration.
5. Run `scripts\start.ps1` with the selected configuration.
6. Run `scripts\health.ps1`; both values should be `healthy` and `ready`.
7. Run `npm run simulate` to submit the Twitch fixture through the authenticated mock ingress.
8. Run `scripts\stop.ps1`.

All scripts resolve the repository from `$PSScriptRoot`, so drive letters and spaces are supported.

## Local files

- Runtime PID: `data/runtime/streambridge.pid`
- Active configuration pointer and private control token: `data/runtime`
- Atomic status: `data/state/bridge-status.json`
- Bounded structured log: `data/logs/streambridge.log`
- Process output: `data/logs/service.stdout.log` and `service.stderr.log`

These files are ignored by Git.
