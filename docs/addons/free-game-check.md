# Free Game Check setup

**Module:** `thsv.free-game-check`
**Version:** `2.6.0`
**Publisher:** THSV StreamBridge

Discovers and announces bounded newly observed public game giveaways.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Free-Game-Check-2.6.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Free-Game-Check-2.6.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Free-Game-Check-2.6.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the Free Game Check Streamer.bot package and leave Refresh triggerless.
2. Approve Refresh in the wizard, choose destination platforms, then enable the add-on.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-beta.1`.

Imported group: `THSV Addon - Free Game Check`

- `THSV Addon - Free Game Check - Refresh` in `THSV Addon - Free Game Check`

Refresh stays triggerless and can call only the fixed GamerPower HTTPS endpoint.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.free-game-check` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.free-game-check.runtime:** Confirms bounded public giveaway discovery is available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `schedule.bounded`, `streamerbot.run-approved-action`, `chat.send`.

Private storage: `data/addons/thsv.free-game-check/`, `data/addons/.state/thsv.free-game-check/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves only bounded giveaway IDs and refresh status.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
