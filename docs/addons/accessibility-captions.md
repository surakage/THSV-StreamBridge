# Accessibility Captions setup

**Module:** `thsv.accessibility-captions`
**Version:** `2.6.0`
**Publisher:** THSV StreamBridge

Renders ephemeral high-contrast captions without retaining message bodies.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Accessibility-Captions-2.6.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Accessibility-Captions-2.6.0.thsv-addon` and review its permissions.
3. No separate Streamer.bot import is required.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Choose public event types and visual settings.
2. Add /overlay/addons/thsv.accessibility-captions as a browser source, preview, then enable.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.accessibility-captions` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.accessibility-captions.runtime:** Confirms ephemeral accessible captions are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`.

Private storage: `data/addons/thsv.accessibility-captions/`.

Dependencies: none.

## Remove or repair

1. No caption text history is retained.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
