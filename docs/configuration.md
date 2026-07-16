# Configuration

`config/bridge.example.json` is the runtime-validated example. Select another file with `THSV_STREAMBRIDGE_CONFIG` or `scripts\start.ps1 -Config <path>`.

Run `scripts\validate-config.ps1` before startup.

## Platforms

Every platform entry preserves `enabled`, input/output flags, adapter provider, capabilities, and bounded reconnect settings even while disabled. Platform keys are open validated identifiers; providers are resolved through the adapter registry. Runtime diagnostics add connection state, last event time, last error, and reconnect attempts.

Capabilities describe the adapter contract, not a promise that deferred transports are implemented.

## Secrets

Configuration stores only environment-variable names. Put the Streamer.bot password in the variable named by `streamerbot.passwordEnv`, never in JSON. The local control API uses an automatically generated token from `security.controlTokenFile`, or an explicit variable named by `security.controlTokenEnv`. `.env` files are ignored, but the service intentionally does not auto-load them.

## Output delivery

`outputs` is an open registry-backed record. Streamer.bot's queue capacity, delivery concurrency, pending acknowledgements, acknowledgement timeout, and failure threshold are bounded in configuration. Accepted HTTP simulation means the event was validated and queued; delivery completion or failure appears in diagnostics.

`streamerbot.testMode=true` is non-live: it performs no WebSocket connection and no action execution. Remote Streamer.bot URLs require `allowRemote=true`, and remote connections must use `wss://`. URLs containing credentials or query parameters are rejected; secrets belong in environment variables.

## Ports

| Component | Default | Bind | Purpose |
|---|---:|---|---|
| Bridge diagnostics | 8787 | `127.0.0.1` | Read-only diagnostics plus token-protected `/simulate` and `/shutdown` |
| Streamer.bot WebSocket | 8080 | `127.0.0.1` | Outbound action delivery |

Non-loopback bridge binding requires the explicit `allowNetworkAccess` opt-in. A port conflict fails startup with the host and port in the error.
