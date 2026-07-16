# Troubleshooting

## Startup reports a port conflict

Another process owns the configured diagnostics port. Run `Get-NetTCPConnection -LocalPort 8787` or change `service.port`.

## Readiness is not ready

Open `http://127.0.0.1:8787/diagnostics`. Disabled adapters do not block readiness. Any enabled adapter that is not connected, a deferred placeholder, or an output crossing its delivery-failure threshold blocks readiness.

`health.ps1` reports not-ready responses without dumping a PowerShell web exception.

## Streamer.bot is unavailable

Confirm its WebSocket server is started and its address, port, endpoint, and authentication match configuration. Test mode performs no network connection.

## Service exits during startup

Inspect `data/logs/service.stderr.log` and `data/logs/streambridge.log`. Run configuration validation and build directly for detailed errors.

## Stale PID file

`stop.ps1` removes a stale PID file. It refuses to stop a live process unless its command line identifies the Bridge service.
