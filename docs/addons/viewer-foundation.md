# Viewer Foundation setup

**Module:** `thsv.viewer-foundation`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Provides named, configurable, privacy-conscious cross-platform points for chat consistency, observed active/lurk time, and supported community events.

## Built-in setup

1. This integration is installed and updated with THSV StreamBridge; do not install a separate `.thsv-addon`.
2. Configure it from its dedicated **Viewer Foundation** wizard page, save, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Open the built-in Viewer Foundation page and review its private identity and progression settings.
2. Optionally add explicit account links using viewer-id|platform|stable-user-id. Never link accounts by display name.
3. Name the currency and choose chat, consistency, observed time, lurk, and event awards; then save and restart StreamBridge.
4. Choose the balance and lurk command names. They register automatically through the existing chat intakes after restart.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

Viewer Foundation has no browser source. Features request only its bounded private projections.

## Offline test

1. Keep the bridge and Streamer.bot running, then open its dedicated **Viewer Foundation** wizard page.
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

1. Viewer Foundation is a required Bridge integration and cannot be uninstalled separately.

If setup drifts, inspect the main THSV intake actions in the wizard, verify the saved add-on command settings, restart StreamBridge, then rerun the offline test.
