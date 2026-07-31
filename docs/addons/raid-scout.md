# Raid Scout setup

**Module:** `thsv.raid-scout`
**Version:** `2.5.2`
**Publisher:** THSV StreamBridge

Finds a safe live Twitch raid destination from creator or viewer-suggested preferred channels, followed-live channels, or the current category, shows each search phase in the private overlay, then requires creator confirmation before starting the raid.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Raid-Scout-2.5.2.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Raid-Scout-2.5.2.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Raid-Scout-2.5.2.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the separate Raid Scout Streamer.bot package.
2. Keep its Controller action triggerless and approve only that stable action ID for this add-on.
3. Attach Suggest, Confirm, and Cancel only to creator-controlled hotkeys, deck buttons, or operator commands.
4. Optionally configure one Streamer.bot-owned Twitch reward ID for stream-scoped viewer suggestions.
5. Configure preferred channels and filters, then test Suggest before enabling automatic mode.
6. Optional: enable **Play one random clip before starting the confirmed raid**. Keep the Raid Scout overlay URL open so the official Twitch clip embed can play.
7. Keep **Pause other THSV video overlays during the raid preview** enabled when Random Clip Player shares the ending scene. Confirm claims one bounded internal video slot, fades out Random Clip Player without disabling it, and releases the slot on cancellation or failure.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-alpha.33`.

Imported group: `THSV Addon - Raid Scout`

- `THSV Addon - Raid Scout - Controller` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Suggest` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Confirm` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Cancel` in `THSV Addon - Raid Scout`

Controller must remain triggerless and is dispatched only through Raid Scout's approved stable action ID. Suggest, Confirm, and Cancel emit exact bounded controls and never contact Twitch directly. Viewer suggestions arrive through the existing THSV Twitch Intake reward trigger, not a new Raid Scout trigger.

Creator-selected triggers:

- **suggest:** Attach only to a creator-controlled hotkey, deck button, or operator command.
- **confirm:** Attach only to a creator-controlled hotkey, deck button, or operator command.
- **cancel:** Attach only to a creator-controlled hotkey, deck button, or operator command.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.raid-scout` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

Search phases are overlay-only and report each configured source as found, none found, skipped, or unavailable. The optional clip is fetched only after Confirm, is not downloaded or retained, and falls through to the confirmed raid when no usable clip is available. Twitch embeds do not expose an exact playback-ended event, so completion uses the provider-reported duration plus a short grace period.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.raid-scout.runtime:** Confirms bounded discovery, filtering, non-repeating selection, and creator-confirmed Twitch raids.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`, `chat.send`, `overlay.publish`, `media.exclusive`, `schedule.bounded`.

Private storage: `data/addons/thsv.raid-scout/`, `data/addons/.state/thsv.raid-scout/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its bounded private suggestion and raid history remains preserved for a later reinstall.

If setup drifts, first back up Streamer.bot, then reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, and rerun the offline test. If a Streamer.bot beta rejects an in-place same-ID replacement as **Invalid Export**, remove only the old **THSV Addon - Raid Scout** group after making the backup, then import the matching package once as a clean replacement.
