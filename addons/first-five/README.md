# First Five

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
