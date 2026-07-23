# Subathon Timer

This add-on keeps one bounded cross-platform subathon countdown using normalized StreamBridge events.

## Streamer.bot controls

Import `THSV-StreamBridge-Subathon-Timer-2.4.0.sb` from this add-on's release bundle. It creates Start, Pause, Resume, Reset, and Add Time actions inside `THSV StreamBridge - Add-ons`. Attach them to hotkeys, deck buttons, or scene triggers. Add Time defaults to 300 seconds; edit that action's Set Argument value when you need a different amount.

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
