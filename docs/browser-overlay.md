# Browser Overlay Hub

Milestone 8 serves transparent local browser overlays for combined, chat-only, and alert-only layouts. It uses standard HTML, CSS, JavaScript, HTTP, and WebSocket APIs and works with Chromium/CEF Browser Sources in Meld Studio, OBS Studio, Streamlabs Desktop, and compatible broadcasting software. No cloud host or broadcasting-software credential is required.

## Add it to a broadcasting app

1. Start THSV StreamBridge with your local configuration.
2. In Meld Studio add a **Browser** layer, or in OBS Studio/Streamlabs Desktop add a **Browser Source**.
3. Choose one of these URLs:
   - Combined: `http://127.0.0.1:8787/overlay/` (normally 1920 by 1080)
   - Chat only: `http://127.0.0.1:8787/overlay/chat`
   - Compact Chat for hosts with explicit browser viewport sizing: `http://127.0.0.1:8787/overlay/chat?layout=compact` (a useful starting size is 500 by 700)
   - Alerts only: `http://127.0.0.1:8787/overlay/alerts` (a useful starting size is 800 by 260)
4. For independent placement, add Chat and Alerts as two separate browser sources. Move, crop, resize, hide, or assign each source to scenes normally in the broadcasting app.
5. Run a harmless simulated chat or alert fixture and confirm it appears.

Chat and Alerts opened by the same browser-source host share a `SharedWorker`, which owns one event WebSocket and fans events out locally. This keeps the independently movable sources from doubling the normal WebSocket traffic. If a broadcasting app isolates browser sources or lacks `SharedWorker`, each source safely falls back to its own reconnecting WebSocket; presentation still works, but the host will show one connection per isolated source.

### Meld Studio sizing

Meld Studio `0.10.3.1` reports Browser Size from its editor canvas rather than reliably adopting a tall layer transform. Do not resize the Chat webpage directly to 500 by 700 in Meld; Fit mode will preserve the wide browser viewport and make chat tiny.

1. Keep the Chat URL at `/overlay/chat`.
2. Set X to `0`, Y to `0`, width to the Main Canvas width, and height to the Main Canvas height (normally `1920` by `1080`).
3. Use **Fit** mode and reload the Browser URL.
4. Select the layer, choose **Crop**, and crop the transparent top and left area until only the bottom-right chat region remains.
5. Move the resulting cropped layer normally. Cropping is non-destructive and does not rescale the webpage or create another WebSocket.

OBS Studio and Streamlabs Desktop expose explicit browser-source width and height controls, so they may use `?layout=compact` directly without the Meld crop workflow.

Meld's [Browser layer documentation](https://meldstudio.co/docs/layers/#browser), OBS Studio's [Browser Source documentation](https://obsproject.com/kb/browser-source), and Streamlabs Desktop's [Browser Source instructions](https://streamlabs.com/content-hub/post/introducing-browser-source-interaction-for-streamlabs-desktop) all support a URL-based browser source. Meld's separate WebChannel API and OBS's separate WebSocket API are not required merely to render this overlay.

## Behavior

- Public `chat.message` events appear in one ordered feed. Private, system, operator, and command events never enter the browser channel.
- Browser rendering uses DOM `textContent`; event text is never interpreted as HTML.
- `moderation.action` events with a message-removal action and `targetEventId` remove the correlated chat entry.
- The feed retains only `browserOverlay.maxChatMessages` in browser memory and stores no chat history.
- Alerts use a bounded visual queue. Donations, cheers, Super Chats, and raids are high priority; subscriptions, memberships, gifts, and milestones are normal; follows are low. A higher-priority visual may replace the currently visible lower-priority card. Priority never infers or converts money.
- HTTPS avatar/badge URLs, validated hex name colors, and subscription renewal/upgrade/month/streak/gift provenance are supported when a verified adapter supplies them.
- Simulated events remain visibly labeled and may be disabled through configuration.
- Combined, Chat-only, and Alerts-only layouts use the same projection stream and do not make additional platform API calls.
- The standalone Chat canvas is transparent when empty. Messages appear as bottom-anchored cards and grow upward, so sizing the source does not create a permanent panel background.

## Configuration

```json
  "browserOverlay": {
  "enabled": true,
  "maxChatMessages": 40,
  "alertDurationMs": 7000,
  "showBots": true,
  "showSimulated": true
}
```

The event WebSocket accepts loopback clients only, even if the diagnostics HTTP service is deliberately exposed on another interface. It broadcasts public presentation projections, never raw payloads, credentials, private messages, or operator traffic.

The deprecated `meldOverlay` configuration key from bridge `0.9.0` is migrated automatically. New configurations should use `browserOverlay`.

## Current boundary

The browser hub is implemented and testable offline. Live rendering in each supported broadcasting application remains a manual acceptance check. TTS-synchronized captions are explicitly excluded: the adopted Speaker.bot transport acknowledges local dispatch but does not report playback start, duration, completion, or generated media. Visual alert priority therefore does not claim to preempt or synchronize Speaker.bot audio.
