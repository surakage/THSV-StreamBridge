# Stream Launch Countdown

Stream Launch Countdown is a separate optional add-on for a stream's Starting Soon scene. It counts down from any creator-selected duration up to 24 hours, then replaces the clock with a custom completion message, optionally plays one small locally generated tone, and can run one creator-approved Streamer.bot action.

## Install

1. Download the Stream Launch Countdown add-on ZIP from the matching GitHub release.
2. In the local wizard, open **Add-ons**, upload the `.thsv-addon`, review its permissions, then install and enable it.
3. Configure the normal duration, the exact program-scene name (including any emoji or folder symbol), completion behavior, and appearance.
4. Import the bundled `THSV-StreamBridge-Stream-Launch-Countdown-4.0.3.sb` into Streamer.bot.
5. Add the copyable `http://127.0.0.1:8787/overlay/countdown` URL to OBS, Meld, or Streamlabs Desktop as a 1920x1080 browser source.

## Automatic scene behavior

Do not add OBS scene triggers to the imported Start or Stop actions. StreamBridge listens to its normalized program-scene updates and starts the countdown when the active program scene exactly matches a configured name. Leaving that scene stops and hides the countdown when **Stop outside automatic scenes** is enabled.

Matching is case-insensitive but otherwise exact, so `📁 Starting Soon` and `Starting Soon` are different names. Preview-only changes in OBS Studio Mode do not restart the program countdown, and duplicate scene events preserve the remaining time.

The imported Streamer.bot package provides optional manual controls: Start, Stop, Pause, Resume, Reset, Complete Now, and Set & Start. Set & Start exposes an editable `countdownSeconds` Set Argument from 1 through 86400 for a one-off duration. Complete Now safely previews the configured finish state and tone.

## Optional scene switch at zero

Create one triggerless Streamer.bot action that changes to the desired OBS Studio, Streamlabs Desktop, or Meld scene. In the add-on's wizard card, add exactly that action under **Approved Streamer.bot actions**, enable **Run an approved Streamer.bot action at zero**, and optionally set a short delay.

StreamBridge dispatches the action through its existing authenticated Streamer.bot connection. It is recorded before dispatch for at-most-once behavior and expires after five minutes, preventing a later reconnect from switching scenes unexpectedly. **Complete Now is preview-only and never dispatches the scene action.**

## Sound

Tone choices are None, Soft chime, Digital pop, and Celebration. The core-owned browser overlay synthesizes these tones locally; it loads no remote audio and stores no sound file. Enable browser-source audio output or monitoring in the streaming application if you want the tone included in the stream mix.

The completion sequence is persisted so reconnecting the browser source or restarting StreamBridge does not replay an old tone.

## Privacy and safety

The add-on stores only bounded countdown state: remaining and maximum seconds, running/visible/completed flags, timestamps, and a completion counter. It has no chat subscription, viewer tracking, platform-event bonuses, network access, filesystem access outside private add-on state, or capability to run arbitrary Streamer.bot actions.
