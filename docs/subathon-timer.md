# Subathon Timer add-on

Subathon Timer `1.1.0` is an optional THSV StreamBridge add-on that maintains a stream-relative countdown and publishes it through the core-owned hosted overlay. It can add or subtract time from validated Twitch, YouTube, Kick, TikTok, Ko-fi, and Streamlabs event categories without creating another WebSocket connection.

## Install

1. Install and configure THSV StreamBridge `2.2.0` or later.
2. Download the separate Subathon Timer add-on ZIP from the same GitHub Release.
3. In the wizard, open **Add-ons**, review and install the included `.thsv-addon`, then restart the bridge.
4. Import the matching `THSV-StreamBridge-Subathon-Timer-1.1.0.sb` package into Streamer.bot.
5. Copy the hosted overlay URL shown on the add-on page into a browser source.

The Streamer.bot import creates Start, Pause, Resume, Reset, and Add Time actions. To change the manual addition, edit the visible `subathonSeconds` Set Argument above the Add Time C# action; no code edit is required.

## Configuration

The wizard separates setup into guided sections for timer behavior, platform rules, event values, manual controls, overlay appearance, and final review. You can customize the starting and maximum duration, overtime behavior, displayed title, font, background, opacity, colors, and progress bar.

Every event rule is platform-specific. A YouTube subscription can therefore differ from a paid membership, while Twitch subscriptions, Bits, raids, TikTok likes, gifts, Ko-fi support, and future supported Streamlabs events remain independently configurable. Unknown or unstable high-impact events fail closed.

## Safety and privacy

- Timer state is stored in the add-on's private local state and survives bridge restarts.
- Simulated events never change the live timer unless the creator explicitly enables simulation handling.
- Streamer.bot controls use an exact allowlist of action/event pairs and bounded numeric inputs.
- The package supplies no browser JavaScript. Rendering is performed by StreamBridge's core-owned bounded overlay host.
- No account token, payment detail, supporter message, or chat text is stored by the timer.

## Testing

Use the wizard preview for appearance, then trigger the imported Add Time action with a small value. Confirm Start, Pause, Resume, Reset, and one provider event before using the timer during a live stream.
