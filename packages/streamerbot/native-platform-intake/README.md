# Native Platform Intake

This package installs one intake action for each native Streamer.bot platform connection:

- `THSV Twitch - Intake` in `THSV StreamBridge - Twitch`
- `THSV YouTube - Intake` in `THSV StreamBridge - YouTube`
- `THSV Kick - Intake` in `THSV StreamBridge - Kick`

Each action reads an allowlisted subset of Streamer.bot trigger arguments and broadcasts one bounded `thsv.platform` event over the existing loopback WebSocket. StreamBridge remains responsible for schema validation, normalization, deduplication, viewer identity, structured logging, delivery, and overlays.

The supported trigger types are declared in `manifest.json`. A platform action must only be assigned triggers from its own platform. Test-trigger runs retain Streamer.bot's `isTest` marker and do not count toward production progression unless the creator explicitly enables simulated progression.
