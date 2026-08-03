# Viewer Foundation setup

**Module:** `thsv.viewer-foundation`
**Version:** `3.0.0`
**Publisher:** THSV StreamBridge

Provides named, configurable, privacy-conscious cross-platform points for chat consistency, observed active/lurk time, and supported community events.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Viewer-Foundation-3.0.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Viewer-Foundation-3.0.0.thsv-addon` and review its permissions.
3. No separate Streamer.bot import is required.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install Viewer Foundation in the wizard and review its private-state permission.
2. Optionally add explicit account links using viewer-id|platform|stable-user-id. Never link accounts by display name.
3. Name the currency and choose chat, consistency, observed time, lurk, and event awards; then save and restart StreamBridge.
4. Create the Viewer Foundation balance command in Command Sync so viewers can use !points.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.viewer-foundation` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.viewer-foundation.runtime:** Confirms named currency, salted identity resolution, bounded chat/time/event awards, replay protection, and atomic private progression state.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `viewer.foundation.provide`, `chat.send`.

Private storage: `data/addons/thsv.viewer-foundation/`, `data/addons/.state/thsv.viewer-foundation/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its pseudonymous progression state remains preserved for a later reinstall or privacy export.

If setup drifts, inspect the main THSV intake actions in the wizard, restore the documented Command Sync templates or settings, then rerun the offline test.
