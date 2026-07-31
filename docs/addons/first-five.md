# First Five setup

**Module:** `thsv.first-five`
**Version:** `2.5.2`
**Publisher:** THSV StreamBridge

Runs five Streamer.bot-owned Twitch channel-point rewards in sequence, permits one placement per viewer per stream, and maintains a compact monthly leaderboard.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-First-Five-2.5.2.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-First-Five-2.5.2.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-First-Five-2.5.2.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the separate First Five Streamer.bot package.
2. Keep its Controller action triggerless and approve only that action for this add-on.
3. Add Twitch Reward Redemption (Any Reward) to the existing THSV Twitch - Intake action.
4. Choose five Streamer.bot-owned Twitch reward IDs in placement order and keep Skip Reward Queue disabled on all five rewards.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-alpha.33`.

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

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.first-five/`, `data/addons/.state/thsv.first-five/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its compact leaderboard state remains preserved for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
