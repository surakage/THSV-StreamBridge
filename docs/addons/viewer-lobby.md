# Viewer Lobby setup

**Module:** `thsv.viewer-lobby`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Provides a bounded multi-platform play-with-viewers queue with source-routed commands, creator controls, and a read-only overlay.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Viewer-Lobby-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Viewer-Lobby-4.0.1.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Viewer-Lobby-4.0.1.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install Viewer Lobby and import its creator controls.
2. Configure commands, limits, privacy, and overlay fields.
3. Attach Open/Close/Pause/Resume/Next/Random/Complete/Clear only to creator-controlled triggers.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Viewer Lobby`

- `THSV Addon - Viewer Lobby - Open` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Close` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Pause` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Resume` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Next` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Random` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Complete` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Clear` in `THSV Addon - Viewer Lobby`

Controls use an exact action-name/payload allowlist in StreamBridge. Clear is destructive and should be attached only to a deliberate creator control.

Creator-selected triggers:

- Attach only to creator-controlled hotkeys, deck buttons, or scene actions.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.viewer-lobby` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.viewer-lobby.runtime:** Confirms serialized source-routed queue commands and creator-only controls are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.viewer-lobby/`, `data/addons/.state/thsv.viewer-lobby/`.

Dependencies: none.

## Remove or repair

1. Export any wanted queue summary before uninstalling. Private state remains preserved.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
