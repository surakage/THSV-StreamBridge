# Custom Counter setup

**Module:** `thsv.custom-counter`
**Version:** `3.0.0`
**Publisher:** THSV StreamBridge

Provides bounded persistent creator counters with role-gated controls and a customizable core-hosted overlay.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Custom-Counter-3.0.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Custom-Counter-3.0.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Custom-Counter-3.0.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install Custom Counter and import its separate Streamer.bot controls.
2. Create the optional no-response counter command through Command Sync.
3. Attach creator controls only to trusted hotkeys, Stream Deck buttons, or manual triggers.
4. Add /overlay/addons/thsv.custom-counter as a browser source.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-beta.1`.

Imported group: `THSV Addon - Custom Counter`

- `THSV Addon - Custom Counter - Increment` in `THSV Addon - Custom Counter`
- `THSV Addon - Custom Counter - Decrement` in `THSV Addon - Custom Counter`
- `THSV Addon - Custom Counter - Add` in `THSV Addon - Custom Counter`
- `THSV Addon - Custom Counter - Subtract` in `THSV Addon - Custom Counter`
- `THSV Addon - Custom Counter - Set` in `THSV Addon - Custom Counter`
- `THSV Addon - Custom Counter - Reset` in `THSV Addon - Custom Counter`
- `THSV Addon - Custom Counter - Show` in `THSV Addon - Custom Counter`
- `THSV Addon - Custom Counter - Hide` in `THSV Addon - Custom Counter`
- `THSV Addon - Custom Counter - Rename` in `THSV Addon - Custom Counter`
- `THSV Addon - Custom Counter - Save` in `THSV Addon - Custom Counter`
- `THSV Addon - Custom Counter - Load` in `THSV Addon - Custom Counter`

Controls publish a bounded local relay only. They do not write files, send chat, or call external APIs.

Creator-selected triggers:

- **0:** Attach only to creator-controlled hotkeys, Stream Deck buttons, or trusted triggers. No direct trigger is required.

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
