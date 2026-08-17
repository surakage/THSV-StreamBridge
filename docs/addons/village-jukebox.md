# Village Jukebox setup

**Module:** `thsv.village-jukebox`
**Version:** `4.0.0`
**Publisher:** THSV StreamBridge

Runs a bounded, fair, YouTube-first multi-platform song-request queue through one approved Streamer.bot resolver and the shared browser-overlay host.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Village-Jukebox-4.0.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Village-Jukebox-4.0.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Village-Jukebox-4.0.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install and enable Viewer Foundation.
2. Import the Village Jukebox Streamer.bot package, put the private YouTube API key in Resolve YouTube Track, and leave both actions triggerless.
3. Approve the resolver and Twitch reward helper, choose the command names in the wizard, and add the hosted browser source. Commands register automatically after restart.
4. Configure optional reward IDs, save, restart StreamBridge, preview the source, then enable playback.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Village Jukebox`

- `THSV Addon - Village Jukebox - Resolve YouTube Track` in `THSV Addon - Village Jukebox`
- `THSV Addon - Village Jukebox - Settle Twitch Reward` in `THSV Addon - Village Jukebox`

Both actions are broker-dispatched only. Leave them triggerless. The YouTube API key belongs only in the resolver action's Set Argument.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.village-jukebox` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.village-jukebox.runtime:** Confirms bounded resolution, fair persistent queueing, serialized media playback, and source-routed chat responses.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `streamerbot.run-approved-action`, `overlay.publish`, `media.exclusive`, `chat.send`, `schedule.bounded`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.village-jukebox/`, `data/addons/.state/thsv.village-jukebox/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstalling preserves the bounded queue, cooldowns, and recently played IDs for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
