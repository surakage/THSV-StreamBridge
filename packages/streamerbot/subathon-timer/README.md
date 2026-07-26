# THSV StreamBridge - Subathon Timer

Import the `.sb` file once. It creates five optional actions in `THSV StreamBridge - Add-ons`:

- Start
- Pause
- Resume
- Reset
- Add Time

The Add Time action includes an editable `subathonSeconds` Set Argument value (default `300`). Attach any of the actions to a Streamer.bot hotkey, deck button, or scene trigger. No triggers are attached automatically.

These controls only send a bounded local event to the installed Subathon Timer add-on. They do not send chat messages, call external services, or run arbitrary actions.
