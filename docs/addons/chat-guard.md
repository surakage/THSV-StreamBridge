# Chat Guard setup

**Module:** `thsv.chat-guard`
**Version:** `2.5.0`
**Publisher:** THSV StreamBridge

Classifies normalized public chat and optionally performs capped, creator-approved, platform-aware moderation through one triggerless controller.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Chat-Guard-2.5.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Chat-Guard-2.5.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Chat-Guard-2.5.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install Chat Guard and validate rules in Observe mode first.
2. To enforce, import its Streamer.bot package, keep Moderate triggerless, approve only its stable action ID, then explicitly approve enforcement in the wizard.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-beta.1`.

Imported group: `THSV Addon - Chat Guard`

- `THSV Addon - Chat Guard - Moderate` in `THSV Addon - Chat Guard`

Moderate must remain triggerless. It accepts only a one-use add-on relay token issued by StreamBridge.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.chat-guard` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.chat-guard.runtime:** Confirms bounded public-chat classification and fail-closed optional moderation dispatch are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.chat-guard/`, `data/addons/.state/thsv.chat-guard/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its private pseudonymous incident state remains preserved for a later reinstall or creator review.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
