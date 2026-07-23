# User Translate add-on

User Translate is an explicit, command-driven add-on. It remains separate from Auto Translate: ordinary messages are never sent to a translation provider through this add-on.

## Setup

1. Download and extract `THSV-StreamBridge-AddOn-User-Translate-1.0.0.zip`, then install its `.thsv-addon` in the authenticated wizard.
2. Import `Streamer.bot/THSV-StreamBridge-User-Translate-2.4.0.sb` from the same extracted bundle into Streamer.bot.
3. Inspect Streamer.bot from the wizard, approve `THSV Addon - User Translate - Translate Text` for the add-on, and save the grant.
4. Choose the command prefix and language codes in the add-on settings. The add-on reads them from normalized public chat, so no separate Streamer.bot command is required.
5. Set the known source language. MyMemory's documented API requires it; `auto` is not a valid source language.

Examples:

- `!es hello everyone`
- `!translate fr welcome to the stream`
- Twitch only: reply to another viewer's message with `!en`

## Privacy and safety

Requested text is transmitted over HTTPS to MyMemory, a service operated by Translated. StreamBridge stores only bounded request correlation and cooldown metadata; it does not store the source or translated message. MyMemory processes API traffic under its [terms and privacy policy](https://mymemory.translated.net/terms-and-conditions). Creators should disclose this feature and tell viewers not to submit private or sensitive text.

Requests have per-user and global cooldowns, a bounded waiting queue, an 8-second default timeout, and a four-segment ceiling. Output returns only to the originating platform and is split by StreamBridge's platform-aware outbound router when required.

## Current limitations

- The default provider requires an explicit source language and daily usage limits apply.
- Reply-to-message translation is available for Twitch only. YouTube, Kick, and TikTok use text supplied after the command.
- Machine translation may be inaccurate or inappropriate. The add-on does not make moderation decisions from translations.

## Live acceptance

1. Start StreamBridge, open the Add-ons page, and confirm User Translate is installed, enabled, and has only `THSV Addon - User Translate - Translate Text` approved.
2. Import the add-on's Streamer.bot package and compile the action with the references listed in its package README. Do not attach a trigger to the action.
3. Send `!es hello everyone` from one enabled platform. Confirm exactly one translation request appears in Streamer.bot and the reply returns only to that source platform.
4. On Twitch, reply to another viewer's message with `!es`. Confirm the translated response keeps the original replied-to viewer as the author.
5. Send a command without text and confirm the tutorial returns only to the source platform without contacting the provider.
6. Repeat within the configured viewer and global cooldowns and confirm no second provider request is dispatched.
7. Run a simulated chat event and confirm it produces neither provider traffic nor live outbound chat.
8. Disconnect the network or temporarily use an invalid language pair and confirm the bounded error message appears without source text being logged or persisted.
