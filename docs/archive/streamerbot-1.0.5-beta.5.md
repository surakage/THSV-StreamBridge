# Streamer.bot 1.0.5-beta.5 adoption

THSV StreamBridge recommends Streamer.bot `1.0.5-beta.5` for new installations and upgrades from earlier 1.0.5 pre-release builds. Beta software remains optional: back up the complete Streamer.bot folder and keep the previous working installation until the focused checks below pass.

The authoritative upstream history is the [Streamer.bot 1.0.5 changelog](https://streamer.bot/changelogs/v1.0.5). Beta.5 reports fixes and guards in areas that overlap THSV usage:

- retry handling for OBS WebSocket v5 requests, including the `207 not ready` failure
- safer Speaker.bot Speak testing and improved Speak timeout handling
- additional Twitch user-information and broadcaster-login guards
- Local Signals performance and lifecycle changes
- safer YouTube Broadcast information saving
- crash fixes for HypeRate, invalid file/folder-dialog paths, corrupt clipboard OLE data, and several client disconnect paths

## THSV impact

No normalized event, add-on API, WebSocket request, C# reference, trigger, or package-manifest change is required for beta.5. Existing THSV `2.6.0` imports do not need to be re-imported solely because Streamer.bot was upgraded, and package minimum versions remain at their oldest verified compatible floors.

- **Scene Actions and Stream Launch Countdown:** approved creator actions that control OBS benefit from Streamer.bot's own retry behavior. Scene Actions itself relays documented scene-change arguments and does not issue OBS requests.
- **Voice Relay:** `CPH.TtsSpeak` remains the adopted method. THSV already bounds the phrase, requires an existing voice alias, serializes requests, and catches method failures; beta.5 improves the host-side timeout and test-dialog behavior.
- **Automated Shoutouts, Raid Scout, and Native Platform Intake:** their Twitch extended-user lookups already prefer stable IDs where available, null-check returned objects, catch lookup exceptions, and fail or omit optional profile data safely. No compatibility shim is needed for the new upstream guards.
- **Local Signals:** THSV does not depend on Local Signals for its bridge transport. The existing authenticated Streamer.bot WebSocket remains the sole automation connection.

Do not label beta.5 as THSV live-accepted until it is installed and the focused checks pass. The most recent directly recorded Streamer.bot evidence remains beta.2: grouped actions, bridge connectivity, harmless Twitch/YouTube/Kick intake tests, and audible Voice Relay acceptance. That evidence does not automatically transfer to beta.5.

## Focused beta.5 acceptance checklist

1. Back up the complete Streamer.bot folder, install beta.5, and confirm Twitch, YouTube, Kick, OBS, Speaker.bot, and the WebSocket server reconnect without repeating errors.
2. Confirm the existing THSV action groups and creator-owned triggers remain present. Do not re-import unchanged packages just to test the host update.
3. Run one harmless Twitch, YouTube, and Kick chat **Test Trigger**. Confirm each Native Intake reports `platformRelayValid=True` and reaches StreamBridge once.
4. Test **THSV Addon - Voice Relay - Speak** with a short phrase and each configured voice alias. Confirm Action History completes and Speaker.bot speaks once.
5. Trigger one harmless OBS scene mapping, then run Stream Launch Countdown against an approved non-production scene. Confirm a temporary OBS `not ready` response is retried rather than crashing Streamer.bot.
6. Exercise one Twitch profile lookup through Automated Shoutouts or Raid Scout Suggest. An unavailable user must produce a bounded failure or no-match result, not stop the action queue.
7. Run one YouTube Broadcast test only if those fields are configured, then save and reopen the dialog to confirm the values remain intact.
8. Check Streamer.bot Action History and StreamBridge diagnostics for duplicate intake, failed relay, reconnect loops, unexpected timeouts, or changed arguments.

Record the date, Streamer.bot version, THSV version, tested integrations, and pass/fail evidence in the wizard acceptance ledger. A test trigger proves mapping and routing; only a genuine provider event counts as provider acceptance.

## Version policy

- Recommended Streamer.bot build: `1.0.5-beta.5`
- Latest directly recorded THSV host evidence: `1.0.5-beta.2`
- Oldest core compatibility floor: `1.0.5-alpha.31`
- Add-on/package minimums: the value declared by each package manifest

Raise a package's `minimumStreamerBotVersion` only when it adopts an API or required behavior unavailable in its existing minimum—not merely because a newer Streamer.bot build was released.
