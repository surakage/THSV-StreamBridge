# Village Lurk Tracker setup

**Module:** `thsv.lurk-tracker`
**Version:** `4.0.12`
**Publisher:** THSV StreamBridge

Tracks explicit lurks, automatic returns, and monthly participation recaps across five platforms.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Village-Lurk-Tracker-4.0.12.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Village-Lurk-Tracker-4.0.12.thsv-addon` and review its permissions.
3. No separate Streamer.bot import is required.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Enable Viewer Foundation and this tracker.
2. Use the same lurk command as Viewer Foundation. Normal chat automatically ends the lurk.
3. Monthly recaps appear in Bridge before the new month starts.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.lurk-tracker` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.lurk-tracker.runtime:** Tracks explicit lurks with monthly rollover and bounded private state.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `schedule.bounded`, `viewer.foundation.read`.

Private storage: `data/addons/thsv.lurk-tracker/`, `data/addons/.state/thsv.lurk-tracker/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Disable or uninstall the tracker; private reports stay available.

If setup drifts, inspect the main THSV intake actions in the wizard, verify the saved add-on command settings, restart StreamBridge, then rerun the offline test.
