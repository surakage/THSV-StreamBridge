# Subathon Timer

This add-on keeps one bounded cross-platform subathon countdown using normalized StreamBridge events.

## Streamer.bot control events

If you want Streamer.bot actions, scene changes, or buttons to control the timer, send a normalized `system.custom` event through your existing StreamBridge intake path with:

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

This release is paired with a bridge-side hosted route at:

- `http://127.0.0.1:8787/overlay/addons/thsv.subathon-timer`

The add-on settings now let the creator change the overlay font family, background mode, background opacity, border color, accent color, warning and critical colors, and whether the progress bar is shown.
