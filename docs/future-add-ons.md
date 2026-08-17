# Archived future add-on source

This page documents only the inert historical source preserved by the Stage 2 extraction. The authoritative status, consolidation decisions, detailed future specifications, and dependency-ordered execution plan live in the [Future projects and add-on roadmap](future-projects-and-addons.md).

Stage 2 removes Viewer Progression, Bloom Companion, and Speaker.bot Orchestration from THSV StreamBridge core. Their implementations are preserved under `archive/future-add-ons/` as historical candidates, not installed modules.

Core never imports, discovers, or executes files from the archive. It does not expose progression or companion HTTP controls, does not serve `/overlay/companion`, does not emit `viewer.progression` or `companion.action`, and does not publish viewer identity through the Streamer.bot receiver contract.

Existing `data/state/viewer-progression.json` and `data/state/companion.json` files remain creator data. Upgrade, backup, and default uninstall flows preserve the complete `data` directory. Nothing deletes excluded state unless the creator explicitly chooses full user-data removal.

An archived implementation may return only after it has a valid v2 module manifest, uses public contracts exclusively, owns isolated storage, supports explicit installation/removal and migrations, reports independent health, and passes failure-isolation tests. Archived `.sb` files are retained for historical recovery only and must not be imported into the Stage 2 core action chain. Viewer Progression has returned through the consolidated built-in Viewer Foundation integration; that does not reactivate the archived implementation.

## Donation providers

Direct donations use provider-specific intake rather than being inferred from platform-native events. Ko-fi uses the built-in, disabled-by-default donation integration plus its selected universal-import action. Streamlabs reuses Streamer.bot's existing authenticated `Streamlabs.Donation` WebSocket event, so StreamBridge stores no provider credentials and opens no second connection. Both providers require stable event IDs, keep monetary values as decimal strings, and retain separate presentation colors and creator overrides.

Adding either provider also requires its own event matrix, normalized-variable mapping, deduplication fixtures, replay tests, and live acceptance evidence. YouTube Super Chats, Twitch Bits, Kick KICKs, and TikTok gifts remain distinct native platform events; they are not relabeled as donations.
