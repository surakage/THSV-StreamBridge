# Stream Break & End Guard setup

**Module:** `thsv.stream-session-guard`
**Version:** `4.0.11`
**Publisher:** THSV StreamBridge

A built-in live-session wellness timer that derives breaks from the planned stream length, warns before deadlines, and switches only to scenes detected from the connected broadcast app.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Select this extension when generating the one universal Streamer.bot import, then import that one `.sb` file.
3. Configure it from the **Extensions > Broadcast Director** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. Enable this built-in extension and choose the broadcast app, break scene, break interval, break length, maximum stream length, and ending scene.
2. Import the bundled Stream Break & End Guard Streamer.bot helper and approve only its triggerless Scene Controller action.
3. Refresh the scene catalogue and select exact detected scene names in the wizard instead of copying and pasting them.
4. Add the extension overlay URL to the scenes where the five-minute warning should be visible.
5. Run an offline overlay preview, then verify one short private test stream before relying on automatic scene changes.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Extension - Stream Break & End Guard`

- `THSV Extension - Stream Break & End Guard - Scene Controller` in `THSV Extension - Stream Break & End Guard`

Scene Controller must remain triggerless. StreamBridge supplies a one-use broker token plus one exact provider, connection index, and wizard-selected scene name.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.stream-session-guard` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Broadcast Director** component catalogue.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.stream-session-guard.runtime:** Confirms persisted live timing, bounded warnings, and guarded scene-switch dispatch.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `overlay.publish`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.stream-session-guard/`, `data/addons/.state/thsv.stream-session-guard/`.

Dependencies: none.

## Remove or repair

1. Disable the extension. Its small local schedule audit remains preserved unless extension data is explicitly deleted.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
