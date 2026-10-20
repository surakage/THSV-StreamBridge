# Face Filters setup

**Module:** `thsv.face-filters`
**Version:** `4.0.36`
**Publisher:** THSV StreamBridge

Lets chat trigger Streamfog face lenses on your camera with commands or channel point rewards, one lens at a time with cooldowns and a short queue.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Select this extension when generating the one universal Streamer.bot import, then import that one `.sb` file.
3. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. Install Streamfog, sign in, and connect it in Streamer.bot under Integrations > StreamFog (Remote Key, Auto Connect, Auto Reconnect).
2. In OBS, set your face-camera source to the Streamfog virtual camera instead of the physical camera.
3. Import the Face Filters Streamer.bot package, approve Activate Lens and Deactivate Lens in the wizard, and leave both triggerless.
4. Add one row per lens: a name, the exact Streamfog lens name, an optional !command, optional Twitch and/or Kick reward IDs, and seconds. Leave a box empty to skip it.
5. Enable the extension, restart StreamBridge, and use the wizard test to confirm one lens appears on camera.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Extension - Face Filters`

- `THSV Extension - Face Filters - Activate Lens` in `THSV Extension - Face Filters`
- `THSV Extension - Face Filters - Deactivate Lens` in `THSV Extension - Face Filters`

Activate Lens and Deactivate Lens must remain triggerless. StreamBridge supplies a one-use broker token, the Streamfog lens name, and a 5-600 second duration, then runs Deactivate Lens when that time is up.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.face-filters` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Community Play** component catalogue.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.face-filters.runtime:** Confirms bounded lens parsing, cooldowns, a single serialized lens queue, and approved Streamfog dispatch.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `chat.send`, `schedule.bounded`.

Private storage: `data/addons/thsv.face-filters/`, `data/addons/.state/thsv.face-filters/`.

Dependencies: none.

## Remove or repair

1. Disable the extension. Streamfog ends any active lens when its duration runs out.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
