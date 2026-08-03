# Village Roll Call setup

**Module:** `thsv.village-roll-call`
**Version:** `3.0.0`
**Publisher:** THSV StreamBridge

Runs cross-platform daily check-ins using Twitch/Kick rewards and YouTube/TikTok Viewer Foundation points.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Village-Roll-Call-3.0.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Village-Roll-Call-3.0.0.thsv-addon` and review its permissions.
3. No separate Streamer.bot import is required.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Create Twitch and Kick check-in rewards. Keep both Reward Redemption triggers attached to their platform intakes.
2. Create the configured no-response check-in command for YouTube and TikTok through Command Sync.
3. Enable Viewer Foundation, choose the points cost and calendar time zone, then enable Village Roll Call.
4. Optionally add the hosted browser source to OBS, Meld, or Streamlabs and send a preview.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.village-roll-call` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.village-roll-call.runtime:** Confirms daily uniqueness, monthly rollover, bounded state, and overlay cards.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.village-roll-call/`, `data/addons/.state/thsv.village-roll-call/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstall the add-on. Its bounded private leaderboard remains preserved for a later reinstall.

If setup drifts, inspect the main THSV intake actions in the wizard, restore the documented Command Sync templates or settings, then rerun the offline test.
