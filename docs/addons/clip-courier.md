# Clip Courier setup

**Module:** `thsv.clip-courier`
**Version:** `4.0.10`
**Publisher:** THSV StreamBridge

Creates Twitch clips from !clip and optionally publishes other clips made during the observed current stream to a Discord channel or forum.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Select this extension when generating the one universal Streamer.bot import, then import that one `.sb` file.
3. Configure it from the **Extensions > Clip Engine** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. Import the matching Clip Courier Streamer.bot package. Leave both helper actions triggerless.
2. Open Create Clip and set clipCourierDurationSeconds to 30 or 60. Approve Create Clip in the wizard; StreamBridge calls it only for an authorized Twitch !clip intake command.
3. Open Deliver, replace clipCourierWebhookUrl with a private webhook created for the selected Discord text channel or forum, then Save and Compile. Leave Deliver triggerless and approve it in the wizard.
4. The command-created clip returns directly to Clip Courier; automatic background discovery uses the shared Clip Library Cache.
5. Disable any legacy Streamer.bot !clip Command object before testing so the main Twitch intake is the only command owner.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Clip Courier`

- `THSV Addon - Clip Courier - Create Clip` in `THSV Addon - Clip Courier`
- `THSV Addon - Clip Courier - Deliver` in `THSV Addon - Clip Courier`

Create Clip and Deliver remain triggerless and require one-use broker tokens. The existing Twitch intake owns !clip, and the webhook stays only in Deliver's Set Argument.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.clip-courier` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Clip Engine** component catalogue.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.clip-courier.runtime:** Confirms command clip creation, current-stream filtering, and idempotent Discord publication are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`.

Private storage: `data/addons/thsv.clip-courier/`, `data/addons/.state/thsv.clip-courier/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its bounded publication history remains preserved.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
