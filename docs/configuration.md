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

The current output queue is memory-only. A process crash after acceptance but before delivery can lose an in-flight event; production financial adapters remain blocked until a durable outbox is implemented and restart replay is tested. Input adapters must retry bounded capacity responses with backoff rather than silently discarding them.

`streamerbot.testMode=true` is non-live: it performs no WebSocket connection and no action execution. Remote Streamer.bot URLs require `allowRemote=true`, and remote connections must use `wss://`. URLs containing credentials or query parameters are rejected; secrets belong in environment variables.

## Commands

`commands` is the creator-facing source of truth for public chat commands. It defines one prefix and a bounded list of canonical names, aliases, minimum roles, and bot policy. Startup validation rejects invalid prefixes and every name/alias collision before an adapter starts.

Production chat adapters emit raw public messages as `chat.message`. The bridge centrally applies this configuration and the shared tokenizer, then emits an ordered, correlated `command.received` event when the message matches a configured command. Adapters must not independently split raw chat text. A direct `command.received` event is reserved for integrations that already provide a structured command name and string argument array rather than raw chat.

Cooldowns and spam limits are deliberately absent until Milestone 9 provides cross-platform viewer identity. Adding a per-platform cooldown earlier would allow the same person to bypass it through another platform account.

## Timed actions

`timedActions.stateFile` stores session timing and each container's remaining message indexes; it does not retain viewer data. Definitions have a unique lowercase `id`, creator-facing `name`, `enabled` flag, independent `everyMinutes`, optional `firstRunAfterMinutes`, missed-run policy, bounded JSON payload, and selection mode.

Use `selection: { "mode": "fixed" }` for an ordinary timed payload. Use `selection: { "mode": "shuffle-container", "messages": ["...", "..."] }` to select one unused creator message per occurrence. The bag persists across sessions and restarts; it resets only after every message has been accepted once. `skip` advances past occurrences missed during a crash, while `fire-once` emits the latest due occurrence. Disable either the definition or the `timers` input without deleting settings.

The example contains no definitions. This is intentional: installing or starting the bridge must not create surprise timed automation.

Timers do not arm merely because the bridge process is running. A normalized `stream.online` event starts the session; the session stops only after every observed live platform reports `stream.offline`. Until production adapters supply those events, call `scripts\timed-actions.ps1 -Operation start` from the trusted Streamer.bot Stream Online action and `-Operation stop` from Stream Offline. Operators can use `pause` and `resume` at any time without restarting the service. All four HTTP controls require the local bearer token.

## Browser overlay

`browserOverlay.enabled` controls public browser-event broadcasting. `brandLabel` customizes or hides the combined-layout heading, `maxChatMessages` bounds browser-only chat retention, `maxAlertQueue` bounds waiting visual alerts with a lowest-priority/oldest-first discard policy, `alertDurationMs` controls visual display time, and `showBots`/`showSimulated` provide explicit presentation filters. These settings are non-secret and available to the local browser layer through `/overlay/config`. The deprecated `meldOverlay` key is automatically migrated for `0.9.0` configuration compatibility.

User presentation metadata accepts HTTPS-only avatar and badge icon URLs, six-digit hex name colors, and at most 16 bounded badges. Subscription presentation accepts explicit new/renewal/upgrade, month, streak, gift, and gifter fields; values are never inferred from unrelated platform data.

## Viewer identity and progression

`viewerIdentity` is disabled by default. `links` explicitly map verified platform user IDs to creator-selected lowercase viewer IDs; validation rejects duplicate viewer IDs and any account assigned more than once. Unlinked stable IDs become platform-scoped SHA-256 pseudonyms. The state path, processed-event TTL/count, simulated-event policy, fixed points, per-event cooldowns, and strictly increasing level thresholds are bounded and runtime-validated.

Names, display names, avatars, messages, raw payloads, and raw account IDs are never written to progression state. Default chat points have a 60-second cooldown keyed by the unified identity. Monetary values never determine progression points.

## Ports

| Component | Default | Bind | Purpose |
|---|---:|---|---|
| Bridge diagnostics and overlay | 8787 | `127.0.0.1` | Diagnostics, token-protected controls, fixed browser assets, and loopback-only overlay events |
| Streamer.bot WebSocket | 8080 | `127.0.0.1` | Outbound action delivery |

Non-loopback bridge binding requires the explicit `allowNetworkAccess` opt-in. A port conflict fails startup with the host and port in the error.
