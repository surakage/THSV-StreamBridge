# Community Analytics

Community Analytics is an optional, local-first companion to Viewer Foundation. It tracks bounded stream-session attendance and interaction counters across Twitch, YouTube, Kick, and TikTok.

## What it is for

Use Community Analytics when you want StreamBridge features such as Viewer Spotlight to read bounded local attendance, message, command, and optional engagement-score totals. It is not a replacement for Twitch, YouTube, Kick, or TikTok analytics and it does not calculate revenue.

## Setup order

1. Install and enable Viewer Foundation first.
2. Keep platform triggers on the existing main THSV intake actions. Community Analytics has no `.sb` import and needs no direct Streamer.bot trigger.
3. In the wizard, select which platforms count and add stable-ID exclusions. Leave simulated events disabled outside deliberate testing.
4. Leave monthly participation scoring disabled unless Viewer Spotlight or another approved consumer needs it.
5. Save, restart StreamBridge, then open **Community snapshot**. It puts the current stream, three key activity totals, and recent streams first. Open **All activity counters** only when you need the complete breakdown; detailed downloads and privacy tools stay in their own secondary panels.

If the summary remains empty, confirm Viewer Foundation and the selected platform intake are healthy before changing retention or scoring settings.

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
