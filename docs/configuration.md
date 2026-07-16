# Configuration

`config/bridge.example.json` is the runtime-validated example. Select another file with `THSV_STREAMBRIDGE_CONFIG` or `scripts\start.ps1 -Config <path>`.

Run `scripts\validate-config.ps1` before startup.

## Platforms

Every platform preserves `enabled`, input/output flags, adapter, capabilities, and bounded reconnect settings even while disabled. Runtime diagnostics add connection state, last event time, last error, and reconnect attempts.

Capabilities describe the adapter contract, not a promise that deferred transports are implemented.

## Secrets

Configuration stores only the environment-variable name in `streamerbot.passwordEnv`. Put the password in that environment variable, never in JSON. `.env` files are ignored, but the service intentionally does not auto-load them.

## Ports

| Component | Default | Bind | Purpose |
|---|---:|---|---|
| Bridge diagnostics | 8787 | `127.0.0.1` | `/health`, `/ready`, `/diagnostics`, `/simulate`, `/shutdown` |
| Streamer.bot WebSocket | 8080 | `127.0.0.1` | Outbound action delivery |

Non-loopback bridge binding requires the explicit `allowNetworkAccess` opt-in. A port conflict fails startup with the host and port in the error.
