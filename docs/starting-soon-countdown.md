# Starting Soon Countdown

Starting Soon Countdown is a separate optional add-on for a stream's Starting Soon scene. It counts down from any creator-selected duration up to 24 hours, then replaces the clock with a custom completion message and optionally plays one small locally generated tone.

## Install

1. Download the Starting Soon Countdown add-on ZIP from the matching GitHub release.
2. In the local wizard, open **Add-ons**, upload the `.thsv-addon`, review its permissions, then install and enable it.
3. Configure the normal duration, completion behavior, and appearance.
4. Import the bundled `THSV-StreamBridge-Starting-Soon-Countdown-2.4.1.sb` into Streamer.bot.
5. Add the copyable `http://127.0.0.1:8787/overlay/countdown` URL to OBS, Meld, or Streamlabs Desktop as a 1920x1080 browser source.

## Streamer.bot scene triggers

Attach **THSV Addon - Starting Soon Countdown - Start** to the scene-active trigger for your Starting Soon scene. Start always begins a fresh configured countdown.

When leaving that scene, attach **Stop** to pause and remove the overlay, or **Reset** to restore the configured time while leaving the timer visible and paused.

The imported package also provides Pause, Resume, Complete Now, and Set & Start. Set & Start exposes an editable `countdownSeconds` Set Argument from 1 through 86400 for a one-off duration. Complete Now safely previews the configured finish state and tone.

## Sound

Tone choices are None, Soft chime, Digital pop, and Celebration. The core-owned browser overlay synthesizes these tones locally; it loads no remote audio and stores no sound file. Enable browser-source audio output or monitoring in the streaming application if you want the tone included in the stream mix.

The completion sequence is persisted so reconnecting the browser source or restarting StreamBridge does not replay an old tone.

## Privacy and safety

The add-on stores only bounded countdown state: remaining and maximum seconds, running/visible/completed flags, timestamps, and a completion counter. It has no chat subscription, viewer tracking, platform-event bonuses, network access, filesystem access outside private add-on state, or capability to run arbitrary Streamer.bot actions.
