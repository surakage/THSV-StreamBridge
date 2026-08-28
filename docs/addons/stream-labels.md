# Stream Labels setup

**Module:** `thsv.stream-labels`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Projects equivalent Twitch, YouTube, Kick, TikTok, Streamlabs, and Ko-fi events into persistent OBS-ready stream labels.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Stream-Labels-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Stream-Labels-4.0.9.thsv-addon` and review its permissions.
3. No separate Streamer.bot import is required.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install and enable Stream Labels. No separate Streamer.bot import or direct trigger is required.
2. Choose the platforms, label groups, and simple visual style in the wizard.
3. Copy one individual label URL or the combined preview URL into an OBS, Meld, or Streamlabs browser source.
4. Use the normal StreamBridge simulator to verify mappings before going live.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.stream-labels` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.stream-labels.runtime:** Confirms bounded latest-event persistence and namespaced overlay publication.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `state.private`.

Private storage: `data/addons/thsv.stream-labels/`, `data/addons/.state/thsv.stream-labels/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its latest label values remain preserved for a later reinstall.

If setup drifts, inspect the main THSV intake actions in the wizard, verify the saved add-on command settings, restart StreamBridge, then rerun the offline test.
