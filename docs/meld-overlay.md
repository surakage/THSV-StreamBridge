# Meld Overlay Hub

Milestone 8 serves a transparent local browser overlay at `http://127.0.0.1:8787/overlay/`. Meld Studio officially supports URL-based Browser layers using its Chromium/CEF runtime, so no cloud host, Meld account token, or undocumented widget event is required.

## Add it to Meld Studio

1. Start THSV StreamBridge with your local configuration.
2. In Meld Studio, add a **Browser** layer.
3. Set its URL to `http://127.0.0.1:8787/overlay/`.
4. Size the layer to the canvas, normally 1920 by 1080, and keep its background transparent.
5. Run a harmless simulated chat or alert fixture and confirm it appears.

Meld's official [Browser layer documentation](https://meldstudio.co/docs/layers/#browser) describes URL layers and Chrome/Edge inspection. Its separate [WebChannel API](https://meldstudio.co/docs/api/) controls Meld scenes, layers, and audio; THSV does not require that control channel merely to render this overlay.

## Behavior

- Public `chat.message` events appear in one ordered feed. Private, system, operator, and command events never enter the browser channel.
- Browser rendering uses DOM `textContent`; event text is never interpreted as HTML.
- `moderation.action` events with a message-removal action and `targetEventId` remove the correlated chat entry.
- The feed retains only `meldOverlay.maxChatMessages` in browser memory and stores no chat history.
- Alerts use a bounded visual queue. Donations, cheers, Super Chats, and raids are high priority; subscriptions, memberships, gifts, and milestones are normal; follows are low. A higher-priority visual may replace the currently visible lower-priority card. Priority never infers or converts money.
- HTTPS avatar/badge URLs, validated hex name colors, and subscription renewal/upgrade/month/streak/gift provenance are supported when a verified adapter supplies them.
- Simulated events remain visibly labeled and may be disabled through configuration.

## Configuration

```json
"meldOverlay": {
  "enabled": true,
  "maxChatMessages": 40,
  "alertDurationMs": 7000,
  "showBots": true,
  "showSimulated": true
}
```

The event WebSocket accepts loopback clients only, even if the diagnostics HTTP service is deliberately exposed on another interface. It broadcasts public presentation projections, never raw payloads, credentials, private messages, or operator traffic.

## Current boundary

The browser hub is implemented and testable offline. Live rendering in the installed Meld Studio build remains a manual acceptance check. TTS-synchronized captions are explicitly excluded: the adopted Speaker.bot transport acknowledges local dispatch but does not report playback start, duration, completion, or generated media. Visual alert priority therefore does not claim to preempt or synchronize Speaker.bot audio.
