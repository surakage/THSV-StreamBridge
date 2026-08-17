# Raid Scout setup

**Module:** `thsv.raid-scout`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Finds a safe live Twitch raid destination, retries bounded public clip previews, can request an ending Twitch ad, and safely ends only after Twitch reports that ad has finished.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Raid-Scout-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Raid-Scout-4.0.1.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Raid-Scout-4.0.1.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the separate Raid Scout Streamer.bot package.
2. Keep its Controller action triggerless and approve that stable action ID as Raid Scout's fixed controller grant.
3. Attach Finish Stream, Suggest, Confirm, and Cancel only to creator-controlled hotkeys, deck buttons, or operator commands. Finish Stream is the streamlined one-press path through every enabled ending step.
4. For optional automatic broadcast ending, keep Run Ending Ad triggerless and attach Ad Break Companion's Ad Run Intake to Twitch Ads > Ad Run. Choose OBS Studio, Meld Studio, or Streamlabs Desktop in the wizard, select and approve that provider's Stop Streaming action, and attach Broadcast Stopped only to the selected provider's Streaming Stopped trigger.
5. Optionally configure Streamer.bot-owned Twitch and Kick reward IDs for stream-scoped viewer suggestions.
6. For YouTube and TikTok, configure the suggestion command and Viewer Foundation points cost.
7. Configure preferred channels and filters, then test Suggest before enabling automatic mode.
8. In OBS, leave Browser Source hardware acceleration enabled and turn off Shutdown source when not visible for the Raid Scout source so its cached clip renderer is already warm when the raid preview begins.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Raid Scout`

- `THSV Addon - Raid Scout - Controller` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Suggest` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Finish Stream` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Confirm` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Cancel` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Broadcast Stopped` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Run Ending Ad` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Test Go Live - OBS and Aitum` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Stop All OBS Streaming Outputs` in `THSV Addon - Raid Scout`

Controller, Run Ending Ad, Test Go Live, and Stop All OBS Streaming Outputs ship triggerless. Test Go Live may be attached only to a protected creator control because it starts real OBS/Aitum broadcasts. Finish Stream, Suggest, Confirm, and Cancel emit exact bounded controls and never contact Twitch directly. Broadcast Stopped only confirms a provider stop signal. The ad action is dispatched once when the ending search begins; after clip completion and the raid attempt, the stop-all action is dispatched when the genuine Ad Run timer and configured safety gate finish even if Twitch rejects or cannot confirm the raid.

Creator-selected triggers:

- **suggest:** Attach only to a creator-controlled hotkey, deck button, or operator command.
- **confirm:** Attach only to a creator-controlled hotkey, deck button, or operator command.
- **cancel:** Attach only to a creator-controlled hotkey, deck button, or operator command.
- **broadcastStopped:** Attach only to the Streaming Stopped trigger for the same OBS, Meld, or Streamlabs provider used by the selected Stop Streaming action.
- **runEndingAd:** Keep triggerless. Raid Scout dispatches it when Suggest or Finish Stream begins so discovery, confirmation, and clip playback use the commercial window.
- **testGoLiveObsAndAitum:** Keep triggerless by default. Run it manually from Streamer.bot, or attach it only to a protected creator Stream Deck button or hotkey. Running it starts real broadcasts.
- **stopAllObsStreamingOutputs:** Keep triggerless. OBS/Aitum users may select and approve this action as Raid Scout's Stop Streaming action.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.raid-scout` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.raid-scout.runtime:** Confirms bounded discovery, filtering, non-repeating selection, and creator-confirmed Twitch raids.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`, `chat.send`, `overlay.publish`, `media.exclusive`, `media.cache`, `schedule.bounded`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.raid-scout/`, `data/addons/.state/thsv.raid-scout/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstall the add-on. Its bounded private suggestion and raid history remains preserved for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
