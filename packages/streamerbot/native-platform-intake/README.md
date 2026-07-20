# Native Platform Intake

This package installs one intake action for each native Streamer.bot platform connection:

- `THSV Twitch - Intake` in `THSV StreamBridge - Twitch`
- `THSV YouTube - Intake` in `THSV StreamBridge - YouTube`
- `THSV Kick - Intake` in `THSV StreamBridge - Kick`

Each action reads an allowlisted subset of Streamer.bot trigger arguments and broadcasts one bounded `thsv.platform` event over the existing loopback WebSocket. StreamBridge remains responsible for schema validation, normalization, deduplication, viewer identity, structured logging, delivery, and overlays.

Version 1.1.0 also relays provider-supported chat identity presentation. Twitch supplies badge images and uses a cached Streamer.bot user lookup for profile photos. YouTube supplies its documented profile URL and normalized role badges. Kick supplies badge images but does not currently expose a chat-user profile photo, so the overlay renders a platform-colored initial. TikTok identity remains supplied by the separate TikFinity intake.

The supported trigger types and creator-facing picker paths are declared in `manifest.json`. A platform action must only be assigned triggers from its own platform. Twitch and Kick Stream Online/Offline plus YouTube Broadcast Started/Ended are included so stream-relative timed sessions have real lifecycle input. Test-trigger runs retain Streamer.bot's `isTest` marker and do not count toward production progression unless the creator explicitly enables simulated progression.

Do not attach triggers to Core Receiver, Multi-Chat, Multi-Commands, Multi-Alerts, Multi-Timed Actions, Timed Message Output, or administration actions. Those actions run only through the validated internal chain.

Reward redemption intake is supported for Twitch and Kick. Add Twitch's `TwitchRewardRedemption` trigger only to `THSV Twitch - Intake`, and Kick's `KickRewardRedemption` trigger only to `THSV Kick - Intake`. Reward identifiers, redemption identifiers, title, cost, required-input status, and optional user input are relayed through the same bounded envelope. Twitch exposes documented fulfillment and cancellation operations; Kick is intake-only until Streamer.bot publishes a supported reward-mutation contract.
