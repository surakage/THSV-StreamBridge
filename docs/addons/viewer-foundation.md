# Viewer Foundation setup

**Module:** `thsv.viewer-foundation`
**Version:** `3.5.0`
**Publisher:** THSV StreamBridge

Provides named, configurable, privacy-conscious cross-platform points for chat consistency, observed active/lurk time, and supported community events.

## Install

Viewer Foundation is a required StreamBridge integration. It is installed and updated with the Bridge, has its own **Viewer Foundation** wizard page, and cannot be removed or replaced by an add-on package.

No separate add-on download or Streamer.bot import is required.

### Add-on-specific steps

1. Open the built-in Viewer Foundation page in the wizard and review its private identity and progression settings.
2. Optionally add explicit account links using viewer-id|platform|stable-user-id. Never link accounts by display name.
3. Name the currency and choose chat, consistency, observed time, lurk, and event awards; then save and restart StreamBridge.
4. Choose the balance and lurk command names. They register automatically through the existing chat intakes after restart.

## Streamer.bot

This integration uses normalized Bridge events and does not install a Streamer.bot action package.

## Browser source

Viewer Foundation has no dedicated browser-source overlay. Features that use it continue to publish through their own overlays and shared Bridge presentation queues.

## Offline test

1. Keep the Bridge and Streamer.bot running, then open **Viewer Foundation** in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.viewer-foundation.runtime:** Confirms named currency, salted identity resolution, bounded chat/time/event awards, replay protection, and atomic private progression state.

## Data and permissions

Integration kind: **built in and required**. Trusted capabilities: `events.subscribe`, `state.private`, `viewer.foundation.provide`, `chat.send`.

Private storage: `data/addons/thsv.viewer-foundation/`, `data/addons/.state/thsv.viewer-foundation/`.

Dependencies: none.

## Repair

Reinstall or update StreamBridge to repair the integration. The installer preserves its private viewer identities, balances, account links, and audit history. If setup drifts, inspect the main THSV intake actions in the wizard, verify the saved Viewer Foundation settings, restart StreamBridge, then rerun the offline test.
