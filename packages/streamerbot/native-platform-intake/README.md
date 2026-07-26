# Native Platform Intake

This package installs one intake action for each native Streamer.bot platform connection:

- `THSV Twitch - Intake` in `THSV StreamBridge - Twitch`
- `THSV YouTube - Intake` in `THSV StreamBridge - YouTube`
- `THSV Kick - Intake` in `THSV StreamBridge - Kick`
- `THSV Streamlabs - Intake` in `THSV StreamBridge - Streamlabs`
- `THSV Kofi - Intake` in `THSV StreamBridge - Kofi`
- Supports `StreamlabsDonation`, `StreamlabsCharityDonation`, and `StreamlabsMerchandise` in the Streamlabs action.
- Supports `KofiDonation`, `KofiCommission`, `KofiResubscription`, `KofiSubscription`, and `KofiShopOrder`

Each action reads an allowlisted subset of Streamer.bot trigger arguments and broadcasts one bounded `thsv.platform` event over the existing loopback WebSocket. StreamBridge remains responsible for schema validation, normalization, deduplication, viewer identity, structured logging, delivery, and overlays.

Streamer.bot `1.0.5-beta.1` adds Custom Power-Ups and YouTube Jewels. This package reads the observed dotted Jewels fields (`gift.jewelsAmount`, `gift.name`, and related presentation metadata), Power-Up counters, Hype Train state, Ko-fi item lists, and integration timestamps. Provider event IDs are used when Streamer.bot exposes them; events without one remain marked as an unverified transport instead of being presented as replay-safe.

Streamlabs and Ko-fi must first be connected in Streamer.bot and then enabled as separate input platforms in the StreamBridge wizard. Their intake actions do not create another WebSocket connection.

The supported trigger types are declared in `manifest.json`. A platform action must only be assigned triggers from its own platform. Test-trigger runs retain Streamer.bot's `isTest` marker and do not count toward production progression unless the creator explicitly enables simulated progression.
