# Voice Relay setup

**Module:** `thsv.voice-relay`
**Version:** `2.5.1`
**Publisher:** THSV StreamBridge

Safely routes selected normalized alerts and opt-in chat to Speaker.bot through one bounded filtered queue.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Voice-Relay-2.5.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Voice-Relay-2.5.1.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Voice-Relay-2.5.1.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Connect Speaker.bot in Streamer.bot.
2. Import Voice Relay, approve only Speak, and test a harmless phrase.
3. Review filters and event types before enabling; attach Pause/Resume/Stop only to creator controls.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-beta.1`.

Imported group: `THSV Addon - Voice Relay`

- `THSV Addon - Voice Relay - Speak` in `THSV Addon - Voice Relay`
- `THSV Addon - Voice Relay - Pause` in `THSV Addon - Voice Relay`
- `THSV Addon - Voice Relay - Resume` in `THSV Addon - Voice Relay`
- `THSV Addon - Voice Relay - Stop` in `THSV Addon - Voice Relay`

Speak is triggerless and requires a one-use broker token. Controls use an exact source/payload allowlist.

Creator-selected triggers:

- **0:** Attach Pause/Resume/Stop only to creator controls.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.voice-relay` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.voice-relay.runtime:** Confirms bounded filtered Speaker.bot dispatch is available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`.

Private storage: `data/addons/thsv.voice-relay/`, `data/addons/.state/thsv.voice-relay/`.

Dependencies: none.

## Remove or repair

1. Uninstall Voice Relay. It retains no spoken text history.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
