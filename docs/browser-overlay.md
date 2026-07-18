# Browser Overlay Hub

Milestone 8 serves transparent local browser overlays for combined, chat-only, and alert-only layouts. It uses standard HTML, CSS, JavaScript, HTTP, and WebSocket APIs and works with Chromium/CEF Browser Sources in Meld Studio, OBS Studio, Streamlabs Desktop, and compatible broadcasting software. No cloud host or broadcasting-software credential is required.

## Add it to a broadcasting app

1. Start THSV StreamBridge with your local configuration.
2. In Meld Studio add a **Browser** layer, or in OBS Studio/Streamlabs Desktop add a **Browser Source**.
3. Choose one of these URLs:
   - Combined: `http://127.0.0.1:8787/overlay/` (normally 1920 by 1080)
   - Chat only: `http://127.0.0.1:8787/overlay/chat`
   - Compact Chat for hosts that intentionally want the cards to fill a narrow source: `http://127.0.0.1:8787/overlay/chat?layout=compact` (a useful starting size is 500 by 700)
   - Alerts only: `http://127.0.0.1:8787/overlay/alerts` (use a 1920 by 1080 source in Meld, then crop the transparent area)
4. For independent placement, add Chat and Alerts as separate browser sources. Move, crop, resize, hide, or assign each source to scenes normally in the broadcasting app.
5. Run a harmless simulated chat or alert fixture and confirm it appears.

Chat and Alerts opened by the same browser-source host share a `SharedWorker`, which owns one event WebSocket and fans events out locally. This keeps the independently movable sources from doubling the normal WebSocket traffic. If a broadcasting app isolates browser sources or lacks `SharedWorker`, each source safely falls back to its own reconnecting WebSocket; presentation still works, but the host will show one connection per isolated source.

After upgrading StreamBridge, manually refresh or reload each Browser Source once so the host picks up the new versioned overlay assets. Keep OBS/Streamlabs **Shutdown source when not visible** disabled when you want recent chat to remain visible across scene changes; destroying the source intentionally clears its privacy-bounded in-memory feed.

### Meld Studio sizing

The plain Chat URL is already configured for Meld's canvas behavior. It uses no scale compensation and needs no `layout`, `canvasWidth`, `canvasHeight`, or `verticalScale` query parameters.

1. Keep the Chat URL at `/overlay/chat`.
2. Set **Browser Size** to the same aspect ratio as the Main Canvas (normally `1920` by `1080`) and enable **Lock Size**.
3. Keep the layer transform proportional. For a `1280` by `720` canvas, `1280` by `720` is the matching full-canvas transform; for a `1920` by `1080` canvas, use `1920` by `1080`.
4. Reload the Browser URL, then choose **Crop** and remove the transparent top and left area until only the bottom-right chat cards remain.
5. Move the cropped layer normally. Resize it from a corner or keep the width/height link enabled so its aspect ratio stays intact. Cropping is non-destructive and does not create another WebSocket.

Do not stretch the cropped layer by changing width and height independently. Meld controls the Browser layer transform outside the webpage, so the overlay cannot correct a non-proportional host transform without distorting text in the opposite direction.

OBS Studio and Streamlabs Desktop expose explicit browser-source width and height controls, so they may use `?layout=compact` directly without the Meld crop workflow.

