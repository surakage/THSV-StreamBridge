# THSV StreamBridge - Fan Crown

This companion package contains:

- `THSV Addon - Fan Crown - Controller`: leave triggerless and approve only for `thsv.fan-crown`.
- `THSV Addon - Fan Crown - Reset Crown`: optional creator-controlled maintenance action.
- `THSV Addon - Fan Crown - Reset Month`: optional destructive leaderboard reset action.

The Controller accepts only bounded operations carrying StreamBridge's one-use relay token. It updates the Streamer.bot-owned reward before fulfilling a redemption, requests rollback and refund when fulfillment fails, and returns a correlated result to the add-on.

The two reset actions only broadcast exact local control envelopes. They contain no reward ID, OAuth token, file path, or direct reward mutation.

Required C# references:

- `mscorlib.dll`
- `System.dll`
- `System.Core.dll`
- `netstandard.dll`
- `Newtonsoft.Json.dll`

Use a harmless Streamer.bot-owned reward for live acceptance testing before enabling Fan Crown for viewers.
