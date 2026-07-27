# Stream Launch Countdown

A creator-controlled launch countdown for a Starting Soon scene. Choose any duration up to 24 hours, show a custom message at zero, optionally play a small built-in tone, and optionally run one creator-approved Streamer.bot action.

## Setup

1. Install and enable this add-on in the StreamBridge wizard.
2. Configure the duration, completion message, optional tone, and overlay appearance.
3. Import `Streamer.bot/THSV-StreamBridge-Stream-Launch-Countdown-2.4.3.sb` from the packaged add-on.
4. Add the wizard's `/overlay/countdown` URL as a 1920x1080 browser source in OBS, Meld, or Streamlabs Desktop, then crop and position it as needed.
5. Attach **THSV Addon - Stream Launch Countdown - Start** to the scene-active trigger for your Starting Soon scene.
6. Attach **Stop** to the scene-inactive trigger for that scene, or use **Reset** if the paused clock should remain visible.
7. Optional: create a triggerless Streamer.bot action that switches to your next scene, approve exactly that action in the add-on's wizard card, then enable **Run an approved Streamer.bot action at zero**.

## Controls

- **Start** resets to the configured duration, shows the overlay, and starts counting.
- **Pause** freezes the current countdown.
- **Resume** continues a paused countdown.
- **Reset** restores the configured duration and leaves the timer paused and visible.
- **Stop** pauses and hides the overlay without playing the completion message or tone.
- **Complete Now** previews the completion message and tone.
- **Set & Start** uses the editable `countdownSeconds` argument for a one-off duration from 1 to 86400 seconds.

The tone is synthesized by the core-owned overlay; no sound file, remote URL, or external API is loaded. Browser sources may require audio monitoring/output to be enabled in the streaming application before the tone can be heard.

The optional completion action uses StreamBridge's existing approved-action broker and its single Streamer.bot connection. It is dispatched at most once, expires after five minutes, and **Complete Now never runs it**, so previewing the finish state cannot unexpectedly switch scenes.

The add-on stores only the remaining time, timestamps, visibility, and completion counter. It does not read chat, track viewers, or react to follows, gifts, subscriptions, donations, or rewards.
