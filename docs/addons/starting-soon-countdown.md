# Stream Launch Countdown

**Module:** `thsv.starting-soon-countdown` · **Version:** `4.0.47` · **Built in (extension)**

Runs one exact-scene-aware Starting Soon countdown with a custom message, local tone, and optional approved completion action.

Stream Launch Countdown shows a countdown timer on your Starting Soon scene. When you switch to that scene, the full timer appears; it starts counting once one of your platforms goes live. At zero it shows your own message, can play a short tone, and can run one Streamer.bot action (for example, switch to your main scene). Viewers see the timer and the final message.

## What you need
- A browser source for the timer. Copy the URL from the wizard (it uses the short `/overlay/countdown` address). Use a 1920x1080 source, then crop and position it.
- Scene changes from OBS, Meld or Streamlabs reaching StreamBridge (the normal Scene Changed relay).
- Optional: the Stream Launch Countdown Streamer.bot import, for manual controls. It contains **THSV Addon - Stream Launch Countdown - Start**, **Pause**, **Resume**, **Reset**, **Stop**, **Complete Now** and **Set & Start**. Do not attach scene triggers to them; use them only on hotkeys or deck buttons.
- Optional: one triggerless Streamer.bot action of your own to run at zero, approved for this add-on.

## Set it up
1. Open Setup Wizard > Extensions > Broadcast Director > Stream Launch Countdown.
2. Set the duration (default 10 minutes, up to 24 hours).
3. Check the scene list. The default `role:starting` uses the Starting scene you chose under Add-ons > Scene roles. You can also type an exact scene name, including any emoji or folder symbol.
4. Write the completion message, pick a tone (none, soft chime, digital pop or celebration) and its volume.
5. Style the overlay: label, font, background, colors, progress bar, and the warning (2 minutes) and critical (30 seconds) thresholds.
6. Add the countdown URL as a browser source on your Starting Soon scene.
7. Optional scene switch: create one triggerless Streamer.bot action that changes scene, approve exactly that action in this add-on's card, then turn on **Run an approved Streamer.bot action at zero**.
8. Optional: import the Streamer.bot package for manual controls.
9. Save and restart StreamBridge if asked. To test offline, use the manual **Start** control (the automatic start waits for a real go-live), and **Complete Now** to preview the ending message and tone.

## Good to know
- On the scene, the timer shows "WAITING FOR LIVE" until a platform goes live, then starts after a 2-second delay.
- Leaving the scene pauses and hides the timer. Coming back within a minute (or toggling OBS Studio Mode) keeps the time running.
- **Start** resumes a paused timer instead of restarting it. Use **Reset** then **Start** for a fresh run. **Set & Start** uses its `countdownSeconds` argument (1 to 86400) for a one-off time.
- **Complete Now** never runs your scene-switch action, so previews cannot switch scenes by surprise. The real action runs at most once.
- The tone is made by the overlay itself. Turn on audio monitoring or output for the browser source if you want it in your stream.
- The completion message shows for 10 seconds by default. Set 0 to keep it until Stop or Reset.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Broadcast Director** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Stream Launch Countdown`

- `THSV Addon - Stream Launch Countdown - Start` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Pause` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Resume` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Reset` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Stop` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Complete Now` in `THSV Addon - Stream Launch Countdown`
- `THSV Addon - Stream Launch Countdown - Set & Start` in `THSV Addon - Stream Launch Countdown`

These actions publish only bounded local countdown-control envelopes. They do not send chat, call external APIs, or run other actions.

Creator-selected triggers:

- No OBS, Meld, or Streamlabs scene triggers are required on these manual actions. StreamBridge follows normalized program-scene changes directly; use these actions only as optional hotkeys or Stream Deck controls for manual overrides.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.starting-soon-countdown` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Stream Launch Countdown |  | On |
| Hours |  | 0 |
| Minutes |  | 10 |
| Seconds |  | 0 |
| Exact program-scene names that run the countdown | Enter one exact OBS, Streamlabs, or Meld program-scene name per line, including any emoji or folder icon. Matching ignores capitalization only. role:starting uses the scene you chose as your Starting scene under Add-ons > Scene roles. | `role:starting` |
| Hide and pause after leaving those scenes |  | On |
| Message shown when the countdown ends |  | `The stream is starting now!` |
| Optional completion tone |  | `soft-chime` |
| Tone volume |  | 0.6 |
| Seconds to show the completion message | Use 0 to leave the message visible until Stop or Reset is run. | 10 |
| Run an approved Streamer.bot action at zero |  | Off |
| Wait before running the action (seconds) |  | 0 |
| Publish the countdown to its browser overlay |  | On |
| Overlay label |  | `STARTING SOON` |
| Font style |  | `display` |
| Background style |  | `glass` |
| Background color |  | `#0b1017` |
| Background opacity |  | 0.88 |
| Accent color |  | `#7ee0ff` |
| Primary text color |  | `#eff7ff` |
| Secondary text color |  | `#dfefff` |
| Warning color |  | `#f0c15a` |
| Critical color |  | `#ff6b7d` |
| Running badge color |  | `#61f2a4` |
| Border color |  | `#85cbff` |
| Show progress bar |  | On |
| Warning threshold in minutes |  | 2 |
| Critical threshold in seconds |  | 30 |
| Delay after a platform goes live (seconds) | The full countdown appears on scene entry and waits for a real live signal from any connected platform. | 2 |

## Health checks

- **thsv.starting-soon-countdown.runtime:** Confirms bounded countdown controls, persistence, and overlay publishing.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `schedule.bounded`, `state.private`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.starting-soon-countdown/`, `data/addons/.state/thsv.starting-soon-countdown/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its small timer state remains available unless add-on data is explicitly deleted.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
