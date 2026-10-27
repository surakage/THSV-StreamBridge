# First Five

**Module:** `thsv.first-five` · **Version:** `4.0.55` · **Built in (extension)**

Runs cross-platform First Five placements using Twitch/Kick rewards and Viewer Foundation points on YouTube/TikTok, with one placement per viewer per stream.

First Five rewards the first five viewers who show up each stream. On Twitch and Kick, viewers claim a place with five channel point rewards (1st to 5th). On YouTube, TikTok and Facebook, they type one chat command and pay with Viewer Foundation points. Each place earns monthly points (5, 4, 3, 2, 1), and an optional leaderboard card shows the board on stream.

## What you need
- The **Viewer Foundation** add-on. First Five needs it for points on YouTube, TikTok and Facebook.
- The First Five Streamer.bot import. It contains **THSV Addon - First Five - Controller** (keep it triggerless and approve it for this add-on) and **THSV Addon - First Five - Reset** (optional, for a deck button or hotkey).
- Five Twitch channel point rewards, one per place. Paste each reward ID into the wizard.
- Five Kick rewards, one per place, if you stream on Kick. Paste each reward ID into the wizard.
- Optional: a browser source for the leaderboard card. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.first-five`). Compact, regular and vertical card sizes are offered.

## Set it up
1. In Streamer.bot, import the First Five package. Leave the Controller action with no triggers.
2. Keep your Twitch and Kick Reward Redemption triggers on StreamBridge's normal platform intake actions. Do not add them to the First Five actions.
3. On Twitch, create five rewards named like "First Five: Claim 1st Place" through "First Five: Claim 5th Place". The wizard suggests 100 points each and viewer input off. Keep **Skip Reward Queue** turned off.
4. If you stream on Kick, create the same five rewards there.
5. Open Setup Wizard > Extensions > Community Rewards > First Five. Paste the five Twitch reward IDs in order (1st to 5th), then the five Kick reward IDs in order.
6. Check the command name for YouTube, TikTok and Facebook (default `firstfive`) and its point cost (default 25).
7. Adjust the reward titles, chat messages and monthly leaderboard options if you like.
8. Approve the Controller action for First Five, turn on **Enable First Five**, save, and restart StreamBridge so the chat command registers.
9. To test offline, add the leaderboard browser source and use the wizard's preview. Simulated events and trigger tests never change your live rewards, so check the full claim chain on a real stream.

## Chat commands
| Command | Who can use it | What it does |
| --- | --- | --- |
| `!firstfive` | Viewers on YouTube, TikTok and Facebook | Spends 25 Viewer Foundation points to claim the next open place. |

## Good to know
- One viewer can claim only one place per stream. Each platform has its own five-place board.
- On Twitch, a successful claim renames the reward to "{name} was {ordinal}", disables it and enables the next place. Repeat or out-of-order claims are canceled and refunded.
- Keep **Skip Reward Queue** off on Twitch. Twitch cannot refund a redemption that was already fulfilled.
- StreamBridge cannot rename, disable or refund Kick rewards. Only the next expected place is accepted, and rejected Kick claims stay spent.
- When the stream goes offline, the five Twitch rewards are disabled. When you go live again, the titles reset, only 1st place is enabled and the places are cleared.
- Monthly scores roll over on the first First Five event of a new month, using your PC's time zone unless you set one. Ties go to the viewer with more 1st places, then to whoever scored first.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Rewards** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - First Five`

- `THSV Addon - First Five - Controller` in `THSV Addon - First Five`
- `THSV Addon - First Five - Reset` in `THSV Addon - First Five`

Controller must remain triggerless and is dispatched only by the creator-approved First Five add-on. Reset emits one tightly scoped local control event.

Creator-selected triggers:

- **reset:** Optional: attach to a deck button or hotkey for a creator-confirmed emergency stream reset.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.first-five` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable First Five |  | On |
| 1st-place Reward ID | Right-click the Streamer.bot-owned Twitch reward and copy its Reward ID. | (blank) |
| 2nd-place Reward ID |  | (blank) |
| 3rd-place Reward ID |  | (blank) |
| 4th-place Reward ID |  | (blank) |
| 5th-place Reward ID |  | (blank) |
| Kick 1st-place Reward ID |  | (blank) |
| Kick 2nd-place Reward ID |  | (blank) |
| Kick 3rd-place Reward ID |  | (blank) |
| Kick 4th-place Reward ID |  | (blank) |
| Kick 5th-place Reward ID | Kick claims work natively, but rejected claims cannot be automatically refunded and reward enable/title changes are not exposed by the current documented API. | (blank) |
| YouTube and TikTok claim command |  | `firstfive` |
| YouTube and TikTok placement cost |  | 25 |
| Available 1st-place title |  | `First Five: Claim 1st Place` |
| Available 2nd-place title |  | `First Five: Claim 2nd Place` |
| Available 3rd-place title |  | `First Five: Claim 3rd Place` |
| Available 4th-place title |  | `First Five: Claim 4th Place` |
| Available 5th-place title |  | `First Five: Claim 5th Place` |
| Claimed reward title | Tokens: {name}, {ordinal}. The rendered title is safely limited to Twitch's 45-character maximum. | `{name} was {ordinal}` |
| Announce successful placements in Twitch chat |  | On |
| Successful-claim message | Tokens: {name}, {ordinal}, {position}. | `{name} claimed {ordinal} place in First Five!` |
| Tell repeat claimants why they were refunded |  | Off |
| Repeat-claim message | Token: {name}. Leave repeat notifications off to reduce chat noise. | `{name}, you already claimed a First Five place this stream.` |
| Announce the previous month's winner | The announcement is sent on the first Twitch stream or First Five event in the new month. | On |
| Monthly-winner message | Tokens: {name}, {points}, {firsts}, {month}. | `Last month’s First Five winner was {name} with {points} points!` |
| Show a First Five leaderboard card after updates |  | On |
| Leaderboard card duration (seconds) |  | 30 |
| Delay between different platform boards (seconds) | Adds a short breathing gap when claims arrive from different platforms. Same-platform claims update the board in place. | 2 |
| Monthly leaderboard time zone | Leave blank to use this PC's time zone, or enter an IANA time zone such as America/New_York. Invalid values fall back to this PC's time zone. | (blank) |

## Health checks

- **thsv.first-five.runtime:** Confirms serialized placement claims, reward transitions, and monthly leaderboard state.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`, `schedule.bounded`.

Private storage: `data/addons/thsv.first-five/`, `data/addons/.state/thsv.first-five/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstall the add-on. Its compact leaderboard state remains preserved for a later reinstall.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
