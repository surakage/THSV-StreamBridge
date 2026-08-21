# Translate setup

**Module:** `thsv.user-translate`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Combines viewer-requested and privacy-gated automatic translation, then returns bounded results only to the originating platform without retaining message text.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Translate-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Translate-4.0.2.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-User-Translate-4.0.2.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install the add-on, choose Manual, Automatic, or Both, then review the provider privacy disclosure.
2. Import the Translate Streamer.bot package and approve its one Translate Text action.
3. Manual examples: !translate buenos dias, !translate fr hello, !es hello, or a Twitch reply containing !en.
4. Automatic mode starts allowlist-only and remains bounded by cooldown, percentage, and per-minute limits.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Translate`

- `THSV Addon - Translate - Translate Text` in `THSV Addon - Translate`

Broker-dispatched only. Do not attach triggers; StreamBridge restricts calls to the creator-approved action ID.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.user-translate` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.user-translate.runtime:** Confirms bounded manual/automatic selection, provider dispatch, and source-platform response routing.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `schedule.bounded`, `state.private`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.user-translate/`, `data/addons/.state/thsv.user-translate/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Only bounded cooldown metadata is retained; message text is never stored.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
