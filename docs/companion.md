# Bloom Companion

Milestone 10 adds Bloom, the shared SlothBloom Sprouts companion. It intentionally does not add chat games. Fishing, Trivia, Chat Arena, Predictions, Choose the Adventure, and Companion Care remain candidates for later platform extensions, where richer interaction is a better fit.

## Viewer interactions

| Command | Action | Default cost | Default cooldown |
|---|---|---:|---:|
| `!bloom-wave` | Wave | 0 | 10 seconds |
| `!bloom-feed` | Eat a berry | 25 | 30 seconds |
| `!bloom-rest` | Sleep | 10 | 60 seconds |
| `!bloom-celebrate` | Celebrate | 50 | 60 seconds |

Costs, cooldowns, commands, and happiness/fullness/energy effects are creator configuration. Stats are bounded from 0 to 100. A viewer cannot spend more points than they have. A failed companion-state write rolls Bloom back and automatically refunds the points.

## Enable it

Copy the `companion` block and four Bloom command definitions from `config/bridge.example.json` into the runtime configuration. Set both `viewerIdentity.enabled` and `companion.enabled` to `true`. Leave both `includeSimulated` settings `false` for normal use.

Progression stores pseudonymous viewer IDs and balances locally. Enable it only after choosing and disclosing the channel's viewer-progression policy. TikFinity still lacks verified stable event identity, so TikTok simulation-origin activity must not award or spend production points.

## Browser source

Add `http://127.0.0.1:8787/overlay/companion` as an independent transparent browser source at 1920 by 1080, then crop and position it in Meld Studio, OBS Studio, Streamlabs Desktop, or a compatible browser host.

Chat, Alerts, and Companion use the same `SharedWorker` WebSocket when the host supports it. Isolated hosts safely fall back to one connection per source. Bloom completes each animation and returns to idle before the next queued action starts. `browserOverlay.maxCompanionQueue` bounds the waiting queue.

## Streamer.bot package

Import `packages\streamerbot\companion-actions\THSV-StreamBridge-Bloom-Companion-1.0.0.sb`, accept the reviewed custom C# warning, and add **Run Action Immediately** for `THSV StreamBridge - Bloom Companion` after the Core Receiver succeeds. The action only exposes validated `companion*` arguments; it does not spend points, run creator actions, or persist state.

## Visual test without spending points

With the bridge running and companion enabled:

```powershell
.\scripts\companion.ps1 -Action wave -PerformedBy 'surakage' -Reason 'Milestone 10 visual test'
.\scripts\companion.ps1 -Action eat -PerformedBy 'surakage' -Reason 'Milestone 10 visual test'
.\scripts\companion.ps1 -Action sleep -PerformedBy 'surakage' -Reason 'Milestone 10 visual test'
.\scripts\companion.ps1 -Action celebrate -PerformedBy 'surakage' -Reason 'Milestone 10 visual test'
```

These token-protected requests bypass viewer cost and cooldown only for the visual test, remain visibly simulated, update shared companion stats, and are logged.

For a full points test, add a balance with `scripts\viewer-progression.ps1`, then send a Bloom command from a connected Twitch, YouTube, or Kick chat account. Confirm the source chat, derived command, and `companion.action` have consecutive bridge sequences; the balance decreases exactly once; and Action History exposes the `companion*` fields.

## State and recovery

State is stored atomically at `data/state/companion.json` by default. It contains aggregate stats, interaction count, bounded viewer-action cooldown keys, and timestamps—never chat text, display names, avatars, or raw account IDs. Invalid state degrades only the companion subsystem; chat, commands, alerts, timers, and overlays remain available.
