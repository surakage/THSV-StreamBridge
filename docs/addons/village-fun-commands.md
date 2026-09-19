# Village Fun Commands setup

**Module:** `thsv.village-fun-commands`
**Version:** `4.0.11`
**Publisher:** THSV StreamBridge

Adds safe, source-routed facts, jokes, social interactions, and lightweight utility fun commands with bounded offline fallbacks.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Select this extension when generating the one universal Streamer.bot import, then import that one `.sb` file.
3. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. Install Village Fun Commands in the wizard.
2. When online providers are enabled, import and approve Fetch Fun Content; keep it triggerless.
3. Choose command toggles and names, save, and restart StreamBridge.
4. Use the existing platform chat intakes; do not create separate Streamer.bot Command objects.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Village Fun Commands`

- `THSV Addon - Village Fun Commands - Fetch Fun Content` in `THSV Addon - Village Fun Commands`
- `THSV Addon - Village Fun Commands - Twitch Follow Age` in `THSV Addon - Village Fun Commands`

Both helper actions are broker-dispatched and must remain triggerless. Viewer commands register through the existing THSV platform chat intakes.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.village-fun-commands` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Community Play** component catalogue.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.village-fun-commands.runtime:** Confirms automatic fun commands, bounded provider relays, source-only replies, and offline fallbacks are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `streamerbot.run-approved-action`, `schedule.bounded`.

Private storage: `data/addons/thsv.village-fun-commands/`, `data/addons/.state/thsv.village-fun-commands/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves only bounded cooldown, recent-response, and hug-count state.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