Meld's [Browser layer documentation](https://meldstudio.co/docs/layers/#browser), OBS Studio's [Browser Source documentation](https://obsproject.com/kb/browser-source), and Streamlabs Desktop's [Browser Source instructions](https://streamlabs.com/content-hub/post/introducing-browser-source-interaction-for-streamlabs-desktop) all support a URL-based browser source. Meld's separate WebChannel API and OBS's separate WebSocket API are not required merely to render this overlay.

## Behavior

- Public `chat.message` events appear in one ordered feed. Private, system, operator, and command events never enter the browser channel.
- Browser rendering uses DOM `textContent`; event text is never interpreted as HTML.
- `moderation.action` events with a message-removal action and `targetEventId` remove the correlated chat entry.
- The feed retains only `browserOverlay.maxChatMessages` in browser memory and stores no chat history. The default is eight visible messages; when a ninth arrives, the oldest card fades away from the top.
- Alerts use a bounded visual queue. The default holds at most 20 waiting alerts; when full, it discards the oldest alert from the lowest available priority so a gift storm cannot grow browser memory indefinitely. A malformed card is skipped without freezing later alerts. Donations, cheers, Super Chats, and raids are high priority; subscriptions, memberships, gifts, and milestones are normal; follows are low. Creator profiles may override priority and duration, disable a type, restrict it to selected Twitch, YouTube, Kick, or TikTok sources, render bounded plain-text templates, play a local chime, or combine queued gift quantities inside a short window. An empty platform selection means all supported platforms. A higher-priority visual may replace the currently visible lower-priority card. Priority never infers or converts money.
- HTTPS avatar/badge URLs, validated hex name colors, and subscription renewal/upgrade/month/streak/gift provenance are supported when a verified adapter supplies them.
- Simulated events remain visibly labeled and may be disabled through configuration.
- Combined, Chat-only, and Alerts-only layouts use the same projection stream and do not make additional platform API calls.
- The standalone Chat canvas is transparent when empty. Messages appear as bottom-anchored cards and grow upward, so sizing the source does not create a permanent panel background.
- Standalone Chat cards use an opaque high-contrast surface with no backdrop blur or scale transform. The container narrows to the available browser viewport while preserving readable type and card proportions.
- Standalone Alerts use the same opaque, high-contrast rendering approach. Alert cards center within the available source width, wrap long names/messages, and keep bounded readable typography without scale transforms.

For the clearest standalone Alerts in Meld, keep both the layer and locked **Browser Size** at `1920` by `1080`. Then use **Crop** to remove transparent space around the centered alert and move the cropped result. Do not resize the full webpage to the final banner dimensions; cropping preserves the alert's proportions and text clarity.

## Configuration

```json
  "browserOverlay": {
  "enabled": true,
  "brandLabel": "THE HIDDEN SLOTH VILLAGE",
  "maxChatMessages": 8,
  "maxAlertQueue": 20,
  "alertDurationMs": 7000,
  "showBots": true,
  "showSimulated": true,
  "alerts": {
    "profiles": {
      "gift": {
        "enabled": true,
        "priority": "high",
        "durationMs": 6000,
        "titleTemplate": "{actor} sent {quantity} {itemName}",
        "detailTemplate": "Thank you, {actor}!",
        "sound": { "mode": "chime", "volume": 0.2 },
        "aggregation": { "mode": "sum-quantity", "windowMs": 3000 }
      }
    }
  }
}
```

Use the authenticated wizard's **Alerts** page instead of editing this JSON by hand. Templates are normalized and rendered through `textContent`; unknown placeholders and control characters are rejected. Quantity aggregation is limited to gifts and gift subscriptions and combines only waiting cards, never an alert already on screen.

`brandLabel` changes the combined overlay heading without editing HTML; set it to an empty string to hide the label. Standalone Chat and Alerts keep the live badge hidden during normal operation and show a subtle **RECONNECTING** badge whenever the bridge connection is unavailable.

The event WebSocket accepts loopback clients only, even if the diagnostics HTTP service is deliberately exposed on another interface. It broadcasts public presentation projections, never raw payloads, credentials, private messages, or operator traffic.

The deprecated `meldOverlay` configuration key from bridge `0.9.0` is migrated automatically. New configurations should use `browserOverlay`.

## Current boundary

The browser hub is implemented, offline-testable, and live-verified in Meld Studio and OBS Studio. The project owner accepts that OBS verification as the Streamlabs Desktop compatibility gate because all three integrations consume the same standards-based fixed URLs; a separate Streamlabs execution is not claimed. Stage 2 core serves Combined, Chat, and Alerts only. Bloom Companion and Speaker.bot orchestration are archived optional add-on candidates and are not loaded or exposed by core.
