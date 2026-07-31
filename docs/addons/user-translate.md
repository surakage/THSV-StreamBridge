# Translate setup

**Module:** `thsv.user-translate`
**Version:** `2.5.1`
**Publisher:** THSV StreamBridge

Translate combines viewer commands and optional privacy-gated automatic translation. Results return only to the originating platform, and message text is never retained.

## Install

1. Install `THSV-Translate-2.5.1.thsv-addon` in **Setup Wizard > Add-ons**.
2. Import `Streamer.bot/THSV-StreamBridge-User-Translate-2.5.1.sb`.
3. Inspect Streamer.bot and approve only `THSV Addon - Translate - Translate Text`.
4. Do not attach a trigger to that action; StreamBridge dispatches it through the capability broker.
5. In the wizard choose Manual, Automatic, or Both, then select the provider and language pair.

The default Manual setup uses Google web, source `auto`, and target `en`. `!translate buenos dias` therefore translates Spanish text into English. MyMemory is the documented fallback and requires an explicit source language.

## Automatic mode

Automatic starts allowlist-only. Add exact viewer names or stable IDs, then review the ignore list, cooldowns, per-minute ceiling, and translated-chat percentage ceiling before enabling it for a wider audience.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-alpha.31`.

Imported group: `THSV Addon - Translate`

- `THSV Addon - Translate - Translate Text`

The action is broker-dispatched only and excluded from routine action history/pending views to reduce noise.

## Offline test

Static/offline validation confirms parsing, settings visibility, package integrity, provider bounds, and source-platform routing. A real translation requires network access and must be checked from live chat:

1. Send `!translate buenos dias`.
2. Confirm exactly one Translate action runs.
3. Confirm the English response returns only to the source platform.
4. Enable Both with one allowlisted test account and confirm only that account's eligible ordinary messages translate.

## Data and permissions

Permissions: `events.subscribe`, `chat.send`, `schedule.bounded`, `state.private`, `streamerbot.run-approved-action`.

Private storage contains correlation and cooldown metadata only:

- `data/addons/thsv.user-translate/`
- `data/addons/.state/thsv.user-translate/`

See [Translate](../user-translate.md) for provider disclosure, privacy rules, migration, and acceptance steps.
