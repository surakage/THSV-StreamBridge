# Prize Wheel setup

**Module:** `thsv.prize-wheel`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Runs a creator-controlled equal-slice wheel with natural OBS animation, bounded multi-platform winner messages, and a result card.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Prize-Wheel-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Prize-Wheel-4.0.2.thsv-addon` and review its permissions.
3. No separate Streamer.bot import is required.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Add the hosted Prize Wheel browser source to OBS, Meld, or Streamlabs.
2. Choose the spin command in the wizard. It registers automatically for moderators and the broadcaster after restart.
3. Enter two through ten unique wheel choices, choose chat destinations, save, enable, and send a preview.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.prize-wheel` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.prize-wheel.runtime:** Confirms bounded choices, serialized spins, delayed announcements, and the hosted wheel renderer.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `schedule.bounded`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.prize-wheel/`, `data/addons/.state/thsv.prize-wheel/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves only the last bounded spin timestamp and winning choice.

If setup drifts, inspect the main THSV intake actions in the wizard, verify the saved add-on command settings, restart StreamBridge, then rerun the offline test.
