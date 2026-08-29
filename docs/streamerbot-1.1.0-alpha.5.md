# Streamer.bot 1.1.0 alpha.5 compatibility

Streamer.bot 1.1.0 alpha.5 is an exact-version compatibility target for the creator host, not the recommended general baseline. The upstream release line is early-access software and may contain bugs; StreamBridge continues to recommend 1.0.7 stable for routine installations.

The upstream release record is available from the [Streamer.bot v1.1.0 changelog](https://docs.streamer.bot/changelogs/v1.1.0).

## Recorded evidence

- The installed alpha.5 `actions.json` was inspected without modification after the v4.0.9 universal import.
- Its top-level keys and action-object keys matched the pre-import alpha.4 backup.
- The three managed intake action IDs and enabled states were unchanged.
- The pre-import backup contained the exact 29 Twitch, YouTube, and Kick trigger types in the embedded registry, with the expected trigger-record shape.
- Automated tests exercise exact alpha.5 registry selection, stripped-trigger restoration, action-body preservation, verified backup creation, idempotence, and rejection of alpha.6.

## Acceptance boundary

The compatibility entry permits rollback-protected trigger reconciliation only for exact alpha.5 databases whose managed action schema remains recognized. It does not claim that genuine Twitch, YouTube, or Kick events have been observed on alpha.5. Before calling the alpha host fully live-accepted, recompile every installed THSV C# action and confirm at least one genuine event from each enabled provider reaches StreamBridge with the expected Action History fields.

The compatibility feed maps alpha.5 to the already validated alpha.4 trigger schema so installed v4.0.9 clients can adopt the exact-version entry after verifying its GitHub Actions provenance. New source builds also embed alpha.5 directly; both paths use the same immutable contract data.
