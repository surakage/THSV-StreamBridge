# Automated Shoutouts Streamer.bot package

This optional package contains three triggerless actions:

- `Lookup Twitch Creator` reads the documented Twitch extended-user `Game` category and profile picture, then returns only that bounded result. Approve it whenever Twitch triggers are enabled.
- `Twitch Native Shoutout` calls Twitch's native shoutout API. Approve it only when **Twitch shoutout mode** is `native` or `both`.
- `Get Twitch Clip` uses Streamer.bot's supported clip lookup and download methods for the verified Twitch target. Approve it only when **Twitch popup style** is `Random Twitch clip`.

Do not attach triggers. In the StreamBridge wizard, inspect Streamer.bot and approve the needed action IDs for Automated Shoutouts. The bridge capability broker restricts the add-on to those creator-approved IDs. The supplied argument is an accidental-manual-run guard, not a security boundary; the local creator still owns Streamer.bot and can run their own actions directly.

The action uses Streamer.bot's documented `CPH.TwitchSendShoutoutById` method when a stable Twitch ID exists, falling back to `CPH.TwitchSendShoutoutByLogin`. Twitch requires the broadcaster to be live, permits one native shoutout every two minutes, and permits the same target once per hour. The add-on reserves those cooldowns before dispatch so a crash cannot repeat the native call.

The lookup action requires:

- `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\mscorlib.dll`
- `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.dll`
- `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\netstandard.dll`
- `.\Newtonsoft.Json.dll`

The clip action uses the same references as the lookup action. The native action requires only `mscorlib.dll` and `System.dll`.

The clip action does not edit OBS scenes, download files permanently, call undocumented Twitch GQL endpoints, or open another WebSocket. It returns one short-lived HTTPS playback URL to StreamBridge's core-owned hosted overlay.
