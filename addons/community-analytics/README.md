# Community Analytics

Community Analytics is an optional, local-first companion to Viewer Foundation. It tracks bounded stream-session attendance and interaction counters across Twitch, YouTube, Kick, and TikTok.

- Viewer Foundation is the only identity authority; this add-on never links accounts or guesses from names.
- It stores no chat text, display names, avatars, monetary values, credentials, or raw platform payloads.
- Bots, system actors, ignored stable accounts, ignored Viewer Foundation IDs, and simulations are excluded by default.
- A Viewer Foundation privacy deletion immediately removes the matching pseudonymous viewer record and active-session attendance. Completed aggregate session totals contain no viewer IDs and remain intact.
- Optional monthly engagement scoring uses only creator-weighted observed sessions, messages, and commands. Each input has a hard monthly cap, the season rolls over by UTC month, and money or provider support never contributes.
- Exact monthly rank is omitted until the creator-selected minimum cohort has been observed. Below that threshold, consumers may receive the score and cohort size but not an identifying rank position.
- Replayed events are fingerprinted, normal processing is serialized, and state writes are atomic through the capability broker.
- A session begins with the first enabled `stream.online` event and closes after every live platform is offline. Activity seen without lifecycle data is labeled as an approximate session.
- Counters are local StreamBridge observations, not official platform analytics, revenue, payout, or tax records.
- The authenticated local wizard shows active/recent aggregate session summaries and supports one-viewer privacy export and confirmed deletion.
- Deletion removes the viewer's private lifetime record and active-session attendance. Completed sessions retain only non-identifying aggregate totals, so there is no historical viewer identity to remove from them.
- Permissioned add-ons that explicitly depend on Community Analytics can request one bounded pseudonymous viewer projection or the active aggregate session projection. They never receive the backing state file.
- The wizard downloads an aggregate session JSON report or a pseudonymous viewer-counter CSV. Both are generated locally, size-bounded, and contain no raw event history.

Viewer Spotlight now consumes these bounded projections for optional observed counters, monthly engagement score, and cohort-protected rank. Genuine live multi-platform acceptance remains separate from this automated foundation.
