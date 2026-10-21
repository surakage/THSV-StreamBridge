# Streamer Punishments setup

**Module:** `thsv.streamer-punishments`
**Version:** `4.0.45`
**Publisher:** THSV StreamBridge

Lets viewers spend points or channel points on short OBS screen effects or on exercises you do on camera, with a grace countdown, a safe scene, and monthly exercise totals.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Select this extension when generating the one universal Streamer.bot import, then import that one `.sb` file.
3. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. In OBS, add one filter per screen effect to the source it should change and turn it off: for example a Color Correction filter named "THSV Blackout" with brightness turned down. Pixelate and barrel roll need the free Composite Blur and Move plugins.
2. Import the Streamer Punishments Streamer.bot package, approve Set Filter and Switch Scene in the wizard, and leave both triggerless.
3. Fill in each effect's OBS source and filter name, check the exercises, reps and prices, and pick the safe scene for exercises.
4. For Twitch and Kick, create channel point rewards with the same prices and paste each reward ID into its row.
5. Enable the extension and restart StreamBridge.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Extension - Streamer Punishments`

- `THSV Extension - Streamer Punishments - Set Filter` in `THSV Extension - Streamer Punishments`
- `THSV Extension - Streamer Punishments - Switch Scene` in `THSV Extension - Streamer Punishments`

Set Filter and Switch Scene must remain triggerless. StreamBridge supplies a one-use broker token, an exact OBS source and filter name or scene name, and a bounded connection index, and owns all timing.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.streamer-punishments` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Community Play** component catalogue.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.streamer-punishments.runtime:** Confirms bounded punishment parsing, refunded point spending, one effect at a time, and one exercise at a time with a grace countdown.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`, `schedule.bounded`.

Private storage: `data/addons/thsv.streamer-punishments/`, `data/addons/.state/thsv.streamer-punishments/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Disable the extension. Any effect that is on turns off, and owed exercises stay saved until it is enabled again.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
