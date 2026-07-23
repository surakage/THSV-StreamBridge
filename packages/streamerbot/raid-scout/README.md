# THSV StreamBridge - Raid Scout

This companion package contains:

- `THSV Addon - Raid Scout - Controller`: keep triggerless and approve only for `thsv.raid-scout`.
- `THSV Addon - Raid Scout - Suggest`: starts one bounded discovery request.
- `THSV Addon - Raid Scout - Confirm`: starts only the current unexpired suggestion.
- `THSV Addon - Raid Scout - Cancel`: clears the current suggestion.

The Controller uses fixed Twitch Helix GET endpoints, a ten-second request timeout, at most three followed-stream pages, at most forty relayed candidates, bounded response bodies, and no retries on rate limiting. It never emits or logs the Twitch token or client ID. Only Confirm or advanced automatic mode can call the documented `TwitchStartRaidById`/`TwitchStartRaidByName` methods.

Required C# references:

- `mscorlib.dll`
- `System.dll`
- `System.Core.dll`
- `System.Net.Http.dll`
- `netstandard.dll`
- `Newtonsoft.Json.dll`

The broadcaster Twitch account must be authenticated in Streamer.bot. Followed-live discovery also depends on Twitch granting `user:read:follows`; if unavailable, Raid Scout reports that source as unavailable and can still use other enabled sources.
