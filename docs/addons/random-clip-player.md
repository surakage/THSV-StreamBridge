# Random Clip Player setup

**Module:** `thsv.random-clip-player`
**Version:** `2.5.0`
**Publisher:** THSV StreamBridge

Plays a random clip from the broadcaster's own Twitch clip library on a timer, using a creator-approved Streamer.bot action to fetch clips and resolve playable download URLs.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Random-Clip-Player-2.5.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Random-Clip-Player-2.5.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Random-Clip-Player-2.5.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the bundled Streamer.bot/THSV-StreamBridge-Random-Clip-Player-2.5.0.sb into Streamer.bot.
2. In the wizard, install this add-on, then under its Approved Streamer.bot actions grant BOTH imported fetch actions: "Get Clips" and "Get Clip Download". Neither fetch action has a chat/event trigger by design.
3. Optionally bind the imported Enable and Disable actions to Streamer.bot scene-active and scene-inactive triggers.
4. Add the /overlay/clips browser source in OBS/Meld/Streamlabs to render playback.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-alpha.31`.

Imported group: `THSV Addon - Random Clip Player`

- `THSV Addon - Random Clip Player - Get Clips` in `THSV Addon - Random Clip Player`
- `THSV Addon - Random Clip Player - Get Clip Download` in `THSV Addon - Random Clip Player`
- `THSV Addon - Random Clip Player - Enable` in `THSV Addon - Random Clip Player`
- `THSV Addon - Random Clip Player - Disable` in `THSV Addon - Random Clip Player`

Get Clips and Get Clip Download are broker-dispatched only and must not receive triggers. Enable and Disable are intentionally creator-triggered scene controls.

Creator-selected triggers:

- **enable:** Attach the streaming host's scene-active trigger for the scene that should play clips.
- **disable:** Attach the same scene's scene-inactive trigger, or the next scene's scene-active trigger.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.random-clip-player` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.random-clip-player.runtime:** Confirms the add-on can request clips and receive Streamer.bot relay events.

## Data and permissions

Package kind: **executable**. Requested permissions: `streamerbot.run-approved-action`, `overlay.publish`, `schedule.bounded`, `state.private`, `events.subscribe`.

Private storage: `data/addons/thsv.random-clip-player/`, `data/addons/.state/thsv.random-clip-player/`.

Dependencies: `thsv.clip-library-cache`.

## Remove or repair

1. Remove the add-on package; its separately owned rotation state remains preserved.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
