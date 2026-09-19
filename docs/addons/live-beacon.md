# Live Beacon setup

**Module:** `thsv.live-beacon`
**Version:** `4.0.11`
**Publisher:** THSV StreamBridge

Posts separate guarded Twitch, YouTube, Kick, and optional TikTok live embeds to a Discord channel or forum.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Select this extension when generating the one universal Streamer.bot import, then import that one `.sb` file.
3. Configure it from the **Extensions > Broadcast Director** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. Import the Live Beacon Streamer.bot package.
2. Set the one shared private Discord webhook in Deliver. Advanced creators may manually add a platform-specific webhook argument only when a platform uses a different parent channel or forum.
3. Choose Create for me or Use existing posts. Create for me makes and remembers each permanent post on its first genuine live event; existing mode uses copied Discord Channel IDs.
4. Leave Deliver triggerless. Attach OBS, Meld, or Streamlabs Desktop Streaming Started to Broadcast Started only when selected platforms need a broadcast-app fallback.
5. Approve only its triggerless Deliver action, configure platform links/templates, then enable the add-on.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Live Beacon`

- `THSV Addon - Live Beacon - Broadcast Started` in `THSV Addon - Live Beacon`
- `THSV Addon - Live Beacon - Deliver` in `THSV Addon - Live Beacon`

Broadcast Started accepts only creator-controlled broadcast-app start triggers and carries no secrets or viewer data. Deliver remains triggerless and requires a one-use broker token. The webhook secret stays in its Set Argument and is never returned, logged, or sent to StreamBridge.

Creator-selected triggers:

- Attach exactly one active broadcast app trigger to Broadcast Started: OBS Studio > Streaming Started, Streamlabs Desktop > Streaming Started, or Meld Studio > Streaming Started.
- Use the wizard's fallback-platform selection only for platforms that lack a dependable provider start signal; TikTok is recommended.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.live-beacon` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Broadcast Director** component catalogue.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.live-beacon.runtime:** Confirms verified online events can produce guarded per-platform Discord deliveries.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.live-beacon/`, `data/addons/.state/thsv.live-beacon/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its bounded stream deduplication history remains preserved.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
