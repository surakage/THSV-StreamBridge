# Village Hydration Station

Module: `thsv.village-hydration-station`
Version: `3.5.0`
Streamer.bot: `1.0.7` or newer

Village Hydration Station is a live-only water reminder and personal ounce tracker. It combines creator-controlled logging, viewer reminder requests with shared cooldowns, optional Speaker.bot output, and a persistent animated fill overlay. Viewer activity can remind the creator, but can never add ounces.

## Install

1. Install and enable the add-on in the local wizard.
2. Import `THSV-StreamBridge-Village-Hydration-Station-3.5.0.sb`.
3. Add `/overlay/addons/thsv.village-hydration-station` as a compact `520 x 620` browser source, or position it within a `1920 x 1080` source. Use **Send preview** to display the exact saved template while sizing it.
4. Attach **Log Water** to a creator Stream Deck button or hotkey. A blank amount uses the saved default serving.
5. Choose how you will log water: use the broadcaster-only `!water` command, or attach **Log Water** to a Stream Deck button or creator hotkey.
6. To let Twitch or Kick viewers remind you, create a native Hydrate reward and paste its stable reward ID into the add-on settings. YouTube and TikTok use the automatically routed `!hydrate` command.

The creator can also use `!water 8`, `!water log 8`, `!water undo`, `!water snooze`, `!water reset`, or `!water status`. This command is broadcaster-only and is omitted from the public command directory.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

The import creates six triggerless actions in `THSV Addon - Village Hydration Station`. Attach only the creator controls you want to Stream Deck or hotkeys. Keep **Speak** triggerless because StreamBridge invokes it through the capability broker. No Voice Control action is included or required.

## Offline test

1. Keep StreamBridge and Streamer.bot running and save the add-on settings.
2. Add the browser source and use **Send preview**. Confirm the exact chosen bottle, glass, or water-tower template appears at half full.
3. Run **Preview Reminder** manually and confirm no ounces are added.
4. Run **Log Water** with a bounded test amount, verify the container fills, then use **Undo** to restore the total.
5. Confirm automatic and viewer reminders remain silent until a verified platform live signal arrives.

## Reminder safety

- Automatic reminders begin only after a verified `stream.online` event and stop when every platform is offline.
- Startup, stream lifecycle signals, scheduled reminders, and creator water-log/control actions never reveal the hydration overlay. It appears temporarily only for an accepted Twitch/Kick hydration redemption or the equivalent YouTube/TikTok `!hydrate` request, then hides when that notice expires. The explicit preview remains available for sizing.
- A verified new stream can reset the total when reset mode is **Per stream**. Daily and manual modes are also available.
- Viewer reminders are accepted only on the viewer's currently live platform.
- One global cooldown and one per-viewer cooldown prevent reminder spam across platforms.
- Simulated reward and viewer events do not create a live reminder.

## Optional speech

Enable Speaker.bot announcements only after approving the dedicated hydration **Speak** action. If Village Voice is installed, the wizard reuses its saved voice alias when Hydration Station does not yet have one. The two add-ons retain separate action grants so neither can exercise the other's permission. If speech is unavailable, the overlay and timer continue normally.

The hydration goal is a personal display target, not medical advice.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `state.private`, `chat.send`, `streamerbot.run-approved-action`, and `schedule.bounded`.

Private storage is bounded to `data/addons/thsv.village-hydration-station/` and `data/addons/.state/thsv.village-hydration-station/`. Recent entries and cooldowns are retained only for the add-on's recovery and spam controls. No hydration data is sent to an outside service.
