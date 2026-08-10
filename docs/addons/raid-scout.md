# Raid Scout setup

**Module:** `thsv.raid-scout`
**Version:** `3.5.0`
**Publisher:** THSV StreamBridge

Finds a safe live Twitch raid destination, retries bounded public clip previews, and can safely end the broadcast after Twitch reports that an ending ad has finished.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Raid-Scout-3.5.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Raid-Scout-3.5.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Raid-Scout-3.5.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the separate Raid Scout Streamer.bot package.
2. Keep its Controller action triggerless and approve that stable action ID as Raid Scout's fixed controller grant.
3. Attach Suggest, Confirm, and Cancel only to creator-controlled hotkeys, deck buttons, or operator commands.
4. For optional automatic broadcast ending, attach Ad Break Companion's Ad Run Intake to Twitch Ads > Ad Run. OBS/Aitum users select and approve the included Stop All OBS Streaming Outputs action; Meld/Streamlabs users select their provider-native action. Attach Broadcast Stopped only to the provider's Streaming Stopped trigger.
5. Optionally configure Streamer.bot-owned Twitch and Kick reward IDs for stream-scoped viewer suggestions.
6. For YouTube and TikTok, configure the suggestion command and Viewer Foundation points cost.
7. Configure preferred channels and filters, then test Suggest before enabling automatic mode.
8. In OBS, leave Browser Source hardware acceleration enabled and turn off Shutdown source when not visible for the Raid Scout source so its cached clip renderer is already warm when the raid preview begins.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Raid Scout`

- `THSV Addon - Raid Scout - Controller` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Suggest` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Confirm` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Cancel` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Broadcast Stopped` in `THSV Addon - Raid Scout`

Controller must remain triggerless and is dispatched only through Raid Scout's approved stable action ID. Suggest, Confirm, and Cancel emit exact bounded controls and never contact Twitch directly. Broadcast Stopped only confirms a provider stop signal and cannot stop a broadcast. Viewer suggestions arrive through the existing THSV Twitch Intake reward trigger, not a new Raid Scout trigger.

Creator-selected triggers:

- **suggest:** Attach only to a creator-controlled hotkey, deck button, or operator command.
- **confirm:** Attach only to a creator-controlled hotkey, deck button, or operator command.
- **cancel:** Attach only to a creator-controlled hotkey, deck button, or operator command.
- **broadcastStopped:** Attach only to the Streaming Stopped trigger for the same OBS, Meld, or Streamlabs provider used by the selected Stop Streaming action.

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
