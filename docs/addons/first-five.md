# First Five setup

**Module:** `thsv.first-five`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Runs cross-platform First Five placements using Twitch/Kick rewards and Viewer Foundation points on YouTube/TikTok, with one placement per viewer per stream.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-First-Five-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-First-Five-4.0.8.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-First-Five-4.0.8.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the separate First Five Streamer.bot package.
2. Keep its Controller action triggerless and approve only that action for this add-on.
3. Keep Twitch and Kick Reward Redemption attached to their existing platform intake actions.
4. Choose five Twitch IDs and five Kick IDs in placement order. The saved YouTube and TikTok command registers automatically after restart.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - First Five`

- `THSV Addon - First Five - Controller` in `THSV Addon - First Five`
- `THSV Addon - First Five - Reset` in `THSV Addon - First Five`

Controller must remain triggerless and is dispatched only by the creator-approved First Five add-on. Reset emits one tightly scoped local control event.

Creator-selected triggers:

- **reset:** Optional: attach to a deck button or hotkey for a creator-confirmed emergency stream reset.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.first-five` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.first-five.runtime:** Confirms serialized placement claims, reward transitions, and monthly leaderboard state.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.first-five/`, `data/addons/.state/thsv.first-five/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstall the add-on. Its compact leaderboard state remains preserved for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
