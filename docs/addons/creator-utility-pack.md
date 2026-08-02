# Creator Utility Pack setup

**Module:** `thsv.creator-utility-pack`
**Version:** `3.0.0`
**Publisher:** THSV StreamBridge

Adds bounded cross-platform counters and local chat polls; giveaways are handled only by Village Draw.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Creator-Utility-Pack-3.0.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Creator-Utility-Pack-3.0.0.thsv-addon` and review its permissions.
3. No separate Streamer.bot import is required.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install and choose command names.
2. Create matching no-response commands in Command Sync.
3. Use moderator/broadcaster commands to manage counters and polls.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.creator-utility-pack` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.creator-utility-pack.runtime:** Confirms bounded counter/poll state and platform-limited source replies are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.creator-utility-pack/`, `data/addons/.state/thsv.creator-utility-pack/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves bounded counters and the current poll definition.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
