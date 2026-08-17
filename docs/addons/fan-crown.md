# Fan Crown setup

**Module:** `thsv.fan-crown`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Runs a cross-platform Fan Crown using Twitch/Kick rewards and Viewer Foundation points on YouTube/TikTok, with bounded eligibility and a private monthly leaderboard.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Fan-Crown-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Fan-Crown-4.0.1.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Fan-Crown-4.0.1.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the separate Fan Crown Streamer.bot package.
2. Keep its Controller action triggerless and approve only that action for this add-on.
3. Keep Twitch and Kick Reward Redemption attached to the existing platform intake actions.
4. Create Twitch and Kick rewards. The saved YouTube and TikTok command registers automatically after restart.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Fan Crown`

- `THSV Addon - Fan Crown - Controller` in `THSV Addon - Fan Crown`
- `THSV Addon - Fan Crown - Reset Crown` in `THSV Addon - Fan Crown`
- `THSV Addon - Fan Crown - Reset Month` in `THSV Addon - Fan Crown`

Controller must remain triggerless and is dispatched only through Fan Crown's approved stable action ID. Reset actions emit exact, bounded local control envelopes and never mutate Twitch directly.

Creator-selected triggers:

- **resetCrown:** Optional: attach only to a creator-controlled hotkey or deck button.
- **resetMonth:** Optional and destructive: attach only to a creator-controlled hotkey or deck button after reviewing its purpose.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.fan-crown` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.fan-crown.runtime:** Confirms serialized crown captures, result-correlated reward administration, bounded pricing, and private monthly ranking state.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`, `schedule.bounded`.

Private storage: `data/addons/thsv.fan-crown/`, `data/addons/.state/thsv.fan-crown/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstall the add-on. Its compact private season state remains preserved for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
