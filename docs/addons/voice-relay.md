# Village Voice setup

**Module:** `thsv.voice-relay`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Routes selected alerts and cross-platform viewer TTS requests through one bounded Speaker.bot queue with an optional avatar and progressive-text overlay.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Village-Voice-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Village-Voice-4.0.3.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Voice-Relay-4.0.3.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Connect Speaker.bot in Streamer.bot.
2. Import Village Voice, approve only Speak, and test a harmless phrase.
3. For Twitch and Kick, attach the matching native Reward Redemption trigger to the existing platform intake.
4. For YouTube and TikTok, choose the request command and enable Viewer Foundation points. The command registers automatically after restart.
5. Add /overlay/addons/thsv.voice-relay as a browser source for the optional speaking card.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Voice Relay`

- `THSV Addon - Voice Relay - Speak` in `THSV Addon - Voice Relay`
- `THSV Addon - Voice Relay - Pause` in `THSV Addon - Voice Relay`
- `THSV Addon - Voice Relay - Resume` in `THSV Addon - Voice Relay`
- `THSV Addon - Voice Relay - Stop` in `THSV Addon - Voice Relay`

Speak is triggerless and requires a one-use broker token. Controls use an exact source/payload allowlist.

Creator-selected triggers:

- Attach Pause/Resume/Stop only to creator controls.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.voice-relay` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.voice-relay.runtime:** Confirms bounded filtered Speaker.bot dispatch and viewer-request routing are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `overlay.publish`, `chat.send`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.voice-relay/`, `data/addons/.state/thsv.voice-relay/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstall Village Voice. It retains no spoken text history.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
