# Village Draw setup

**Module:** `thsv.village-draw`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Runs restart-safe free or Viewer Foundation points giveaways with bounded weighted tickets, authenticated controls, multi-platform announcements, and winner overlays.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Village-Draw-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Village-Draw-4.0.9.thsv-addon` and review its permissions.
3. No separate Streamer.bot import is required.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install and enable Viewer Foundation first; Village Draw never creates a second points balance.
2. Keep chat-message triggers on the existing main THSV platform intake actions; no separate giveaway commands or triggers are required in Streamer.bot.
3. Configure the prize and ticket rules, save, restart, then use the authenticated wizard controls to open the draw.
4. Add the hosted Village Draw overlay to OBS, Meld, or Streamlabs and send a safe preview.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.village-draw` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.village-draw.runtime:** Confirms serialized entries, recoverable Viewer Foundation spending/refunds, secure weighted selection, and hosted result cards.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `schedule.bounded`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.village-draw/`, `data/addons/.state/thsv.village-draw/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Cancel and refund an open points draw before uninstalling. Private bounded history remains available for a later reinstall.

If setup drifts, inspect the main THSV intake actions in the wizard, verify the saved add-on command settings, restart StreamBridge, then rerun the offline test.
