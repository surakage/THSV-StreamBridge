# THSV StreamBridge - Quote Vault

Quote Vault handles its normal commands directly from StreamBridge's normalized Twitch, YouTube, Kick, and TikTok public chat. Do not create duplicate platform triggers for those commands.

This optional Streamer.bot package adds two creator controls:

- `THSV Addon - Quote Vault - Random Quote`
- `THSV Addon - Quote Vault - Statistics`

Each action has an editable `quoteVaultSourcePlatform` Set Argument. Use `twitch`, `youtube`, `kick`, or `tiktok`. The Random Quote action can be attached to a creator-controlled hotkey, deck button, timer, or scene action. Statistics should normally remain a private creator control.

The actions broadcast only the requested operation and destination platform. Quote text and library state stay inside Quote Vault's private local storage.

Required C# references:

- `mscorlib.dll`
- `System.dll`
- `netstandard.dll`
- Streamer.bot's bundled `Newtonsoft.Json.dll`

After importing, open both Execute C# Code sub-actions and select **Save and Compile**. The package is optional; public quote commands work without it.
