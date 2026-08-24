# Chat Play Pack setup

**Module:** `thsv.chat-play-pack`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Adds bounded cross-platform solo games, shared rounds, accepted viewer duels, idempotent points, optional OpenTDB trivia, and dictionary-backed Unscramble.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Chat-Play-Pack-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Chat-Play-Pack-4.0.5.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Chat-Play-Pack-4.0.5.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install Viewer Foundation first.
2. Import Chat Play Pack only when using one of its two optional provider actions; viewer commands already use the main chat intakes.
3. Keep the imported actions triggerless because the existing platform intakes deliver public chat directly; approve only the fetch actions you enable.
4. Configure creator fallback questions and words before enabling provider-backed games.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Chat Play Pack`

- `THSV Addon - Chat Play Pack - Fetch Trivia Questions` in `THSV Addon - Chat Play Pack`
- `THSV Addon - Chat Play Pack - Fetch Unscramble Words` in `THSV Addon - Chat Play Pack`

Fetch actions remain broker-dispatched and triggerless. Imported commands need no action triggers because the existing THSV platform intake actions already relay normalized public chat; TikTok uses the existing TikFinity intake.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.chat-play-pack` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.chat-play-pack.runtime:** Confirms serialized rounds, bounded cooldowns, stable duel identities, trivia fallback, and idempotent Viewer Foundation awards.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`, `streamerbot.run-approved-action`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.chat-play-pack/`, `data/addons/.state/thsv.chat-play-pack/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstalling preserves only bounded round statistics and pseudonymous Viewer Foundation IDs.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
