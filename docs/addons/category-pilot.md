# Category Pilot setup

**Module:** `thsv.category-pilot`
**Version:** `3.0.0`
**Publisher:** THSV StreamBridge

Suggests or applies saved Creator Controls profiles from privacy-bounded allowlisted Windows process checks.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Category-Pilot-3.0.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Category-Pilot-3.0.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Category-Pilot-3.0.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install and configure Creator Controls first.
2. Import Category Pilot, approve its Process Probe and the Creator Controls profile actions used by mappings.
3. Start in Suggest only mode and attach Apply/Dismiss only to creator-controlled triggers.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-beta.1`.

Imported group: `THSV Addon - Category Pilot`

- `THSV Addon - Category Pilot - Process Probe` in `THSV Addon - Category Pilot`
- `THSV Addon - Category Pilot - Apply Suggestion` in `THSV Addon - Category Pilot`
- `THSV Addon - Category Pilot - Dismiss Suggestion` in `THSV Addon - Category Pilot`

Process Probe must remain triggerless and requires a one-use broker token. It compares only exact allowlisted process names and never returns paths, command lines, window titles, or the complete process list.

Creator-selected triggers:

- **controls:** Optional: attach Apply Suggestion and Dismiss Suggestion only to creator-controlled hotkeys or deck buttons.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.category-pilot` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.category-pilot.runtime:** Confirms allowlisted process probes and suggestion controls are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `state.private`, `overlay.publish`.

Private storage: `data/addons/thsv.category-pilot/`, `data/addons/.state/thsv.category-pilot/`.

Dependencies: `thsv.creator-controls`.

## Remove or repair

1. Uninstall the add-on. Its bounded last decision remains preserved for later review.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
