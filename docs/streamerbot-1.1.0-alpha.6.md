# Streamer.bot 1.1.0 alpha.6 compatibility

Streamer.bot 1.1.0 alpha.6 is an exact-version compatibility target for the creator host, not the recommended general baseline. The upstream release line is early-access software and may contain bugs; StreamBridge continues to recommend 1.0.7 stable for routine installations.

The upstream release record is available from the [Streamer.bot v1.1.0 changelog](https://docs.streamer.bot/changelogs/v1.1.0).

## Recorded evidence

- The installed executable reported product version `1.1.0-alpha.6` and file version `1.1.0 alpha.6`.
- Streamer.bot's automatic pre-upgrade alpha.5 and post-upgrade alpha.6 backup archives were inspected without modifying the running installation.
- Their `actions.json` top-level keys and combined action-object keys matched.
- The three managed intake action IDs and enabled states matched.
- Each managed action retained the same trigger-record keys and the exact 29 Twitch, YouTube, and Kick trigger types in the embedded registry.
- Automated tests exercise exact alpha.6 registry selection and keep alpha.7 inspection-only.

## Acceptance boundary

The compatibility entry permits rollback-protected trigger reconciliation only for exact alpha.6 databases whose managed action schema remains recognized. It does not claim that genuine Twitch, YouTube, or Kick events have been observed on alpha.6. Before calling the alpha host fully live-accepted, recompile every installed THSV C# action and confirm at least one genuine event from each enabled provider reaches StreamBridge with the expected Action History fields.

The compatibility feed maps alpha.6 to the validated alpha.5 trigger schema so installed clients can adopt the exact-version entry after verifying its GitHub Actions provenance. New source builds also embed alpha.6 directly; both paths use the same immutable contract data.
