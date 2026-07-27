# Viewer Foundation contract and threat model

Viewer Foundation (`thsv.viewer-foundation`) is an optional first-party add-on. Bridge Core transports normalized events but does not own identities, balances, levels, achievements, or viewer profiles.

## Authority and data contract

The foundation is the sole future authority for cross-platform links and progression balances. Consumers such as Community Analytics, Viewer Spotlight, Bloom companion systems, and games must request a bounded projection through a future broker capability. They must never read the foundation's private state file directly.

An unlinked account resolves to an installation-local ID formed from a random private salt, platform, and stable platform user ID. An explicit link resolves multiple accounts to one creator-selected lowercase viewer ID. Names, display names, and avatars are presentation data and never identity keys.

Runtime state version 1 contains only:

- a random 192-bit installation salt;
- pseudonymous viewer IDs;
- non-negative point totals and derived levels;
- bounded per-event award timestamps;
- a last-seen timestamp for deterministic capacity eviction; and
- short, expiring replay fingerprints.

Raw platform IDs exist only in creator-authored private settings when an explicit link is configured. Chat text, command arguments, display names, avatars, OAuth credentials, raw provider payloads, and monetary values are not persisted.

## Award rules

Awards are fixed integers configured per normalized event type. The engine does not convert currency, bits, gifts, Jewels, or reward cost into points. Processing is serialized, stable event identities are fingerprinted, simulated events are excluded by default, and the state write completes before an award is considered committed.

Chat activity has a per-viewer cooldown. High-impact public alert and reward events already require a stable provider event ID at the normalized-event boundary. Collections are bounded by both count and expiry.

## Threats and controls

| Threat | Control |
| --- | --- |
| Link two unrelated viewers by a shared or renamed display name | Display names are never accepted as identity evidence; links require explicit platform plus stable user ID. |
| Correlate exported pseudonyms across installations | Each installation generates a private random salt. |
| Replay a reward, subscription, or financial event | Stable source identity is hashed into a bounded replay set before committing the award. |
| Farm chat through rapid repeats | A per-viewer chat cooldown applies before points are granted. |
| Inflate production data with test triggers | Simulated events are excluded by default and require an explicit creator setting. |
| Retain private conversation content | No message text, command arguments, or raw payload is stored. |
| Exhaust memory or the 64 KiB state boundary | Viewer and replay collections have hard caps; oldest viewer activity and expired replay identities are pruned. |
| Let another add-on mutate balances by reading files | State remains behind the add-on capability broker; direct cross-add-on file access is unsupported. |
| Expose destructive privacy controls to viewers | Export, correction, and deletion are authenticated local-wizard operations with explicit confirmation; none are chat commands. Account links remain creator-authored settings. |

## Delivery phases

1. **Implemented foundation slice:** salted identities, explicit link parsing, fixed progression awards, cooldowns, replay protection, bounded private state, package UI, and tests.
2. **Implemented consumer boundary:** a narrow broker-owned read/mutation service with dependency checks, provider identity enforcement, two-second call limits, idempotency, audit records, automatic lifecycle revocation, and no raw-state exposure.
3. **Implemented authenticated administration:** live private-state summary, bounded viewer export, audited add/remove/reset corrections, explicit deletion confirmation, mutation-history scrubbing, and serialized atomic writes through the active provider. Link rules remain validated settings and require restart after editing.
4. **Next consumers:** Community Analytics first, followed by Viewer Spotlight; Bloom and game systems remain later opt-in consumers.

The provider boundary and local administration boundary are complete. A creator should remove a viewer's explicit account-link setting and restart before running deletion when they need the link itself erased as well as progression state.
