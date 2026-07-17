# Viewer Identity and Progression

Milestone 9 provides one local identity key for creator-approved linked accounts and privacy-preserving platform-scoped keys for everyone else. It never merges viewers by name, display name, avatar, message text, or behavioral similarity.

## Enable it

Copy the `viewerIdentity` section from `config/bridge.example.json` into the ignored `data/runtime/bridge.local.json` configuration and set `enabled` to `true`. Keep `includeSimulated` false for production.

```json
"viewerIdentity": {
  "enabled": true,
  "stateFile": "data/state/viewer-progression.json",
  "includeSimulated": false,
  "processedEventTtlMs": 86400000,
  "maxProcessedEvents": 10000,
  "links": [
    {
      "viewerId": "village-friend",
      "accounts": [
        { "platform": "twitch", "userId": "verified-twitch-id" },
        { "platform": "youtube", "userId": "verified-youtube-id" }
      ]
    }
  ],
  "progression": {
    "enabled": true,
    "points": { "chat.message": 1, "channel.follow": 10 },
    "cooldownsMs": { "chat.message": 60000 },
    "levelThresholds": [0, 100, 250, 500, 1000]
  }
}
```

Only link accounts after the viewer or creator has verified ownership. A platform account may belong to exactly one configured viewer ID, and configuration validation rejects collisions. Removing a link stops future events from sharing that identity; it does not silently merge or split existing point records.

## Progression behavior

- Only human actors with a stable platform user ID can resolve to a viewer identity.
- Unlinked viewers receive a stable value shaped like `twitch-<24 hex characters>`. The raw ID is hashed with its platform and never written to progression state.
- Points are fixed per normalized event type. Monetary amounts, gift value, message length, and inferred exchange rates never affect points.
- Cooldowns are keyed by the resolved viewer ID, so linked Twitch and YouTube accounts share one chat cooldown.
- The first level threshold must be zero and every later threshold must increase.
- A source event fingerprint is retained only for the configured TTL and bounded count. Replays cannot award twice inside that window.
- Simulated events resolve identity for testing but do not award points unless `includeSimulated` is explicitly enabled. Bots and system actors never participate.

Each successful award emits a correlated `viewer.progression` event containing the trusted viewer ID, fixed award, total, old/new level, level-up flag, and next threshold. It contains no viewer name or message.

## Streamer.bot

Import these packages in order:

1. `packages\streamerbot\core-receiver\THSV-StreamBridge-Core-Receiver-1.0.4.sb`
2. `packages\streamerbot\multi-commands\THSV-StreamBridge-Multi-Commands-1.1.0.sb`
3. `packages\streamerbot\viewer-progression\THSV-StreamBridge-Viewer-Progression-1.0.0.sb`

Re-add Multi-Commands and Viewer Progression as **Run Action Immediately** children after the receiver C# sub-action. The progression action is projection-only: it sets `viewerProgression*` arguments and never runs rewards, writes globals, or stores data. Creator actions decide what a level-up does.

Use `multiCommandViewerId` for shared command cooldowns. If it is empty, identity is disabled or the actor lacks a stable human platform ID; do not claim such a cooldown is cross-platform bypass-resistant.

## State, privacy, and recovery

`data/state/viewer-progression.json` stores pseudonymous viewer IDs, total points, level, last-award timestamps, and bounded SHA-256 event fingerprints. It stores no names, display names, messages, avatars, raw payloads, or raw platform account IDs. Creator-configured link IDs remain in the ignored local configuration file.

The state file is written by atomic replacement. Invalid or corrupted state stops identity startup with a readable error instead of silently resetting points. `scripts\backup.ps1` includes the state directory and `bridge.local.json` but deliberately excludes the runtime control token. Keep those backups private; never publish either file in a release or repository.
