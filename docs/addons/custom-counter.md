# Custom Counter setup

**Module:** `thsv.custom-counter`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Provides multiple bounded persistent creator counters, collision-safe moderator commands, reusable controls, and a customizable core-hosted overlay.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Custom-Counter-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Custom-Counter-4.0.6.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Custom-Counter-4.0.6.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install Custom Counter; its separate Streamer.bot controls are optional.
2. Create distinct counter commands in the wizard. They register automatically through the existing chat intakes after restart and need no Streamer.bot actions.
3. Import the optional controls only for manual hotkeys, Stream Deck buttons, or trusted non-chat triggers.
4. Add /overlay/addons/thsv.custom-counter as a browser source.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Custom Counter`

- `THSV Addon - Custom Counter - Controller` in `THSV Addon - Custom Counter`

The Controller publishes one bounded local relay. It does not write files, send chat, or call external APIs.

Creator-selected triggers:

- No direct trigger is required. Wizard-created counter commands need no Streamer.bot action or Command object.
- Use this optional Controller only for a creator-controlled hotkey, Stream Deck button, or trusted non-chat trigger.
- Set counterOperation, counterId, counterName, counterAmount, and counterPreset as needed. Bridge-managed commands never require duplicated actions.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.custom-counter` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.custom-counter.runtime:** Confirms serialized persistent counters, creator controls, role gates, and overlay projection are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `state.private`, `chat.send`.

Private storage: `data/addons/thsv.custom-counter/`, `data/addons/.state/thsv.custom-counter/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves bounded counter values and presets for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
