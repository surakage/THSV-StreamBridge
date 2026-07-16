# Setup

1. Install Node.js 22 or later and Git.
2. Open PowerShell in the repository root.
3. Run `scripts\install.ps1`.
4. Run `scripts\start.ps1`.
5. Run `scripts\health.ps1`; both values should be `healthy` and `ready`.
6. Run `npm run simulate` to submit the Twitch fixture through the mock adapter.
7. Run `scripts\stop.ps1`.

All scripts resolve the repository from `$PSScriptRoot`, so drive letters and spaces are supported.

## Local files

- Runtime PID: `data/runtime/streambridge.pid`
- Atomic status: `data/state/bridge-status.json`
- Bounded structured log: `data/logs/streambridge.log`
- Process output: `data/logs/service.stdout.log` and `service.stderr.log`

These files are ignored by Git.
