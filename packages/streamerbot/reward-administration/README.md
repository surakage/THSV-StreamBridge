# THSV StreamBridge Reward Administration

This triggerless action is the reviewed boundary for creator-approved Twitch reward changes.
It uses only documented Streamer.bot CPH methods: enable, disable, pause, unpause, fulfill, and
cancel. Every request requires explicit wizard approval and stable reward IDs.

Kick reward redemption intake is supported separately. Kick mutation controls are intentionally
absent because the official Streamer.bot Kick reward sub-action pages still say documentation is
missing. Do not add guessed Kick C# calls to this package.
