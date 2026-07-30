# Voice Relay

Voice Relay is the safe Speaker.bot orchestration rebuild. When enabled, every normalized alert type is selected for a creator-written thank-you by default; viewer chat and viewer-written donation, cheer, gift, subscription, raid, or Super Chat messages remain separate opt-ins. It is disabled by default, strips links and controls, applies thresholds and blocked terms, aggregates rapid bits/gifts, bounds and serializes requests, and stores no spoken text history. Creator Pause/Resume/Stop actions control future StreamBridge requests; Speaker.bot's native Clear Pending/Stop Speaking controls remain the authority for audio already queued there.

Before enabling it, create a Voice Alias in Speaker.bot and enter that exact, case-sensitive alias in the wizard. Streamer.bot's `TtsSpeak` method requires an existing alias; Voice Relay now rejects enabled settings without one and skips incomplete requests.
