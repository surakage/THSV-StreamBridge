# TikFinity Intake

This package installs five consistently named actions in the `THSV StreamBridge - TikTok` group: `THSV TikTok - Chat`, `THSV TikTok - Follow`, `THSV TikTok - Gift`, `THSV TikTok - Like`, and `THSV TikTok - Subscription`.

Each action reads only documented TikFinity placeholders, emits one bounded `thsv.tikfinity` JSON broadcast on Streamer.bot's existing WebSocket, and performs no creator action, global write, process launch, platform output, or direct progression update. StreamBridge remains responsible for validation, normalization, deduplication, identity, logging, delivery, and overlay presentation.

TikFinity does not document a stable source-event ID or a reliable simulator marker. The relay therefore generates a per-delivery ID and treats an event as live unless TikFinity supplies an explicit simulation/test marker. These limitations remain visible in normalized `metadata.unverifiedFields`; use TikFinity's test controls only when they supply one of the supported markers.
