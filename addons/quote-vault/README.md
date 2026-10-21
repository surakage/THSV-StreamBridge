# Quote Vault

Quote Vault keeps one shared quote library for your Twitch, YouTube, Kick and TikTok chats. Viewers can pull up a random quote, look one up by number or name, and submit new quotes for a moderator to approve. Replies go only to the chat where the command was typed. You can also manage the whole library in the Setup Wizard.

## What you need
- Nothing extra for the chat commands. They work straight from StreamBridge's normal chat intake, so do not add any Streamer.bot commands or chat triggers.
- Optional: the Quote Vault Streamer.bot import, for creator controls and syncing:
  - **THSV Addon - Quote Vault - Random Quote**: attach to a hotkey, deck button, timer or scene action.
  - **THSV Addon - Quote Vault - Statistics**: attach to a hotkey or deck button you control.
  - **THSV Addon - Quote Vault - Native Quote Sync**: keep it triggerless and approve it only if you turn on Streamer.bot quote sync.

## Set it up
1. Open Setup Wizard > Extensions > Community Messaging > Quote Vault and choose which platforms may use it.
2. Check the command names and who may submit quotes (default: everyone) or add them directly (default: moderators).
3. Review the safety options: ignored bots, links (off by default), quote length and cooldowns.
4. Optional: enter starter quotes, one per line as `Quoted Name | Quote text`. These only fill a brand-new, empty library.
5. Optional: import the Streamer.bot package. Open each Execute C# Code sub-action and click **Save and Compile**. In each action's `quoteVaultSourcePlatform` argument, enter the chat that should get the reply (`twitch`, `youtube`, `kick` or `tiktok`).
6. Optional: to mirror quotes into Streamer.bot's own quote list, approve **Native Quote Sync** and turn on **Mirror compatible approved quotes to Streamer.bot**. Use the library's Import button to bring in your existing Streamer.bot quotes.
7. Save and restart StreamBridge.
8. Test: submit a harmless quote with a viewer account, approve it in the wizard's Quote library, then type `!quote` on the same platform. Simulated messages never change the library.

## Chat commands
| Command | Who can use it | What it does |
| --- | --- | --- |
| `!quote` | Everyone | Shows a random quote. `!quote 24` shows quote 24. `!quote search word` finds a match. |
| `!quotes` | Everyone | Shows quote counts. `!quotes @name` shows a random quote from that person. |
| `!quotesubmit @name \| quote text` | Everyone (configurable) | Sends a quote for moderator review. On Twitch you can also reply to a message with `!quotesubmit`. |
| `!quoteadd @name \| quote text` | Moderators and broadcaster (configurable) | Adds an approved quote straight away. |
| `!quotepending` | Moderators and broadcaster | Lists up to five quotes waiting for review. |
| `!quoteapprove 24` | Moderators and broadcaster | Approves a pending quote. |
| `!quotereject 24 reason` | Moderators and broadcaster | Rejects a pending quote (reason optional). |
| `!quoteedit 24 new text` | Moderators and broadcaster | Changes an approved quote. |
| `!quotedelete 24` | Moderators and broadcaster | Moves a quote to the recoverable trash. |
| `!quoterestore 24` | Moderators and broadcaster | Brings a deleted quote back. |
| `!quotestats` | Moderators and broadcaster | Shows library counts. |

## Good to know
- Quotes from moderators and the broadcaster skip the review queue.
- Default limits: 240 characters per quote, 100 approved and 20 pending quotes. Duplicates are refused.
- Cooldowns: 60 seconds between a viewer's submissions, 10 seconds between a viewer's requests, and 6 seconds between any Quote Vault replies. Commands on cooldown are ignored quietly. Moderators skip cooldowns by default.
- Common service bots are ignored out of the box. Add others as `username`, `platform:username` or `platform:id:user-id`.
- Quote numbers are never reused. The trash is small, so old deleted quotes eventually drop off.
- Streamer.bot sync covers Twitch, YouTube and Kick only. TikTok quotes stay in Quote Vault. Ordinary chat is never stored.
