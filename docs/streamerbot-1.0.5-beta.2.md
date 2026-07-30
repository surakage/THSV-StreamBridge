# Streamer.bot 1.0.5-beta.2 adoption

THSV StreamBridge recommends Streamer.bot `1.0.5-beta.2` for new installations and upgrades from earlier 1.0.5 pre-release builds. Beta software remains optional: back up the complete Streamer.bot folder before upgrading and keep the previous working installation until acceptance passes.

The authoritative upstream history is the [Streamer.bot changelog](https://docs.streamer.bot/changelogs). The beta.2 release notes report fixes and updates in these areas that overlap THSV usage:

- Twitch Lead Moderator recognition, `FirstMessage` handling, anonymous-user stability, emote-handler initialization, and authentication behavior
- Kick authentication, presence checks, and dynamically enabled emote handlers
- OBS Studio v5 WebSocket connection handling
- Streamer.bot HTTP-server error handling, VoiceMod 2.x connection timeouts, action/sub-action logging, and Select Action dialog performance
- restoration of the earlier Linux/WebView2 behavior

## THSV impact

No normalized event, add-on API, WebSocket request, C# reference, or package-manifest change is required for beta.2. Existing THSV `2.5.0` imports do not need to be re-imported solely because Streamer.bot was upgraded.

The Twitch fixes should improve first-time-chatter automation, moderator gates, Chat Guard decisions, and Automated Shoutouts. The Kick changes affect connection reliability rather than THSV's normalized contract. The OBS v5 change benefits Scene Actions and Stream Launch Countdown when their approved Streamer.bot actions control OBS. The HTTP-server fixes concern Streamer.bot's server and do not replace StreamBridge's separate loopback service on port `8787`.

Do not call beta.2 the complete THSV live-verified baseline yet. Beta.1 remains the last build with recorded THSV startup, focused C# compilation, controller relay, reward mutation, and reset evidence. The beta.2 intake-routing evidence below is narrower and does not replace those provider and mutation checks.

## Recorded beta.2 evidence

On July 28, 2026, the installed Streamer.bot `1.0.5-beta.2` instance was inspected directly with THSV `2.5.0`:

- Streamer.bot displayed `93` actions, with core platform actions in their existing THSV groups and every installed action-bearing add-on in its own `THSV Addon - <Name>` group.
- StreamBridge connected to Streamer.bot's authenticated WebSocket at `ws://127.0.0.1:8081/` and reported `healthy` and `ready`.
- Streamer.bot initially displayed `Partially Connected (8/10)` while Meld and Speaker.bot were unused. Speaker.bot was subsequently connected for Voice Relay and passed audible alias/playback acceptance; Meld remains intentionally unused because OBS is the adopted browser host.
- Streamer.bot's harmless **Test Trigger** was run once for Twitch Chat Message, YouTube Message, and Kick Chat Message.
- StreamBridge recorded exactly one accepted, non-duplicate, durably queued `chat.message` event for each platform.

This proves the three installed native intake actions, normalized routing, and durable bridge ingress on beta.2. It does not prove a genuine viewer event, first-message or moderator fields, provider reconnect behavior, public chat output, rewards, financial events, or scene mutations.

## Focused re-acceptance checklist

After updating Streamer.bot:

1. Start Streamer.bot and confirm Twitch, YouTube, Kick, OBS, and the WebSocket server reconnect without repeated errors.
2. Open each installed THSV **Execute C# Code** sub-action and select **Save and Compile**. Record any compiler failure before changing references.
3. Run one Twitch ordinary chat test, one first-message test, and one moderator or Lead Moderator test. Confirm the Native Intake completes with `platformRelayValid=True` and the expected role/first-message fields.
4. Run one YouTube chat or Jewels test and one Kick chat or subscription test. Confirm each intake completes once and the bridge reports the accepted event.
5. Run one simulated alert and confirm it appears once in the Alerts overlay without a live side effect.
6. If OBS scene automation is used, test one Scene Actions mapping and one Stream Launch Countdown completion against a harmless scene.
7. Test any installed reward controller in simulation first. Perform a real redemption only after the simulated relay and rollback path pass.
8. Check Streamer.bot Action History and StreamBridge diagnostics for duplicate intake, failed relay, reconnect loops, or changed argument names.

Record the date, Streamer.bot version, THSV version, tested integrations, and pass/fail evidence in the wizard acceptance ledger. A test-trigger result proves mapping and routing; only a genuine live-viewer event counts as provider acceptance.

## Version policy

- Recommended Streamer.bot build: `1.0.5-beta.2`
- Last recorded THSV live-smoke build: `1.0.5-beta.1`
- Oldest core compatibility floor: `1.0.5-alpha.31`
- Add-on/package minimums: the value declared by each package manifest

Raise a package's `minimumStreamerBotVersion` only when it adopts an API or required behavior unavailable in its existing minimum—not merely because a newer Streamer.bot build was released.
