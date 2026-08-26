# Village Hydration Station setup

**Module:** `thsv.village-hydration-station`
**Version:** `4.0.1`
**Publisher:** THSV StreamBridge

Provides live-only hydration reminders, creator-authorized ounce tracking, viewer reminder cooldowns, optional Speaker.bot confirmations, and an animated fill overlay.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Village-Hydration-Station-4.0.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Village-Hydration-Station-4.0.8.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Village-Hydration-Station-4.0.8.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install Village Hydration Station and choose a personal stream goal and reminder interval.
2. Import its Streamer.bot package. Approve only Speak when Speaker.bot announcements are enabled.
3. Attach Log Water to Stream Deck, a creator hotkey, or another creator-only Streamer.bot trigger. The broadcaster-only !water command provides the same controls from chat.
4. Create Twitch and Kick Hydrate rewards and paste their stable IDs. YouTube and TikTok use the automatically registered !hydrate command.
5. Add /overlay/addons/thsv.village-hydration-station as a compact 520 x 620 or full-canvas 1920 x 1080 browser source, then send the exact template preview from the wizard.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Village Hydration Station`

- `THSV Addon - Village Hydration Station - Log Water` in `THSV Addon - Village Hydration Station`
- `THSV Addon - Village Hydration Station - Undo` in `THSV Addon - Village Hydration Station`
- `THSV Addon - Village Hydration Station - Snooze` in `THSV Addon - Village Hydration Station`
- `THSV Addon - Village Hydration Station - Reset` in `THSV Addon - Village Hydration Station`
- `THSV Addon - Village Hydration Station - Preview Reminder` in `THSV Addon - Village Hydration Station`
- `THSV Addon - Village Hydration Station - Speak` in `THSV Addon - Village Hydration Station`

All controls are creator-owned local relays. Speak is triggerless and requires a one-use broker token. Viewer rewards and commands stay on the main THSV intakes.

Creator-selected triggers:

- **logWater:** Attach to a creator-controlled Stream Deck button or hotkey. Blank hydrationAmount uses the wizard's default serving; set a whole number for a dedicated amount.
- **undoSnoozeReset:** Attach only to creator-controlled hotkeys or Stream Deck buttons.
- **previewReminder:** Keep triggerless and run manually while offline to test reminder presentation without speech or state changes to ounces.
- **speak:** Keep triggerless. Approve it in the wizard only when Speaker.bot announcements are enabled.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.village-hydration-station` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.village-hydration-station.runtime:** Confirms live-only scheduling, command or Stream Deck ounce logging, viewer cooldowns, optional Speaker.bot output, and fill-overlay projection.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `state.private`, `chat.send`, `streamerbot.run-approved-action`, `schedule.bounded`.

Private storage: `data/addons/thsv.village-hydration-station/`, `data/addons/.state/thsv.village-hydration-station/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves bounded hydration totals and recent entries for recovery.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
