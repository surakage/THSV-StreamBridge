# Stream Launch Countdown

A creator-controlled launch countdown for a Starting Soon scene. Choose any duration up to 24 hours, show a custom message at zero, optionally play a small built-in tone, and optionally run one creator-approved Streamer.bot action.

## Setup

1. Install and enable this add-on in the StreamBridge wizard.
2. Configure the duration, completion message, optional tone, and overlay appearance.
3. Enter the exact program-scene name that should run the timer, including any emoji or folder icon.
4. Import `Streamer.bot/THSV-StreamBridge-Stream-Launch-Countdown-3.6.0.sb` only when you want manual controls or an approved completion action.
5. Add the wizard's `/overlay/countdown` URL as a 1920x1080 browser source in OBS, Meld, or Streamlabs Desktop, then crop and position it as needed.
6. Optional: create a triggerless Streamer.bot action that switches to your next scene, approve exactly that action in the add-on's wizard card, then enable **Run an approved Streamer.bot action at zero**.

StreamBridge consumes the normalized program-scene event directly. Entering a configured scene starts or resumes the countdown; leaving it pauses and hides the overlay. OBS Studio Mode preview changes therefore do not reset the running program timer. The imported Start and Stop actions are manual fallbacks and need no OBS triggers.

## Controls

- **Start** begins a fresh configured countdown only when no countdown is in progress. Duplicate scene-active events are ignored, and a Stop/Pause followed by Start resumes the saved remaining time. Use Reset then Start for a deliberate restart.
- **Pause** freezes the current countdown.
- **Resume** continues a paused countdown.
- **Reset** restores the configured duration and leaves the timer paused and visible.
- **Stop** pauses and hides the overlay without playing the completion message or tone.
- **Complete Now** previews the completion message and tone.
- **Set & Start** uses the editable `countdownSeconds` argument for a one-off duration from 1 to 86400 seconds.

The tone is synthesized by the core-owned overlay; no sound file, remote URL, or external API is loaded. Browser sources may require audio monitoring/output to be enabled in the streaming application before the tone can be heard.

The optional completion action uses StreamBridge's existing approved-action broker and its single Streamer.bot connection. It is dispatched at most once, expires after five minutes, and **Complete Now never runs it**, so previewing the finish state cannot unexpectedly switch scenes.

The add-on stores only the remaining time, timestamps, visibility, and completion counter. It does not read chat, track viewers, or react to follows, gifts, subscriptions, donations, or rewards.
