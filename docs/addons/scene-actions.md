# Scene Actions setup

**Module:** `thsv.scene-actions`
**Version:** `4.0.11`
**Publisher:** THSV StreamBridge

Runs creator-approved Streamer.bot actions when OBS Studio, Streamlabs Desktop, or Meld Studio changes to a mapped scene.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Select this extension when generating the one universal Streamer.bot import, then import that one `.sb` file.
3. Configure it from the **Extensions > Broadcast Director** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. Import the bundled Streamer.bot Scene Actions package.
2. Attach the documented OBS Studio, Streamlabs Desktop, and/or Meld Studio Scene Changed triggers to the imported Intake action.
3. Refresh Streamer.bot actions in the wizard, approve the scene actions this add-on may run, and edit the starter scene mappings.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Scene Actions`

- `THSV Scene Actions - Intake` in `THSV Addon - Scene Actions`
- `THSV Scene - Starting Soon` in `THSV Addon - Scene Actions`
- `THSV Scene - Just Chatting` in `THSV Addon - Scene Actions`
- `THSV Scene - Gameplay` in `THSV Addon - Scene Actions`
- `THSV Scene - Be Right Back` in `THSV Addon - Scene Actions`
- `THSV Scene - Ending Soon` in `THSV Addon - Scene Actions`

Only the Intake action receives scene-change triggers. Starter target actions have no triggers and must be dispatched through creator-approved stable-ID mappings.

Creator-selected triggers:

- Add OBS Studio > Scene Changed (Connection: Any; Scene: any) to THSV Scene Actions - Intake.
- Add Streamlabs Desktop > Scene Changed (Instance: Any; Scene: any) to THSV Scene Actions - Intake.
- Add Meld Studio > Scene Changed (Connection: Any) to THSV Scene Actions - Intake. If your Streamer.bot version requires a Scene value, attach one copy per scene.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.scene-actions` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Broadcast Director** component catalogue.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.scene-actions.runtime:** Confirms normalized scene events can dispatch creator-approved actions without repeat loops.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.scene-actions/`, `data/addons/.state/thsv.scene-actions/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its private anti-loop state remains preserved for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
