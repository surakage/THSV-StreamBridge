# THSV StreamBridge - Translate

Import `THSV-StreamBridge-User-Translate-2.5.2.sb`, compile the one action with the references in `manifest.json`, and approve `THSV Addon - Translate - Translate Text` for `thsv.user-translate` in the wizard.

Do not attach a trigger. The StreamBridge capability broker dispatches the action for both manual and automatic modes.

The action supports:

- Google web: source-language detection with `sourceLanguage=auto`. This is a disclosed, undocumented consumer endpoint and may change without notice.
- MyMemory: documented no-key fallback requiring an explicit source language.

Both paths enforce HTTPS, bounded UTF-8 segments, response-size limits, and timeouts. The action never logs or stores source or translated text. Provider failures return only a generic error code through the authenticated add-on relay.

Default command examples are `!translate buenos dias`, `!translate fr hello`, and `!es hello`. Twitch replies can use a language shortcut such as `!en`. No separate Streamer.bot command object is required.
