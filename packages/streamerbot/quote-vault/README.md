# THSV StreamBridge - Quote Vault

Quote Vault handles its normal commands directly from StreamBridge's normalized Twitch, YouTube, Kick, and TikTok public chat. Do not create duplicate platform triggers for those commands.

This optional Streamer.bot package adds two creator controls and one broker-only synchronization action:

- `THSV Addon - Quote Vault - Random Quote`
- `THSV Addon - Quote Vault - Statistics`
- `THSV Addon - Quote Vault - Native Quote Sync`

Each action has an editable `quoteVaultSourcePlatform` Set Argument. Use `twitch`, `youtube`, `kick`, or `tiktok`. The Random Quote action can be attached to a creator-controlled hotkey, deck button, timer, or scene action. Statistics should normally remain a private creator control.

Native Quote Sync imports existing Streamer.bot quotes into the wizard and optionally mirrors newly approved Twitch, YouTube, and Kick Quote Vault records. Quote Vault remains authoritative because Streamer.bot has no native TikTok quote writer and no in-place quote edit API. Do not attach Native Quote Sync to a trigger; approve it only in Quote Vault's action grants.

Required C# references:

- `mscorlib.dll`
- `System.dll`
- `netstandard.dll`
- Streamer.bot's bundled `Newtonsoft.Json.dll`

After importing, open both Execute C# Code sub-actions and select **Save and Compile**. The package is optional; public quote commands work without it.
