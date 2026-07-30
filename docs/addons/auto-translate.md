# Auto Translate setup

**Module:** `thsv.auto-translate`
**Version:** `2.5.1`
**Publisher:** THSV StreamBridge

Automatically translates creator-selected public chat through a disclosed provider with allowlist-first privacy controls and strict spam limits.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Auto-Translate-2.5.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Auto-Translate-2.5.1.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Auto-Translate-2.5.1.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install the add-on but leave it disabled until its privacy notice, languages, audience, and rate limits are reviewed.
2. Import the Auto Translate Streamer.bot package and approve only its Translate Text action.
3. Set a known source language and a different target language. Automatic language detection is not claimed.
4. Add viewer names to the allowlist before enabling the default allowlist-only mode.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-alpha.31`.

Imported group: `THSV Addon - Auto Translate`

- `THSV Addon - Auto Translate - Translate Text` in `THSV Addon - Auto Translate`

Broker-dispatched only. Do not attach triggers; StreamBridge restricts calls to the creator-approved action ID.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.auto-translate` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.auto-translate.runtime:** Confirms privacy-gated message selection, bounded provider dispatch, and source-platform response routing.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `schedule.bounded`, `state.private`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.auto-translate/`, `data/addons/.state/thsv.auto-translate/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Bounded cooldown metadata is preserved; chat and translated text are never stored.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
