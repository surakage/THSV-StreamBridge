# Clip Library Cache setup

**Module:** `thsv.clip-library-cache`
**Version:** `2.5.2`
**Publisher:** THSV StreamBridge

Shared background service that performs one bounded Twitch clip metadata refresh for Random Clip Player, Clip Courier, and other approved clip consumers.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Clip-Library-Cache-2.5.2.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Clip-Library-Cache-2.5.2.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Clip-Library-Cache-2.5.2.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install Clip Library Cache once when Random Clip Player, Clip Courier, or another installed add-on declares thsv.clip-library-cache as a dependency.
2. Import the matching Clip Library Cache Streamer.bot package. Keep Refresh enabled but triggerless; StreamBridge schedules it through the approved stable action ID.
3. In the wizard, approve only THSV Addon - Clip Library Cache - Refresh, enable the shared clip list, save, and restart StreamBridge.
4. Return to the consuming add-on. Clip Library Cache has no overlay and never plays, posts, or downloads a clip by itself.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-beta.1`.

Imported group: `THSV Addon - Clip Library Cache`

- `THSV Addon - Clip Library Cache - Refresh` in `THSV Addon - Clip Library Cache`

Refresh remains triggerless and is dispatched only through its creator-approved stable ID. Do not attach a timer or platform trigger.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.clip-library-cache` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.clip-library-cache.runtime:** Confirms bounded shared clip metadata refresh is available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `schedule.bounded`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.clip-library-cache/`, `data/addons/.state/thsv.clip-library-cache/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves only bounded clip metadata; no video files or signed playback URLs are stored.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
