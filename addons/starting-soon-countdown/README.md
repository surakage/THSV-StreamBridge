# Stream Launch Countdown

Stream Launch Countdown shows a countdown timer on your Starting Soon scene. When you switch to that scene, the full timer appears; it starts counting once one of your platforms goes live. At zero it shows your own message, can play a short tone, and can run one Streamer.bot action (for example, switch to your main scene). Viewers see the timer and the final message.

## What you need
- A browser source for the timer. Copy the URL from the wizard (it uses the short `/overlay/countdown` address). Use a 1920x1080 source, then crop and position it.
- Scene changes from OBS, Meld or Streamlabs reaching StreamBridge (the normal Scene Changed relay).
- Optional: the Stream Launch Countdown Streamer.bot import, for manual controls. It contains **THSV Addon - Stream Launch Countdown - Start**, **Pause**, **Resume**, **Reset**, **Stop**, **Complete Now** and **Set & Start**. Do not attach scene triggers to them; use them only on hotkeys or deck buttons.
- Optional: one triggerless Streamer.bot action of your own to run at zero, approved for this add-on.

## Set it up
1. Open Setup Wizard > Extensions > Broadcast Director > Stream Launch Countdown.
2. Set the duration (default 10 minutes, up to 24 hours).
3. Check the scene list. The default `role:starting` uses the Starting scene you chose under Extensions > Scene roles. You can also type an exact scene name, including any emoji or folder symbol.
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
