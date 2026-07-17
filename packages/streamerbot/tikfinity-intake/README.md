# TikFinity Intake

This package installs the four action names used by the adopted TikFinity profile: `TikTok Chat Message`, `TikTok Follow`, `TikTok Gift`, and `THSV TikTok Like`.

Each action reads only documented TikFinity placeholders, emits one bounded `thsv.tikfinity` JSON broadcast on Streamer.bot's existing WebSocket, and performs no creator action, global write, process launch, platform output, or direct progression update. StreamBridge remains responsible for validation, normalization, deduplication, identity, logging, delivery, and overlay presentation.

TikFinity does not document a stable source-event ID or a reliable simulator marker. The relay therefore generates a per-delivery ID and defaults events to simulated unless an explicit marker is supplied. These limitations remain visible in normalized `metadata.unverifiedFields` and must be live-verified before production statistics or rewards are enabled.
