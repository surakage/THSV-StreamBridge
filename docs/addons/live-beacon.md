# Live Beacon setup

**Module:** `thsv.live-beacon`
**Version:** `2.5.2`
**Publisher:** THSV StreamBridge

Collects nearby Twitch, YouTube, Kick, and optional TikTok starts, then posts one guarded, directly linked Discord embed per platform.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Live-Beacon-2.5.2.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Live-Beacon-2.5.2.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Live-Beacon-2.5.2.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the Live Beacon Streamer.bot package.
2. In Deliver, put a private Discord webhook URL in `liveBeaconWebhookUrl`, then Save and Compile. Leave Deliver triggerless; it intentionally fails if run manually without StreamBridge's one-use broker token.
3. Recommended forum setup: create one Discord forum named **Live Notifications**, create one webhook assigned to that forum, and store it in `liveBeaconWebhookUrl`.
4. In the wizard, choose **Shared webhook is in one forum** and leave Twitch, YouTube, Kick, and TikTok on **Use the shared webhook**. Live Beacon creates a separate forum post for each platform.
5. The standard import asks for only `liveBeaconWebhookUrl`. Only for an advanced layout with platforms in different parent channels/forums, manually add the matching optional Set Argument to Deliver: `liveBeaconTwitchWebhookUrl`, `liveBeaconYouTubeWebhookUrl`, `liveBeaconKickWebhookUrl`, or `liveBeaconTikTokWebhookUrl`. Discord binds a webhook to one parent destination, so separate parents need separate webhooks.
6. Choose one forum-post setup:
   - **Create and manage the four platform posts for me:** leave the IDs blank. The first genuine live event for each platform creates its permanent post with the editable welcome message and saves Discord's confirmed thread ID privately.
   - **Use platform posts I already created:** enable **Discord Settings > Advanced > Developer Mode**, right-click each platform post, select **Copy Channel ID**, and paste it into the matching field. These IDs are thread/channel identifiers, not webhook secrets.
7. For TikTok or another platform without a dependable provider event, attach exactly one active broadcast-app **Streaming Started** trigger to **THSV Addon - Live Beacon - Broadcast Started**.
8. Approve only its triggerless Deliver action, configure platform links/templates, then enable the add-on.

When an existing or managed post ID is present, Live Beacon uses Discord's `thread_id` webhook parameter and appends the notification to that post. In managed mode, a missing ID uses `thread_name` once, places the editable welcome content and the first live embed in the new post, then records the confirmed ID for all later streams.

## Notification contents

Live Beacon sends one Discord embed per platform. It contains:

- **Stream title** when the provider trigger supplies one.
- **Game / Category** when the provider trigger supplies one.
- **Direct link** validated for the matching platform.
- **Started** as an absolute and relative Discord timestamp.

Twitch supplies its category and start time; Live Beacon also reads Streamer.bot's current broadcaster-channel title fallback when present. YouTube supplies the broadcast title, exact broadcast ID/link, and published/start time. Kick supplies title, category, and start time. TikTok's broadcast-app fallback supplies the configured `@handle/live` link and the time the fallback fired, but it cannot automatically retrieve the TikTok title or category from TikFinity or LIVE Studio.

## Direct stream links

- **Twitch:** enter `suraruisuh` or `https://www.twitch.tv/suraruisuh`. The notification links directly to that live channel.
- **YouTube:** enter the channel's `https://www.youtube.com/@handle` or `/channel/UC...` URL as a fallback. A genuine **Broadcast Started** trigger supplies `%broadcast.id%`; Live Beacon prefers it and links directly to `https://www.youtube.com/watch?v=VIDEO_ID`. When the event lacks an ID, the saved channel URL becomes the channel's `/live` endpoint.
- **Kick:** enter `suraruisuh` or `https://kick.com/suraruisuh`. The notification links directly to that live channel.
- **TikTok:** enter `@handle` or `https://www.tiktok.com/@handle`. The notification uses `https://www.tiktok.com/@handle/live`.

TikFinity documents forwarding configured events and viewer variables to Streamer.bot, but it does not document a dependable native Stream Online trigger or a live-room ID. TikTok therefore requires an explicit creator-controlled start signal, and its `@handle/live` URL is the best available direct web route rather than a provider-confirmed room ID.

TikTok LIVE Studio documents starting/stopping through its UI and hotkeys but does not publish a creator-facing Streamer.bot trigger or general public LIVE-session API that Live Beacon can safely rely on. Use one of Streamer.bot's documented broadcast-app triggers instead:

- **OBS Studio > Streaming Started**
- **Meld Studio > Streaming Started**
- **Streamlabs Desktop > Streaming Started**

Attach only the application that actually starts your broadcast. In the wizard, select **TikTok** under **Platforms started by broadcast-app fallback**. Twitch, YouTube, and Kick should normally keep their native provider start events to retain exact metadata and YouTube's broadcast video ID.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-beta.1`.

Imported group: `THSV Addon - Live Beacon`

- `THSV Addon - Live Beacon - Deliver` in `THSV Addon - Live Beacon`
- `THSV Addon - Live Beacon - Broadcast Started` in `THSV Addon - Live Beacon`

Deliver must remain triggerless and requires a one-use broker token. Broadcast Started receives exactly one creator-selected broadcast-app Streaming Started trigger and carries no webhook, message, or viewer data. The webhook secret stays in Deliver's Set Argument and is never returned, logged, or sent to StreamBridge.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.live-beacon` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

Streamer.bot's provider-trigger **Test** command is intentionally suppressed because it carries `isTest=true`; it must not post a real Discord notification or role mention. Live acceptance requires a genuine Stream Online/Broadcast Started event. If StreamBridge starts after the stream is already live, most providers do not replay the start event, so Live Beacon waits for the next genuine start.

### Health checks

- **thsv.live-beacon.runtime:** Confirms verified online events can produce guarded per-platform Discord deliveries.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.live-beacon/`, `data/addons/.state/thsv.live-beacon/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its bounded stream deduplication history remains preserved.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
