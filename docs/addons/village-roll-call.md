# Village Roll Call setup

**Module:** `thsv.village-roll-call`
**Version:** `4.0.10`
**Publisher:** THSV StreamBridge

Runs cross-platform daily check-ins using Twitch/Kick rewards and YouTube/TikTok Viewer Foundation points.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Configure it from the **Extensions > Community Rewards** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. Create Twitch and Kick check-in rewards. Keep both Reward Redemption triggers attached to their platform intakes.
2. Choose the check-in command name. It registers automatically for YouTube and TikTok after restart.
3. Enable Viewer Foundation, choose the points cost and calendar time zone, then enable Village Roll Call.
4. Optionally add the hosted browser source to OBS, Meld, or Streamlabs and send a preview.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.village-roll-call` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Community Rewards** component catalogue.
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

If setup drifts, inspect the main THSV intake actions in the wizard, verify the saved add-on command settings, restart StreamBridge, then rerun the offline test.
