# Stream Launch Countdown setup

**Module:** `thsv.starting-soon-countdown`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Runs one exact-scene-aware Starting Soon countdown with a custom message, local tone, and optional approved completion action.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Stream-Launch-Countdown-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Stream-Launch-Countdown-4.0.10.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Stream-Launch-Countdown-4.0.10.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install and enable the add-on, then configure the duration, exact program-scene name, completion message, optional tone, and overlay style.
2. Import the bundled Streamer.bot package.
3. Do not attach OBS, Meld, or Streamlabs scene triggers to the imported Start or Stop actions; StreamBridge follows normalized program-scene changes directly.
4. Use the imported controls only as optional hotkeys or Stream Deck buttons for manual overrides.
5. Optional: approve exactly one triggerless Streamer.bot action and enable the completion action to switch scenes at zero.
6. Add the countdown overlay URL shown by the wizard to OBS, Meld, or Streamlabs Desktop.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Stream Launch Countdown`

- `THSV Addon - Stream Launch Countdown - Start` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Pause` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Resume` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Reset` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Stop` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Complete Now` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Set & Start` in `THSV Addon - Stream Launch Countdown`

These actions publish only bounded local countdown-control envelopes. They do not send chat, call external APIs, or run other actions.

Creator-selected triggers:

- No OBS, Meld, or Streamlabs scene triggers are required on these manual actions. StreamBridge follows normalized program-scene changes directly; use these actions only as optional hotkeys or Stream Deck controls for manual overrides.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.starting-soon-countdown` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.starting-soon-countdown.runtime:** Confirms bounded countdown controls, persistence, and overlay publishing.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `schedule.bounded`, `state.private`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.starting-soon-countdown/`, `data/addons/.state/thsv.starting-soon-countdown/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its small timer state remains available unless add-on data is explicitly deleted.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
