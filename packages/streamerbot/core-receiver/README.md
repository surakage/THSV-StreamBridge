# THSV StreamBridge Core Receiver

This is the portable Streamer.bot package foundation for THSV StreamBridge. It contains one platform-neutral action named `THSV StreamBridge - Receive Event` in the `THSV StreamBridge` group.

The action validates the normalized event envelope supplied in `streamBridgeEvent`, rejects malformed or unsupported events without logging raw payloads, and exposes the stable `streamBridge*` argument contract documented in `manifest.json`. Later StreamBridge packages consume these arguments instead of depending on Twitch, YouTube, Kick, TikTok, or Facebook payload shapes.

## Install

1. Open Streamer.bot and select **Import**.
2. Drag `THSV-StreamBridge-Core-Receiver-1.0.0.sb` into the import field, or paste the file contents.
3. Confirm the package metadata and import the `THSV StreamBridge - Receive Event` action.
4. Keep the bridge configuration `streamerbot.actionAlias` set to that exact action name.
5. Enable the Streamer.bot WebSocket server, start the bridge, and run `npm run simulate`.

The `.sb` file is Streamer.bot's opaque UUEncoded import format. The readable C# source and manifest are committed beside it so package changes can be reviewed and reproduced.

## Boundaries

This foundation does not implement chat, commands, alerts, speech, timed actions, overlays, identity, progression, or games. Those remain later milestones.
