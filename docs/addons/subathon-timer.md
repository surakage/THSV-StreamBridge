# Subathon Timer setup

**Module:** `thsv.subathon-timer`
**Version:** `3.5.0`
**Publisher:** THSV StreamBridge

Maintains one bounded multi-platform subathon countdown that decreases over time and increases from selected live events.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Subathon-Timer-3.5.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Subathon-Timer-3.5.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Subathon-Timer-3.5.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install and enable the add-on, then choose your starting time, cap, and per-event bonuses.
2. Use stream.online and stream.offline from your connected platform relays so the timer starts and pauses from real live state.
3. Import the bundled Streamer.bot/THSV-StreamBridge-Subathon-Timer-3.5.0.sb package for Start, Pause, Resume, Reset, and Add Time actions.
4. Attach those optional control actions to hotkeys, scene triggers, or buttons in Streamer.bot. The imported actions relay only bounded local timer controls.
5. Optional: enable the moderator commands if you also want chat-based controls.
6. Use the core-owned hosted add-on overlay URL shown in the wizard. It renders the timer without executing add-on-supplied browser code.
7. The timer uses only normalized StreamBridge events. It does not invent a separate Streamer.bot timer or external API dependency.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-alpha.32`.

Imported group: `THSV Addon - Subathon Timer`

- `THSV Addon - Subathon Timer - Start` in `THSV Addon - Subathon Timer`
- `THSV Addon - Subathon Timer - Pause` in `THSV Addon - Subathon Timer`
- `THSV Addon - Subathon Timer - Resume` in `THSV Addon - Subathon Timer`
- `THSV Addon - Subathon Timer - Reset` in `THSV Addon - Subathon Timer`
- `THSV Addon - Subathon Timer - Add Time` in `THSV Addon - Subathon Timer`

These actions publish only a bounded local timer-control envelope. They do not send chat, call external APIs, or run other actions.

Creator-selected triggers:

- **0:** Optionally attach these controls to hotkeys, deck buttons, or scene-active/scene-inactive triggers.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.subathon-timer` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.subathon-timer.runtime:** Confirms bounded timer updates, live-state tracking, and per-event bonus handling.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.subathon-timer/`, `data/addons/.state/thsv.subathon-timer/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. The timer state is preserved for a later reinstall unless you explicitly delete add-on data.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
