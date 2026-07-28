# Viewer Spotlight

Viewer Spotlight displays a temporary, self-requested viewer card using bounded projections from Viewer Foundation and Community Analytics.

- Starts disabled and requires explicit public-display disclosure approval.
- `!card` is self-only; arguments are rejected so one viewer cannot request another viewer's card.
- Display names and validated HTTPS avatars are held only in the bounded in-memory queue and are never persisted.
- Private state contains only Viewer Foundation IDs, cooldown timestamps, and the current session count.
- A Viewer Foundation privacy deletion immediately removes the viewer from the queue and cooldown cache and hides their active card. No bridge restart is required.
- Provider projections are read again immediately before display. A deleted or unobserved analytics identity is therefore removed from a queued request.
- Points, level, and the latest derived achievement are the progression fields enabled by default. Observed sessions/messages/commands are separately labeled and disabled by default.
- Simulated command events never render production viewer data. Use the wizard's hosted-overlay preview for layout testing.
- The authenticated wizard preview uses the saved card colors, typography, duration, and enabled field switches with clearly fake values. It never reads or displays a real viewer projection.
- The authenticated Manual viewer card section accepts a stable platform account ID and creator-supplied display name/avatar. It resolves that account through Viewer Foundation, requires an existing Community Analytics observation, and reuses the normal ignore, cooldown, queue, expiry, deletion, and session limits. Presentation identity remains memory-only.
- After a restart, presentation identity and queued cards are gone; only bounded pseudonymous cooldown/session counters are restored, so an old card is never replayed.
- Optional engagement score and monthly rank fields come only from Community Analytics. Rank disappears when the minimum cohort is not met, and both fields are disabled on public cards by default.
- Single-card, fade-carousel, and upward credits-scroll presentation modes share the same bounded queue and crop-safe card layout.
- The creator-only **Show current Stream Score** control publishes only aggregate observed-viewer and interaction totals. It contains no viewer identity.

Optional Twitch Channel Points requests require an exact creator-owned reward ID and the bundled triggerless settlement controller. Accepted requests are fulfilled only after overlay publication; rejected, expired, offline, or failed-display requests are refunded when that safety option is enabled. Optional Discord channel/forum snapshots use a separate triggerless action whose webhook remains a private Streamer.bot argument. Provider acceptance for both actions is still required before public use.
