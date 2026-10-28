# Quote Vault

**Module:** `thsv.quote-vault` · **Version:** `4.0.58` · **Built in (extension)**

Provides one bounded, moderated, local quote library shared by Twitch, YouTube, Kick, and TikTok with source-platform-only responses.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Messaging** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Quote Vault`

- `THSV Addon - Quote Vault - Random Quote` in `THSV Addon - Quote Vault`
- `THSV Addon - Quote Vault - Statistics` in `THSV Addon - Quote Vault`
- `THSV Addon - Quote Vault - Native Quote Sync` in `THSV Addon - Quote Vault`

These optional actions emit only exact Quote Vault control envelopes. Public quote commands are parsed from normalized chat and need no Streamer.bot command or platform trigger.

Creator-selected triggers:

- **randomQuote:** Optional: attach to a creator-controlled hotkey, deck button, timer, or scene action.
- **statistics:** Optional: attach only to a creator-controlled hotkey or deck button.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.quote-vault` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Quote Vault |  | On |
| Platforms allowed to use Quote Vault |  | `twitch`, `youtube`, `kick`, `tiktok` |
| Command prefix |  | `!` |
| Get quote command |  | `quote` |
| Quote count or person lookup command |  | `quotes` |
| Community submission command |  | `quotesubmit` |
| Trusted direct-add command |  | `quoteadd` |
| Approve command |  | `quoteapprove` |
| Reject command |  | `quotereject` |
| Pending-review command |  | `quotepending` |
| Edit command |  | `quoteedit` |
| Soft-delete command |  | `quotedelete` |
| Restore command |  | `quoterestore` |
| Statistics command |  | `quotestats` |
| Who may submit quotes for review |  | `viewer` |
| Who may add approved quotes directly |  | `moderator` |
| Ignore detected bot accounts |  | On |
| Ignored viewers and bots | Preloaded with common service bots. One exact value per line: username, platform:username, or platform:id:stable-user-id. | `twitch:nightbot`, `twitch:streamelements`, `youtube:streamelements`, `kick:streamelements`, `twitch:fossabot`, `twitch:moobot`, `twitch:sery_bot`, `twitch:soundalerts`, `twitch:wizebot`, `twitch:kofistreambot`, `twitch:streamlabs`, `twitch:botrix`, `youtube:botrix`, `kick:botrix`, `tiktok:botrix` |
| Allow links inside quotes | Off by default. Quotes are plain text but links can still advertise unsafe destinations. | Off |
| Maximum characters in one quote |  | 240 |
| Maximum approved quotes |  | 100 |
| Maximum pending submissions |  | 20 |
| Viewer submission cooldown (seconds) |  | 60 |
| Viewer quote-request cooldown (seconds) |  | 10 |
| Global Quote Vault response spacing (seconds) | Six seconds is the minimum because the shared outbound-chat broker allows ten requests per minute per add-on. | 6 |
| Let moderators bypass command cooldowns |  | On |
| Mirror compatible approved quotes to Streamer.bot | Requires the current Quote Vault Streamer.bot import and approval for its Native Quote Sync action. Twitch, YouTube, and Kick are supported; TikTok remains Quote Vault-only. | Off |
| Streamer.bot Native Quote Sync action ID | Stable action ID from the current Quote Vault package. Keep the recommended value unless rebuilding the import. | `df4ee3e7-cee1-48e7-b301-5533d57c11d8` |
| Starter quotes | Optional first-run seed only. One line per quote: Quoted Name \| Quote text. Existing libraries are never replaced. | (none) |
| Displayed quote | The default sends only the quote text. Optional tokens: {id}, {quote}, {quotedName}, {platform}, {submittedBy}, {date}. | `{quote}` |
| Submission waiting for approval |  | `Quote #{id} was submitted for moderator approval.` |
| Direct addition succeeded |  | `Quote #{id} was added.` |
| Approval succeeded |  | `Quote #{id} was approved.` |
| Rejection succeeded |  | `Quote #{id} was rejected.` |
| Edit succeeded |  | `Quote #{id} was updated.` |
| Delete succeeded |  | `Quote #{id} was moved to recoverable trash.` |
| Restore succeeded |  | `Quote #{id} was restored.` |
| Duplicate quote response |  | `That quote is already approved or waiting for review.` |
| Permission denied response |  | `You do not have permission to use that Quote Vault command.` |
| Submission help |  | `Use {prefix}{submitCommand} @name \| quote text, or reply with {prefix}{submitCommand}.` |
| No quote found |  | `No matching quote was found.` |
| Library full response |  | `Quote Vault is full. A moderator must remove a quote before another can be added.` |

## Health checks

- **thsv.quote-vault.runtime:** Confirms bounded cross-platform quote commands, moderation, storage, and source-routed responses.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `state.private`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.quote-vault/`, `data/addons/.state/thsv.quote-vault/`.

Dependencies: none.

## Remove or repair

1. Export or record wanted quotes before uninstalling. Private Quote Vault state remains preserved for a later reinstall.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
