# Automated Shoutouts setup

**Module:** `thsv.automated-shoutouts`
**Version:** `4.0.11`
**Publisher:** THSV StreamBridge

Sends bounded shoutouts and safety-screened once-per-day welcomes with platform-colored cards through StreamBridge's shared router.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Select this extension when generating the one universal Streamer.bot import, then import that one `.sb` file.
3. Configure it from the **Extensions > Community Messaging** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. Install and enable the add-on in the StreamBridge wizard, then review its chat.send and overlay.publish permissions.
2. Choose the manual shoutout command in the wizard. It registers automatically through the existing chat intakes after save and restart.
3. Import the Automated Shoutouts Streamer.bot package and approve Lookup Twitch Creator whenever Twitch triggers are enabled.
4. Optional: also approve Twitch Native Shoutout when Twitch shoutout mode is native or both.
5. For TikTok output, enable Allow Streamer.bot to push messages to TikFinity in TikFinity Chatbot settings.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Automated Shoutouts`

- `THSV Addon - Automated Shoutouts - Lookup Twitch Creator` in `THSV Addon - Automated Shoutouts`
- `THSV Addon - Automated Shoutouts - Twitch Native Shoutout` in `THSV Addon - Automated Shoutouts`

All actions are broker-dispatched only. Do not attach Streamer.bot triggers; the bridge capability broker restricts calls to creator-approved action IDs.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.automated-shoutouts` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Community Messaging** component catalogue.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.automated-shoutouts.runtime:** Confirms shoutout event handling, bounded state, and broker access are healthy.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `overlay.publish`, `schedule.bounded`, `state.private`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.automated-shoutouts/`, `data/addons/.state/thsv.automated-shoutouts/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its private cooldown state remains preserved for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
