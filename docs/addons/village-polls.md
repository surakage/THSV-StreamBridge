# Village Polls setup

**Module:** `thsv.village-polls`
**Version:** `3.5.0`
**Publisher:** THSV StreamBridge

Runs one universal Twitch, YouTube, Kick, and TikTok chat poll with private hashed voting, shared announcements, and a result overlay.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Village-Polls-3.5.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Village-Polls-3.5.0.thsv-addon` and review its permissions.
3. No separate Streamer.bot import is required.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Turn on Village Polls and keep the default command prefix and names for the easiest setup.
2. Keep platform chat triggers on the main THSV intake actions; no separate poll commands or triggers are required in Streamer.bot.
3. Restart StreamBridge after saving the add-on settings.
4. Open and close one test poll, confirm announcements reach the supported chats, and add the Village Polls browser source when result cards should appear on stream.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.village-polls` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.village-polls.runtime:** Confirms bounded universal poll state, private hashed cross-platform voting, chat announcements, source confirmations, and result-overlay output are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.village-polls/`, `data/addons/.state/thsv.village-polls/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves the current poll definition and private vote state.

If setup drifts, inspect the main THSV intake actions in the wizard, restore the documented Command Sync templates or settings, then rerun the offline test.
