# Viewer Spotlight setup

**Module:** `thsv.viewer-spotlight`
**Version:** `4.0.10`
**Publisher:** THSV StreamBridge

Displays privacy-gated viewer cards, presentation modes, and aggregate Stream Score from bounded projections.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Select this extension when generating the one universal Streamer.bot import, then import that one `.sb` file.
3. Configure it from the **Extensions > Community Rewards** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. Install and enable Viewer Foundation and Community Analytics first.
2. Install Viewer Spotlight, review public fields, accept the disclosure, and enable it.
3. Create Twitch and Kick Viewer Spotlight rewards, then choose the YouTube and TikTok card command. It registers automatically after restart.
4. Add /overlay/addons/thsv.viewer-spotlight as a browser source.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Viewer Spotlight`

- `THSV Addon - Viewer Spotlight - Settle Reward` in `THSV Addon - Viewer Spotlight`
- `THSV Addon - Viewer Spotlight - Discord Snapshot` in `THSV Addon - Viewer Spotlight`

Both actions remain triggerless and require one-use broker tokens. The Discord webhook remains only in its Set Argument.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.viewer-spotlight` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Community Rewards** component catalogue.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.viewer-spotlight.runtime:** Confirms bounded self-request handling and projection-only overlay publication.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `overlay.publish`, `schedule.bounded`, `viewer.foundation.read`, `viewer.foundation.mutate`, `community.analytics.read`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.viewer-spotlight/`, `data/addons/.state/thsv.viewer-spotlight/`.

Dependencies: `thsv.viewer-foundation`, `thsv.community-analytics`.

## Remove or repair

1. Uninstall the add-on. Its pseudonymous cooldown state remains preserved for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
