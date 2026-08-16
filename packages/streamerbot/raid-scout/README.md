# THSV StreamBridge - Raid Scout

This companion package contains:

- `THSV Addon - Raid Scout - Controller`: keep triggerless and approve as Raid Scout's fixed controller grant.
- `THSV Addon - Raid Scout - Suggest`: starts one bounded discovery request.
- `THSV Addon - Raid Scout - Finish Stream`: one creator press runs discovery and then continues through every enabled clip, ending-ad, raid, and broadcast-stop step.
- `THSV Addon - Raid Scout - Confirm`: starts only the current unexpired suggestion.
- `THSV Addon - Raid Scout - Cancel`: clears the current suggestion.
- `THSV Addon - Raid Scout - Broadcast Stopped`: confirms that the selected OBS, Meld, or Streamlabs provider emitted Streaming Stopped. It cannot stop a broadcast itself.
- `THSV Addon - Raid Scout - Run Ending Ad`: triggerless helper that asks Twitch to run one bounded ending commercial. Raid Scout still requires the genuine Ad Run trigger before starting its timer.
- `THSV Addon - Raid Scout - Test Go Live - OBS and Aitum`: creator-only test helper. It starts OBS main and then every discovered Aitum Multistream and Aitum Vertical broadcast output. It is idempotent, excludes recording/replay/virtual-camera outputs, and reports each destination independently. Keep it triggerless or attach it only to a protected creator Stream Deck button or hotkey. Supplying `thsvGoLiveTestDryRun=true` inspects and compiles the action without starting any broadcast.
- `THSV Addon - Raid Scout - Stop All OBS Streaming Outputs`: triggerless OBS/Aitum helper. It uses OBS WebSocket's output list to stop active service-backed horizontal outputs, calls Aitum Vertical's dedicated `stop_streaming` vendor request, gives secondary outputs one shared confirmation window, then stops the main OBS stream unconditionally. Aitum failures are reported but cannot hold OBS main online. Recording, replay buffer, and virtual camera outputs are not targeted.

The Controller uses fixed Twitch Helix GET endpoints, a ten-second request timeout, at most three followed-stream pages, at most 100 relayed candidates or public clip records, bounded response bodies, and no retries on rate limiting. It never emits or logs the Twitch token or client ID. The clip lookup returns only bounded public metadata for the selected broadcaster; StreamBridge chooses one at random and uses direct, embed, cache, timeout, and skip-preview fallbacks before continuing the confirmed raid. Finish Stream, Confirm, or advanced automatic mode can call the documented `TwitchStartRaidById`/`TwitchStartRaidByName` methods; a rejected ID attempt falls back once to the verified login. The same triggerless controller can fulfill a valid viewer-suggestion reward or cancel and refund an invalid one through the documented Twitch redemption methods; the add-on supplies only stable IDs received through the verified Twitch intake.

Required C# references:

- `mscorlib.dll`
- `System.dll`
- `System.Core.dll`
- `System.Net.Http.dll`
- `netstandard.dll`
- `Newtonsoft.Json.dll`

The broadcaster Twitch account must be authenticated in Streamer.bot. Followed-live discovery also depends on Twitch granting `user:read:follows`; if unavailable, Raid Scout reports that source as unavailable and can still use other enabled sources.

Keep **Run Ending Ad** triggerless and approve it for Raid Scout. In the wizard, choose the application that owns the broadcast: **OBS Studio**, **Meld Studio**, or **Streamlabs Desktop**. For OBS with Aitum Multistream, select and approve the included **Stop All OBS Streaming Outputs** action. For Meld, select an action containing **Meld Studio > Stop Streaming**. For Streamlabs, select an action containing **Streamlabs Desktop > Stop Streaming**. Attach Ad Break Companion's Ad Run Intake to Twitch Ads > Ad Run, and attach the imported Broadcast Stopped action only to the selected provider's Streaming Stopped trigger. Recommended after-ad mode requests or adopts the commercial when Suggest begins, completes discovery and the selected clip during that window, attempts the raid after clip completion, and stops after Twitch's genuine reported ad duration whether the raid succeeds, fails, or times out. Aitum's stable output-name prefix and its RTMP, WHIP, FTL, and MPEG-TS transports are stopped before OBS main; recording, replay buffer, and virtual camera remain untouched. The Cancel action aborts only before the stop action has been dispatched.

For upgrades, back up Streamer.bot before importing the matching versioned package. If a Streamer.bot beta rejects an in-place same-ID replacement as **Invalid Export**, remove only the old **THSV Addon - Raid Scout** group after the backup, then import the package once as a clean replacement.
