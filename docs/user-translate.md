# Translate add-on

Translate combines the former User Translate and Auto Translate features in one add-on, one settings page, and one broker-approved Streamer.bot action.

## Choose a mode

- **Manual** (recommended starting point): translates only explicit viewer commands.
- **Automatic**: translates eligible ordinary chat according to the allowlist, ignore list, cooldowns, and rate limits.
- **Both**: enables both paths.

Manual examples with the default English output language:

- `!translate buenos dias`
- `!translate fr hello` to override the output language
- `!es hello` using a configured language shortcut
- Twitch only: reply to another viewer's message with `!en`

Commands are read from normalized public chat. Do not create a separate Streamer.bot command or attach a trigger to the Translate Text action.

## Setup

1. Install `THSV-Translate-2.6.0.thsv-addon` from the matching release bundle.
2. Import `Streamer.bot/THSV-StreamBridge-User-Translate-2.6.0.sb`.
3. Inspect Streamer.bot in the wizard and approve only `THSV Addon - Translate - Translate Text`.
4. Choose Manual, Automatic, or Both.
5. Select a provider and language pair:
   - **Google web** supports `auto` source detection and makes `!translate buenos dias` work without knowing the source language. It is an undocumented consumer endpoint, not Google Cloud Translation, and may change without notice.
   - **MyMemory** has a documented no-key API but requires a fixed source language such as `es`; it cannot use `auto`.
6. If enabling Automatic, begin with **allowlist-only** and add a small set of exact viewer names or stable IDs.

## Privacy and safety

Eligible source text leaves the local computer and is sent to the selected provider over HTTPS. StreamBridge stores bounded correlation, cooldown, and rate metadata, but never stores the source or translated message.

Automatic mode skips commands, bots, system messages, simulated events, duplicates, ignored viewers, and viewers outside the allowlist when allowlist-only mode is selected. Per-viewer/global cooldowns, a bounded waiting queue, a per-minute ceiling, and a translated-chat percentage ceiling prevent spam.

Do not submit private or sensitive information. Google processes traffic under its [privacy policy](https://policies.google.com/privacy). MyMemory processes traffic under its [terms](https://mymemory.translated.net/terms-and-conditions).

## Live acceptance

1. Confirm the add-on is enabled and the one Translate action is approved.
2. Set provider to Google web, source to `auto`, target to `en`, and mode to Manual.
3. Send `!translate buenos dias`; expect one English response on that same platform.
4. Send `!translate fr hello`; expect one French response.
5. Set mode to Both, keep allowlist-only, add one test account, and send ordinary non-command text from that account; expect one response.
6. Send ordinary text from a viewer not on the allowlist; expect no provider request and no response.
7. Run a simulated event; expect no provider traffic or live chat output.

## Upgrading from the former Auto Translate package

The separate `thsv.auto-translate` package has been removed. Before uninstalling an older installation, copy its allow/ignore lists into Translate, select Automatic or Both, and verify the result. Do not enable both implementations during migration.
