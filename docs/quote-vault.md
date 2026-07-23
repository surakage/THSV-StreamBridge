# Quote Vault

Quote Vault is an optional cross-platform add-on that keeps one moderated quote library for Twitch, YouTube, Kick, and TikTok. It listens to StreamBridge's normalized public chat and sends replies only to the platform where the command originated. No separate platform triggers, Streamer.bot commands, database, or additional WebSocket are required.

Ordinary chat is never retained. Only explicit quote submissions, approved quotes, a small recoverable trash list, cooldown timestamps, and bounded moderation history enter the add-on's private local state.

## Install

1. Download the matching Quote Vault add-on ZIP from the same official GitHub Release as core.
2. Open the authenticated StreamBridge wizard and install the `.thsv-addon`.
3. Review enabled platforms, command names, roles, link policy, limits, messages, and privacy.
4. Restart StreamBridge after saving.
5. The bundled Streamer.bot `.sb` is optional. Import it only if creator-triggered Random Quote and Statistics actions are wanted.
6. If imported, open both Execute C# Code sub-actions and select **Save and Compile**.

Do not attach Twitch, YouTube, Kick, or TikFinity chat triggers to the optional actions. Public commands arrive through the main platform intake exactly once.

## Viewer commands

Defaults:

- `!quote` — display a random approved quote without immediately repeating the previous quote when alternatives exist.
- `!quote 24` — display quote 24.
- `!quote search sloth` — display a random approved match by quote text or quoted name.
- `!quotes` — display approved and pending counts.
- `!quotes @Bloom` — display a random approved quote attributed to Bloom.
- `!quotesubmit @Bloom | Quote text` — submit a quote for moderator review.
- On Twitch, reply to a message with `!quotesubmit` to capture the replied-to author and message.

YouTube, Kick, and TikTok use the explicit `@name | quote` form because equivalent normalized reply fields are not claimed for those providers.

## Moderator commands

- `!quoteadd @Bloom | Quote text` — add an approved quote directly.
- `!quotepending` — show up to five pending IDs and previews.
- `!quoteapprove 24`
- `!quotereject 24 optional reason`
- `!quoteedit 24 Updated quote text`
- `!quotedelete 24` — move an approved quote into recoverable trash.
- `!quoterestore 24`
- `!quotestats` — show approved, pending, recoverable, and storage counts.

Moderator commands require moderator or broadcaster role. The direct-add command defaults to moderator, while community submissions default to viewer; both are configurable.

## Safety and storage

- System and simulated messages never mutate or display live quote state.
- Detected bots are ignored by default.
- Exact ignore rules support `username`, `platform:username`, and `platform:id:stable-user-id`.
- Links are rejected by default.
- Duplicate matching compares normalized quoted name and quote text across approved and pending records.
- The default quote limit is 240 characters.
- The default library holds at most 100 approved and 20 pending quotes.
- State serialization is rejected before exceeding the add-on broker's private-state limit.
- The deleted list, audit history, and cooldown list rotate at strict bounds.
- Global response spacing defaults to six seconds, matching the shared ten-request-per-minute outbound-chat allowance.
- Cooldown attempts are silent so spam cannot turn rejection notices into outgoing-message spam.

Quote IDs never recycle. Rejected or deleted records may disappear from the small recoverable list as newer moderation operations rotate in; this is intentional bounded retention, not permanent archival.

## Starter quotes

The wizard can seed a never-used library with up to 30 starter entries:

```text
Bloom | Stay curious.
Streamer | That went exactly according to plan.
```

Starter settings never replace or delete an existing private library.

## Optional Streamer.bot controls

The separate package contains:

- `THSV Addon - Quote Vault - Random Quote`
- `THSV Addon - Quote Vault - Statistics`

Each action has an editable `quoteVaultSourcePlatform` Set Argument accepting `twitch`, `youtube`, `kick`, or `tiktok`. They emit only an exact local creator-control envelope and never read quote files or carry quote text.

Streamer.bot documents native quote methods for Twitch, YouTube, and Kick, but not TikTok. Quote Vault deliberately owns its cross-platform library instead of splitting records between incompatible platform stores:

- [Streamer.bot quote methods](https://docs.streamer.bot/api/csharp/methods)
- [Streamer.bot Add Quote](https://docs.streamer.bot/api/sub-actions/core/quotes/add-quote)
- [Streamer.bot Command Triggered variables](https://docs.streamer.bot/api/triggers/core/commands/command-triggered)
