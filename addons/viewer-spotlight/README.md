# Viewer Spotlight

Viewer Spotlight displays a temporary, self-requested viewer card using bounded projections from Viewer Foundation and Community Analytics.

- Starts disabled and requires explicit public-display disclosure approval.
- `!card` is self-only; arguments are rejected so one viewer cannot request another viewer's card.
- Display names and validated HTTPS avatars are held only in the bounded in-memory queue and are never persisted.
- Private state contains only Viewer Foundation IDs, cooldown timestamps, and the current session count.
- A Viewer Foundation privacy deletion immediately removes the viewer from the queue and cooldown cache and hides their active card. No bridge restart is required.
- Provider projections are read again immediately before display. A deleted or unobserved analytics identity is therefore removed from a queued request.
- Points and level are the only progression fields enabled by default. Observed sessions/messages/commands are separately labeled and disabled by default.
- Simulated command events never render production viewer data. Use the wizard's hosted-overlay preview for layout testing.
- The authenticated wizard preview uses the saved card colors, typography, duration, and enabled field switches with clearly fake values. It never reads or displays a real viewer projection.
- The authenticated Manual viewer card section accepts a stable platform account ID and creator-supplied display name/avatar. It resolves that account through Viewer Foundation, requires an existing Community Analytics observation, and reuses the normal ignore, cooldown, queue, expiry, deletion, and session limits. Presentation identity remains memory-only.
- After a restart, presentation identity and queued cards are gone; only bounded pseudonymous cooldown/session counters are restored, so an old card is never replayed.
- Optional engagement score and monthly rank fields come only from Community Analytics. Rank disappears when the minimum cohort is not met, and both fields are disabled on public cards by default.

This first slice implements Spotlight mode with optional cohort-protected monthly rank. Carousel, credits scroll, Stream Score, provider-support fields, rewards, and Discord snapshots remain later phases. A paid Channel Points request is intentionally not included until the add-on has an explicit fulfill/refund controller, so a full queue or failed display cannot silently consume a viewer's points.
