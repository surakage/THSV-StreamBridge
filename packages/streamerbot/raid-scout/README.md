# THSV StreamBridge - Raid Scout

This companion package contains:

- `THSV Addon - Raid Scout - Controller`: keep triggerless and approve only for `thsv.raid-scout`.
- `THSV Addon - Raid Scout - Suggest`: starts one bounded discovery request.
- `THSV Addon - Raid Scout - Confirm`: starts only the current unexpired suggestion.
- `THSV Addon - Raid Scout - Cancel`: clears the current suggestion.

The Controller uses fixed Twitch Helix GET endpoints, a ten-second request timeout, at most three followed-stream pages, at most forty relayed candidates or public clip records, bounded response bodies, and no retries on rate limiting. It never emits or logs the Twitch token or client ID. The clip lookup returns only bounded public metadata for the selected broadcaster; StreamBridge chooses one at random and uses Twitch's official embed. Only Confirm or advanced automatic mode can call the documented `TwitchStartRaidById`/`TwitchStartRaidByName` methods. The same triggerless controller can fulfill a valid viewer-suggestion reward or cancel and refund an invalid one through the documented Twitch redemption methods; the add-on supplies only stable IDs received through the verified Twitch intake.

Required C# references:

- `mscorlib.dll`
- `System.dll`
- `System.Core.dll`
- `System.Net.Http.dll`
- `netstandard.dll`
- `Newtonsoft.Json.dll`

The broadcaster Twitch account must be authenticated in Streamer.bot. Followed-live discovery also depends on Twitch granting `user:read:follows`; if unavailable, Raid Scout reports that source as unavailable and can still use other enabled sources.

For upgrades, back up Streamer.bot before importing the matching versioned package. If a Streamer.bot beta rejects an in-place same-ID replacement as **Invalid Export**, remove only the old **THSV Addon - Raid Scout** group after the backup, then import the package once as a clean replacement.
