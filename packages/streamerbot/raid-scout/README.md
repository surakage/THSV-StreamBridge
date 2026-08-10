# THSV StreamBridge - Raid Scout

This companion package contains:

- `THSV Addon - Raid Scout - Controller`: keep triggerless and approve as Raid Scout's fixed controller grant.
- `THSV Addon - Raid Scout - Suggest`: starts one bounded discovery request.
- `THSV Addon - Raid Scout - Confirm`: starts only the current unexpired suggestion.
- `THSV Addon - Raid Scout - Cancel`: clears the current suggestion.
- `THSV Addon - Raid Scout - Broadcast Stopped`: confirms that the selected OBS, Meld, or Streamlabs provider emitted Streaming Stopped. It cannot stop a broadcast itself.
- `THSV Addon - Raid Scout - Run Ending Ad`: triggerless helper that asks Twitch to run one bounded ending commercial. Raid Scout still requires the genuine Ad Run trigger before starting its timer.
- `THSV Addon - Raid Scout - Stop All OBS Streaming Outputs`: triggerless OBS/Aitum helper. It uses OBS WebSocket's output list to stop active service-backed streaming outputs, then stops the main OBS stream. Recording, replay buffer, and virtual camera outputs are not targeted.

The Controller uses fixed Twitch Helix GET endpoints, a ten-second request timeout, at most three followed-stream pages, at most forty relayed candidates or public clip records, bounded response bodies, and no retries on rate limiting. It never emits or logs the Twitch token or client ID. The clip lookup returns only bounded public metadata for the selected broadcaster; StreamBridge chooses one at random, resolves its direct MP4 through Streamer.bot, and caches it locally before native overlay playback. Only Confirm or advanced automatic mode can call the documented `TwitchStartRaidById`/`TwitchStartRaidByName` methods. The same triggerless controller can fulfill a valid viewer-suggestion reward or cancel and refund an invalid one through the documented Twitch redemption methods; the add-on supplies only stable IDs received through the verified Twitch intake.

Required C# references:

- `mscorlib.dll`
- `System.dll`
- `System.Core.dll`
- `System.Net.Http.dll`
- `netstandard.dll`
- `Newtonsoft.Json.dll`

The broadcaster Twitch account must be authenticated in Streamer.bot. Followed-live discovery also depends on Twitch granting `user:read:follows`; if unavailable, Raid Scout reports that source as unavailable and can still use other enabled sources.

Keep **Run Ending Ad** triggerless and approve it for Raid Scout. For OBS with Aitum Multistream, select and approve the included **Stop All OBS Streaming Outputs** action. For Meld or Streamlabs, create and select the matching provider-native Stop Streaming action instead. Attach Ad Break Companion's Ad Run Intake to Twitch Ads > Ad Run, and attach the imported Broadcast Stopped action only to the matching provider's Streaming Stopped trigger. Recommended after-ad mode respects Twitch's eight-minute commercial cooldown, waits for a genuine Ad Run confirmation before starting the raid, uses Twitch's reported duration, reuses an already-active ad, and leaves the stream live if no genuine ad event arrives. The Cancel action aborts only before the stop action has been dispatched.

For upgrades, back up Streamer.bot before importing the matching versioned package. If a Streamer.bot beta rejects an in-place same-ID replacement as **Invalid Export**, remove only the old **THSV Addon - Raid Scout** group after the backup, then import the package once as a clean replacement.
