# Browser Overlay Hub

Milestone 8 serves transparent local browser overlays for combined, chat-only, and alert-only layouts. It uses standard HTML, CSS, JavaScript, HTTP, and WebSocket APIs and works with Chromium/CEF Browser Sources in Meld Studio, OBS Studio, Streamlabs Desktop, and compatible broadcasting software. No cloud host or broadcasting-software credential is required.

## Add it to a broadcasting app

1. Start THSV StreamBridge with your local configuration.
2. In Meld Studio add a **Browser** layer, or in OBS Studio/Streamlabs Desktop add a **Browser Source**.
3. Choose one of these URLs:
   - Combined: `http://127.0.0.1:8787/overlay/` (normally 1920 by 1080)
   - Chat only: `http://127.0.0.1:8787/overlay/chat`
   - Dock-friendly Chat: `http://127.0.0.1:8787/overlay/chat/dock`
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

Choose **Regular cards** or **Compact feed** on the authenticated wizard's **Chat Overlay** page. The saved choice applies without adding query parameters to the browser URL.

### Operator dock

The wizard exposes a separate `/overlay/chat/dock` URL for an operator-facing panel. Add it to OBS through **View > Docks > Custom Browser Docks**, or to any host that accepts a local browser/web panel. This does not create a platform API connection: browser sections in the same compatible host share the existing overlay `SharedWorker`. If a streaming host does not support custom web docks, use the ordinary `/overlay/chat` URL as a Browser Source instead; the bridge cannot add a native dock to software that has no browser-dock extension point.

