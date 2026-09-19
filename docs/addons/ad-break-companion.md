# Ad Break Companion setup

**Module:** `thsv.ad-break-companion`
**Version:** `4.0.11`
**Publisher:** THSV StreamBridge

Shows a compact Twitch upcoming-ad and active-ad countdown without controlling ad playback.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Select this extension when generating the one universal Streamer.bot import, then import that one `.sb` file.
3. Configure it from the **Extensions > Broadcast Director** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. Install and enable the add-on, then review the countdown wording and colors.
2. Import the bundled Streamer.bot package into its own THSV Addon - Ad Break Companion group.
3. Attach Twitch > Ads > Upcoming Ad to the Upcoming Ad Intake action.
4. Attach Twitch > Ads > Ad Run to the Ad Run Intake action.
5. Add the Ad Break Companion overlay URL shown by the wizard to OBS, Meld, or Streamlabs Desktop.
6. Run Preview Upcoming and Preview Active while offline to size both states, then run Clear Display.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Ad Break Companion`

- `THSV Addon - Ad Break Companion - Upcoming Ad Intake` in `THSV Addon - Ad Break Companion`
- `THSV Addon - Ad Break Companion - Ad Run Intake` in `THSV Addon - Ad Break Companion`
- `THSV Addon - Ad Break Companion - Preview Upcoming` in `THSV Addon - Ad Break Companion`
- `THSV Addon - Ad Break Companion - Preview Active` in `THSV Addon - Ad Break Companion`
- `THSV Addon - Ad Break Companion - Clear Display` in `THSV Addon - Ad Break Companion`

These actions relay bounded Twitch ad timing only. They cannot start, snooze, schedule, or cancel an ad.

Creator-selected triggers:

- Attach Twitch > Ads > Upcoming Ad only to Upcoming Ad Intake.
- Attach Twitch > Ads > Ad Run only to Ad Run Intake.
- Leave Preview Upcoming, Preview Active, and Clear Display triggerless.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.ad-break-companion` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Broadcast Director** component catalogue.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.ad-break-companion.runtime:** Confirms Twitch ad timing events, bounded scheduling, persistence, and overlay publishing.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.ad-break-companion/`, `data/addons/.state/thsv.ad-break-companion/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its small timing state remains unless add-on data is explicitly deleted.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
