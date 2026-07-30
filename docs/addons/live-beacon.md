# Live Beacon setup

**Module:** `thsv.live-beacon`
**Version:** `2.5.1`
**Publisher:** THSV StreamBridge

Coalesces verified Twitch, YouTube, Kick, and optional TikTok live starts into one guarded Discord channel or forum notification.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Live-Beacon-2.5.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Live-Beacon-2.5.1.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Live-Beacon-2.5.1.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the Live Beacon Streamer.bot package.
2. Put a private Discord webhook URL in its Set Argument, compile it, and run a harmless manual test.
3. Approve only its triggerless Deliver action, configure platform links/templates, then enable the add-on.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-beta.1`.

Imported group: `THSV Addon - Live Beacon`

- `THSV Addon - Live Beacon - Deliver` in `THSV Addon - Live Beacon`

Deliver must remain triggerless and requires a one-use broker token. The webhook secret stays in its Set Argument and is never returned, logged, or sent to StreamBridge.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.live-beacon` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.live-beacon.runtime:** Confirms verified online events can coalesce into one guarded Discord delivery.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.live-beacon/`, `data/addons/.state/thsv.live-beacon/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its bounded stream deduplication history remains preserved.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
