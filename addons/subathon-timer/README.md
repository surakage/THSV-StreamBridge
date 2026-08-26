# Subathon Timer

Version 2.4 tracks normalized events from Twitch, YouTube, Kick, TikTok, Streamlabs, and Ko-fi while keeping every new award creator-controlled:

- YouTube Jewels and other normalized gifts use the existing per-gift-unit setting.
- Twitch Bits and Custom Power-Ups accumulate through a configurable threshold without repeating completed thresholds.
- Streamlabs/Ko-fi donations and purchases can award time only in one selected currency; no currency conversion is inferred.
- Financial events require a verified provider event ID by default.
- Hype Train levels are counted once per train and level. Watch Streak and Modiversary awards are separate settings.
- Streamer.bot test events do not alter the timer unless the creator explicitly enables them.

New financial and Twitch milestone award values default to `0`, so upgrading cannot unexpectedly change a running timer. The add-on stores bounded counters only; it does not retain viewer identities, messages, purchase items, or payout records.

This add-on keeps one bounded cross-platform subathon countdown using normalized StreamBridge events.

## Streamer.bot controls

Import `THSV-StreamBridge-Subathon-Timer-4.0.8.sb` from this add-on's release bundle. It creates Start, Pause, Resume, Reset, and Add Time actions inside `THSV StreamBridge - Add-ons`. Attach them to hotkeys, deck buttons, or scene triggers. Add Time defaults to 300 seconds; edit that action's Set Argument value when you need a different amount.

The imported actions send a tightly scoped local `addon.thsv.subathon-timer.control` relay. The older normalized `system.custom` shape remains supported for compatibility:

- `eventType`: `system.custom`
- `platform`: `streamerbot`
- `payload.moduleId`: `thsv.subathon-timer`
- `payload.action`: `start`, `pause`, `resume`, `reset`, or `add-time`
- `payload.seconds`: required only for `add-time`

Example payload:

```json
{
  "schemaVersion": "1.0.0",
  "eventId": "subathon-control-start-001",
  "eventType": "system.custom",
  "platform": "streamerbot",
  "source": { "adapter": "streamerbot", "eventId": "subathon-control-start-001", "eventName": "SubathonControl" },
  "receivedAt": "2026-07-22T12:00:00.000Z",
  "channel": { "name": "THSV" },
  "payload": { "moduleId": "thsv.subathon-timer", "action": "start" },
  "metadata": { "simulated": false }
}
```

`add-time` example:

```json
"payload": { "moduleId": "thsv.subathon-timer", "action": "add-time", "seconds": 300 }
```

## Overlay note

The core-owned, allowlisted add-on overlay host renders the timer at:

- `http://127.0.0.1:8787/overlay/subathon`

The previous module-ID URL remains supported so existing scenes do not break.

The add-on settings let the creator change the overlay font family, background mode, background opacity, border color, accent color, warning and critical colors, and whether the progress bar is shown. The add-on publishes only bounded data; its package does not execute custom browser code.
