# Chat Guard setup

**Module:** `thsv.chat-guard`
**Version:** `3.5.0`
**Publisher:** THSV StreamBridge

Classifies normalized public chat, manages creator-approved trusted stable IDs, and optionally performs narrowly scoped, rate-limited moderation.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Chat-Guard-3.5.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Chat-Guard-3.6.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Chat-Guard-3.6.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Enable safe observation, select the public-chat platforms to watch, optionally enter obvious blocked words or websites, then save and restart. Observation cannot moderate anyone.
2. Import the matching Chat Guard Streamer.bot package. Leave both helpers triggerless; the legacy !guardtrust Command object may remain disabled.
3. Use the rule tester and privacy-safe moderation dashboard. Filter incidents and label false positives before changing enforcement rules.
4. To trust one viewer, reply to their message with !guardtrust as the broadcaster or a moderator. The main chat intake registers it automatically after restart.
5. Optional: approve Moderate, turn on both automatic-action safety switches, and begin with Warn. Use delete, timeout, or ban only after genuine live acceptance.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Chat Guard`

- `THSV Addon - Chat Guard - Moderate` in `THSV Addon - Chat Guard`
- `THSV Addon - Chat Guard - Trust Viewer` in `THSV Addon - Chat Guard`

Moderate must remain triggerless. It accepts only a one-use add-on relay token issued by StreamBridge.

Creator-selected triggers:

- **trustViewer:** Enable the imported !guardtrust command after reviewing it. Reply to a viewer's message with !guardtrust, or run it as the viewer being trusted. The action itself still requires broadcaster/moderator variables.

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
