# Future add-ons

Stage 2 removes Viewer Progression, Bloom Companion, and Speaker.bot Orchestration from THSV StreamBridge core. Their implementations are preserved under `archive/future-add-ons/` as historical candidates, not installed modules.

Core never imports, discovers, or executes files from the archive. It does not expose progression or companion HTTP controls, does not serve `/overlay/companion`, does not emit `viewer.progression` or `companion.action`, and does not publish viewer identity through the Streamer.bot receiver contract.

Existing `data/state/viewer-progression.json` and `data/state/companion.json` files remain creator data. Upgrade, backup, and default uninstall flows preserve the complete `data` directory. Nothing deletes excluded state unless the creator explicitly chooses full user-data removal.

An archived implementation may return only after it has a valid v2 module manifest, uses public contracts exclusively, owns isolated storage, supports explicit installation/removal and migrations, reports independent health, and passes failure-isolation tests. Archived `.sb` files are retained for historical recovery only and must not be imported into the Stage 2 core action chain.

## Donation providers

Direct donations are intentionally absent from the setup wizard until provider-specific integrations exist. A future Streamlabs provider and Ko-fi provider must authenticate independently, preserve each provider's stable event ID, keep monetary values as decimal strings, verify webhook signatures or trusted Streamer.bot trigger provenance, and never infer a donation from a platform-native event. Streamlabs will default to its teal presentation and Ko-fi to its blue presentation while still supporting the same creator color overrides as native platforms.

Adding either provider also requires its own event matrix, normalized-variable mapping, deduplication fixtures, replay tests, and live acceptance evidence. YouTube Super Chats, Twitch Bits, Kick KICKs, and TikTok gifts remain distinct native platform events; they are not relabeled as donations.
