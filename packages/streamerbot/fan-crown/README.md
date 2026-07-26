# THSV StreamBridge - Fan Crown

This companion package contains:

- `THSV Addon - Fan Crown - Controller`: leave triggerless and approve only for `thsv.fan-crown`.
- `THSV Addon - Fan Crown - Reset Crown`: optional creator-controlled maintenance action.
- `THSV Addon - Fan Crown - Reset Month`: optional destructive leaderboard reset action.

After Twitch confirms either reset, Streamer.bot shows a Fan Crown success toast with the restored reward title and base cost.

The Controller accepts only bounded operations carrying StreamBridge's one-use relay token. It updates the Streamer.bot-owned reward, fulfills pending redemptions, recognizes rewards Twitch already fulfilled because they skip the redemption queue, and returns a correlated result to the add-on.

Keep **Redemption Skips Queue** disabled when you want Fan Crown to refund rejected claims. Twitch does not allow an already fulfilled redemption to be canceled and refunded.

The two reset actions only broadcast exact local control envelopes. They contain no reward ID, OAuth token, file path, or direct reward mutation.

Required C# references:

- `mscorlib.dll`
- `System.dll`
- `System.Core.dll`
- `netstandard.dll`
- `Newtonsoft.Json.dll`

Use a harmless Streamer.bot-owned reward for live acceptance testing before enabling Fan Crown for viewers.