Meld's [Browser layer documentation](https://meldstudio.co/docs/layers/#browser), OBS Studio's [Browser Source documentation](https://obsproject.com/kb/browser-source), and Streamlabs Desktop's [Browser Source instructions](https://streamlabs.com/content-hub/post/introducing-browser-source-interaction-for-streamlabs-desktop) all support a URL-based browser source. Meld's separate WebChannel API and OBS's separate WebSocket API are not required merely to render this overlay.

## Behavior

- Public `chat.message` events appear in one ordered feed. Private, system, operator, and command events never enter the browser channel.
- Browser rendering uses DOM `textContent`; event text is never interpreted as HTML.
- `moderation.action` events with a message-removal action and `targetEventId` remove the correlated chat entry.
- The feed retains only `browserOverlay.maxChatMessages` in browser memory and stores no chat history. The default is eight visible messages; when a ninth arrives, the oldest card fades away from the top.
- The wizard can save regular/compact layout, font family and size, text/card/canvas colors and opacity, transparent canvas mode, platform-label/profile-picture/badge visibility, and a case-insensitive ignored-name list. Ignored names are filtered before browser publication but do not block commands or alter Streamer.bot chat.
- The Chat Overlay wizard can place selected platform events into the chat activity feed. Each platform shows only its own event types: for example, YouTube exposes free **New Subscriber** separately from paid **New Member**, while TikTok exposes follow, gift, subscription, and 100-like milestones. Twitch and Kick subscription, gift, reward, and support variants remain separate instead of being collapsed into universal categories. These controls are independent of the alert overlay. Platform-specific display caps shorten long activity text by Unicode code point and count the final ellipsis inside the configured limit, so emoji are never split.
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
  "chat": {
    "layout": "regular",
    "fontFamily": "system",
    "fontSizePx": 18,
    "textColor": "#ffffff",
    "backgroundMode": "transparent",
    "backgroundColor": "#171120",
    "backgroundOpacity": 0.9,
    "messageBackgroundColor": "#171120",
    "messageBackgroundOpacity": 0.96,
    "messageColorMode": "platform",
    "platformMessageColors": {
      "twitch": "#4b267b",
      "youtube": "#7d1717",
      "kick": "#245c18",
      "tiktok": "#172b31"
    },
    "showPlatformLabels": true,
    "showProfilePictures": true,
    "showBadges": true,
    "ignoredNames": [],
    "events": {
      "enabled": true,
      "platforms": { "twitch": true, "youtube": true, "kick": true, "tiktok": true },
      "platformEvents": {
        "twitch": {
          "follow": { "enabled": true, "template": "{actor} followed" },
          "subscription": { "enabled": true, "template": "{actor} subscribed {tier}" },
          "resubscription": { "enabled": true, "template": "{actor} resubscribed for {months} months" },
          "gift-subscription": { "enabled": true, "template": "{actor} gifted a subscription" },
          "gift-bomb": { "enabled": true, "template": "{actor} gifted {quantity} subscriptions" },
          "cheer": { "enabled": true, "template": "{actor} cheered {quantity} bits: {message}" },
          "raid": { "enabled": true, "template": "{actor} raided with {quantity}" },
          "reward-redemption": { "enabled": true, "template": "{actor} redeemed {rewardTitle}: {input}" }
        },
        "youtube": {
          "subscriber": { "enabled": true, "template": "{actor} subscribed to the channel" },
          "member": { "enabled": true, "template": "{actor} became a member {tier}" },
          "membership-gift": { "enabled": true, "template": "{actor} gifted {quantity} memberships" },
          "member-milestone": { "enabled": true, "template": "{actor} reached {months} months as a member" },
          "super-chat": { "enabled": true, "template": "{actor} sent {amount} {currency}: {message}" },
          "super-sticker": { "enabled": true, "template": "{actor} sent a Super Sticker worth {amount} {currency}" }
        },
        "kick": {
          "follow": { "enabled": true, "template": "{actor} followed" },
          "subscription": { "enabled": true, "template": "{actor} subscribed {tier}" },
          "resubscription": { "enabled": true, "template": "{actor} resubscribed for {months} months" },
          "gift-subscription": { "enabled": true, "template": "{actor} gifted a subscription" },
          "mass-gift-subscription": { "enabled": true, "template": "{actor} gifted {quantity} subscriptions" },
          "gifted-kicks": { "enabled": true, "template": "{actor} gifted {quantity} KICKs: {message}" },
          "reward-redemption": { "enabled": true, "template": "{actor} redeemed {rewardTitle}: {input}" }
        },
        "tiktok": {
          "follow": { "enabled": true, "template": "{actor} followed" },
          "gift": { "enabled": true, "template": "{actor} sent {quantity} {itemName}" },
          "subscription": { "enabled": true, "template": "{actor} subscribed for {months} months" },
          "likes": { "enabled": true, "template": "{actor} helped the stream reach {value} likes" }
        }
      },
      "characterLimits": { "twitch": 500, "youtube": 200, "kick": 500, "tiktok": 150 }
    }
  },
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

Use the authenticated wizard's **Chat Overlay** and **Alerts** pages instead of editing this JSON by hand. Templates are normalized and rendered through `textContent`; unknown placeholders and control characters are rejected. Quantity aggregation is limited to gifts and gift subscriptions and combines only waiting cards, never an alert already on screen.

The character-limit values are local overlay display caps, not claims about each platform's outbound chat API. The defaults are conservative and can be adjusted from 40 to 500 characters in the wizard. Disabling a platform event in chat does not disable its alert card or stop Streamer.bot from receiving the normalized event. Donations are not exposed as native platform choices: Streamlabs and Ko-fi intake providers remain future add-ons and require verified source IDs before they can enter the alert/chat pipeline.

`brandLabel` changes the combined overlay heading without editing HTML; set it to an empty string to hide the label.

### Connection-status badge (every overlay surface)

Every overlay surface — combined, standalone Chat, standalone Alerts, and every add-on-hosted overlay — shows the same small connection-status badge, driven by the same two states:

- **Disconnected**: a red **OFFLINE** badge, always visible. Covers the moment before the transport first connects and any later drop; a reconnect attempt is made automatically every 1.5s but the badge does not change wording while retrying.
- **Connected**: a brief green **LIVE** flash, then the badge fades to fully transparent (`opacity: 0`, matching the fade duration in each surface's stylesheet) and stays hidden for the rest of the session unless the connection drops again.

This is deliberate: a creator glancing at a browser source should be able to tell "is this actually wired up" at a glance without a permanent status line cluttering the frame once it's confirmed working. Any new overlay surface (a future add-on's own overlay, a new standalone mode) should reuse this exact pattern rather than inventing its own status treatment:

- Reuse the `.connection-status` (or, for add-on-hosted overlays, `.status`) class and its `[data-state="live"]`/default (disconnected) CSS states — see `overlays/browser/styles.css` and `overlays/browser/addon-host.css`.
- Drive `data-state` from the same transport-open/transport-close events the existing overlays already listen for; do not introduce a separate polling or timeout-based "am I connected" check.
- Keep the red/green colors visually consistent with the existing badges (`#ff9c9c` disconnected, `var(--mint)` connected) rather than picking new ones per surface.

The event WebSocket accepts loopback clients only, even if the diagnostics HTTP service is deliberately exposed on another interface. It broadcasts public presentation projections, never raw payloads, credentials, private messages, or operator traffic.

The deprecated `meldOverlay` configuration key from bridge `0.9.0` is migrated automatically. New configurations should use `browserOverlay`.

## Current boundary

The browser hub is implemented, offline-testable, and live-verified in Meld Studio and OBS Studio. The project owner accepts that OBS verification as the Streamlabs Desktop compatibility gate because all three integrations consume the same standards-based fixed URLs; a separate Streamlabs execution is not claimed. Core serves Combined, Chat, Alerts, and the fixed permission-gated add-on host described below. Bloom Companion and Speaker.bot orchestration are archived optional add-on candidates and are not loaded or exposed by core.

## Hosted add-on overlays

Enabled installed add-ons that declare `overlay.publish` receive a core-hosted source. Official visual add-ons use short creator-facing routes: `/overlay/shoutouts`, `/overlay/clips`, and `/overlay/subathon`. The generic `/overlay/addons/<module-id>` form remains supported for third-party add-ons and backward compatibility. The wizard shows the exact copyable URL and can send a five-second preview card. The page shares the existing overlay `SharedWorker` and WebSocket when supported, filters every envelope to its canonical module ID, and renders only core-defined card and media commands. Add-on packages cannot supply HTML, CSS, or JavaScript to this route.

Media URLs must use HTTPS or the bridge's same origin. Text is assigned through `textContent`, lengths and timing are clamped, and the page's Content Security Policy permits only same-origin code plus HTTPS images/media. An isolated streaming application process may still need one direct WebSocket for its browser source; the add-on never creates or owns that connection itself.

Media duration safety begins only after the browser reports `playing`, so download/buffering time cannot shorten the clip. The native `ended` event remains authoritative; the configured duration adds a ten-second grace period and acts only as a stuck-playback timeout. Media add-ons must keep a bounded retry until the matching `playbackId` reports `started`, because a publication sent while its browser source is closed is not replayed by the generic overlay transport.

## Alert storm protection

The browser alert controller applies event-specific safety defaults. TikTok likes are emitted by the intake adapter only when a new 100-like milestone is crossed. Cheers/bits are summed per viewer for five seconds, gifts per viewer and gift for three seconds, and gift subscriptions per gifter/tier for five seconds. Subscriptions and memberships remain individual and are paced at no faster than one card every four seconds. Follow events are not merged; at most five follow cards are accepted in a ten-second burst and excess cards are suppressed. Native Super Chats are never combined because merging monetary events or their messages could misrepresent the source events. Streamlabs and Ko-fi donations remain deferred until their own verified intake providers are implemented.
