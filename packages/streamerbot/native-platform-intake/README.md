# Native Platform Intake

This package installs one intake action for each native Streamer.bot platform connection:

- `THSV Twitch - Intake` in `THSV StreamBridge - Twitch`
- `THSV YouTube - Intake` in `THSV StreamBridge - YouTube`
- `THSV Kick - Intake` in `THSV StreamBridge - Kick`

Each action reads an allowlisted subset of Streamer.bot trigger arguments and broadcasts one bounded `thsv.platform` event over the existing loopback WebSocket. StreamBridge remains responsible for schema validation, normalization, deduplication, viewer identity, structured logging, delivery, and overlays.

The supported trigger types are declared in `manifest.json`. A platform action must only be assigned triggers from its own platform. Test-trigger runs retain Streamer.bot's `isTest` marker and do not count toward production progression unless the creator explicitly enables simulated progression.

Reward redemption intake is supported for Twitch and Kick. Add Twitch's `TwitchRewardRedemption` trigger only to `THSV Twitch - Intake`, and Kick's `KickRewardRedemption` trigger only to `THSV Kick - Intake`. Reward identifiers, redemption identifiers, title, cost, required-input status, and optional user input are relayed through the same bounded envelope. Twitch exposes documented fulfillment and cancellation operations; Kick is intake-only until Streamer.bot publishes a supported reward-mutation contract.
