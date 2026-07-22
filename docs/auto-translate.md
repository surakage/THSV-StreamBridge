# Auto Translate add-on

Auto Translate is a separate, disabled-by-default add-on for automatically translating selected public chat. It does not replace User Translate: User Translate handles explicit viewer commands, while Auto Translate can send ordinary creator-selected messages to the provider.

## Safety model

- The default audience is **allowlist only**, with an empty allowlist, so installing it cannot translate anyone automatically.
- Bot, system, simulated, empty, command-prefixed, ignored, duplicate, and same-language messages are rejected before provider dispatch.
- Per-viewer and global cooldowns, pending-request limits, a per-minute ceiling, and a translated-message percentage cap all apply independently.
- Only bounded correlation and cooldown metadata are stored. Source and translated chat text are never persisted or logged.
- Results return only to the platform that supplied the original message.

## Setup

1. Download and extract `THSV-StreamBridge-AddOn-Auto-Translate-1.0.0.zip`.
2. Install its `.thsv-addon` in the authenticated wizard, but leave automatic translation disabled.
3. Import `Streamer.bot/THSV-StreamBridge-Auto-Translate-1.0.0.sb` and approve only `THSV Addon - Auto Translate - Translate Text` for this add-on.
4. Set one known source language and a different target language. MyMemory does not provide automatic language detection through this endpoint.
5. Add exact viewer names or stable platform user IDs to the allowlist, review the limits and privacy disclosure, then enable it.

## Privacy and limitations

Every selected message is transmitted over HTTPS to MyMemory, operated by Translated. The provider may process message text and request metadata under its [terms and privacy policy](https://mymemory.translated.net/terms-and-conditions). Do not use this feature for private or sensitive messages.

Auto Translate assumes every selected message uses the configured source language. Mixed-language automatic detection is not claimed. Machine translation can be inaccurate or inappropriate and must not be used as a moderation decision.

## Live acceptance

1. Start with Auto Translate disabled and an empty allowlist. Send ordinary chat from every connected platform and confirm no provider action runs.
2. Import the add-on's Streamer.bot package, compile it with the references in its README, and approve only `THSV Addon - Auto Translate - Translate Text`. Do not attach a trigger to the action.
3. Configure different source and target languages, add one controlled viewer to the allowlist, and enable only one platform.
4. Send one ordinary message from that viewer. Confirm exactly one provider request occurs and the translation returns only to the originating platform.
5. Confirm a bot message, system message, command-prefixed message, ignored viewer, unlisted viewer, duplicate event, simulated event, and disabled platform produce no provider request.
6. Exercise the viewer cooldown, global cooldown, pending-request ceiling, per-minute ceiling, and translated-percentage cap. Each limit must suppress excess work independently without posting an error into chat.
7. Disable Auto Translate while a request is pending and confirm its result is consumed without a live chat response.
8. Review StreamBridge and Streamer.bot logs and the add-on state file. Confirm neither source nor translated message text is retained.
