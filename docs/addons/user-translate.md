# User Translate setup

**Module:** `thsv.user-translate`
**Version:** `2.5.1`
**Publisher:** THSV StreamBridge

Translates only explicit viewer requests through a disclosed no-key provider, then returns bounded results to the originating platform without retaining message text.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-User-Translate-2.5.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-User-Translate-2.5.1.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-User-Translate-2.5.1.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install and enable the add-on, then review the external translation privacy disclosure in its settings.
2. Import the User Translate Streamer.bot package and approve its Translate Text action for this add-on.
3. Choose the command prefix and enabled language codes in the add-on settings; no separate Streamer.bot command is required.
4. Examples: !translate es hello, !es hello, or on Twitch reply to a message with !es.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-alpha.31`.

Imported group: `THSV Addon - User Translate`

- `THSV Addon - User Translate - Translate Text` in `THSV Addon - User Translate`

Broker-dispatched only. Do not attach triggers; StreamBridge restricts calls to the creator-approved action ID.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.user-translate` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.user-translate.runtime:** Confirms bounded command handling, provider dispatch, and source-platform response routing.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `schedule.bounded`, `state.private`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.user-translate/`, `data/addons/.state/thsv.user-translate/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Only bounded cooldown metadata is retained; message text is never stored.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
