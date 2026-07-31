# Chat Play Pack setup

**Module:** `thsv.chat-play-pack`
**Version:** `2.5.2`
**Publisher:** THSV StreamBridge

Adds bounded cross-platform Number Guess, Trivia, and Prediction rounds.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Chat-Play-Pack-2.5.2.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Chat-Play-Pack-2.5.2.thsv-addon` and review its permissions.
3. No separate Streamer.bot import is required.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install Viewer Foundation first.
2. Create matching no-response commands in Command Sync.
3. Configure original trivia questions before enabling Trivia.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.chat-play-pack` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.chat-play-pack.runtime:** Confirms bounded rounds, cooldowns, and idempotent Viewer Foundation awards.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.chat-play-pack/`, `data/addons/.state/thsv.chat-play-pack/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstalling preserves only bounded round statistics and pseudonymous Viewer Foundation IDs.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
