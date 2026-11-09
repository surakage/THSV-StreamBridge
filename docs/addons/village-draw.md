# Village Draw

**Module:** `thsv.village-draw` · **Version:** `4.1.67` · **Built in (extension)**

Runs free or Viewer Foundation points giveaways that survive a restart, with limited extra tickets, protected controls, announcements on every platform, and winner overlays.

Village Draw runs community giveaways across Twitch, YouTube, Kick and TikTok. Viewers join for free or buy tickets with their StreamBridge points. You see everyone who joined, draw one or more winners, give a winner a set time to answer, draw again if they are away, and end the giveaway so it is saved to the history. A prize ticket overlay cycles through entrant names before revealing the winner.

## What you need
- The **Viewer Foundation** extension, enabled first. Village Draw uses its points and never creates a second balance.
- A browser source for the prize ticket. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.village-draw`). Enable browser-source audio if you want the winner tone.
- Nothing extra in Streamer.bot. Keep your main THSV platform chat actions as they are; do not make separate giveaway commands or triggers.

## Set it up
1. Make sure Viewer Foundation is enabled.
2. Open Setup Wizard > Extensions, install Village Draw and turn it on.
3. **What are you giving away?** Name, prize, number of winners (1 to 10), and an optional description and HTTPS prize picture.
4. **Who can enter?** Free (one entry each), one points ticket, or several points tickets. Pick the platforms and who may join (everyone, subs and members, VIPs, moderators). Optional: extra luck for subs or VIPs (2 means each ticket counts twice), and skip winners of your last few giveaways.
5. **How does it run?** Optional timers: close entries by themselves after a number of minutes, a reminder message every few minutes (5 by default), and how long a winner has to answer (60 seconds by default). Choose whether the winner answers by saying anything or by typing `!claim`, and whether someone else is drawn right away when they do not answer.
6. Change any chat message you like, and pick which chats get them.
7. Save and restart StreamBridge, then send an overlay preview from the wizard and add the overlay URL to an OBS browser source.
8. Run the giveaway from the **Control Panel** (Village Draw tab): Start giveaway, Close entries, Draw a winner, Winner confirmed or Not here, draw again, End giveaway.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!giveaway` | Everyone | Shows the prize, how to join, how many joined and the time left. |
| `!giveaway start 10` / `pause` / `resume` / `close` | You and moderators | Starts (optionally closing after 10 minutes), pauses, resumes or closes entries. |
| `!giveaway draw` / `redraw` / `confirm` / `end` | You and moderators | Draws a winner, draws someone else, confirms the winner, or ends and saves the giveaway. |
| `!giveaway cancel` | You and moderators | Cancels and refunds all tickets. |
| `!enter` | Everyone on the allowed platforms | Joins with one ticket (free or paid, depending on the entry method). |
| `!tickets 3` / `!tickets max` | Everyone on the allowed platforms | Buys that many tickets, or as many as you can, in multiple-ticket mode. |
| `!mytickets` | Everyone | Shows your tickets and your chance right now. |
| `!claim` | The winner | Claims the prize while the claim timer runs. |
| `!winners` | Everyone | Shows the winners of the current or last giveaway. |

## Good to know
- The Control Panel lists everyone who joined with their platform, tickets, luck and chance. Remove someone with one click; any points they spent are refunded.
- With several winners, each one is drawn on their own and can be confirmed or redrawn on their own. Someone who was already picked is never picked twice in the same giveaway.
- The claim timer, auto-close, last call (1 minute before closing) and reminders keep running after a restart.
- Ending a giveaway saves the name, prize, winners, entrant count and date. The last 20 show under Past giveaways.
- Every ticket has the same chance, times the viewer's luck. Winners are picked by StreamBridge, before the overlay shows them.
- Limits: up to 1,000 entrants (500 by default) and 50,000 tickets. Viewers have a 2 second cooldown per command; you and moderators skip it.
- Canceling a points giveaway refunds every ticket. A points giveaway can only be ended once a winner is drawn; otherwise cancel and refund.
- Only StreamBridge points can buy tickets. Money, donations, Bits, subs and channel point rewards are not accepted.
- Streamer.bot test events only show a preview card with example names; they never buy tickets or pick a real winner.
- This is meant for casual community giveaways, not regulated or high-value prize drawings.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.village-draw` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Village Draw |  | Off |
| Command prefix | Use the same one-character prefix viewers already use in chat. | `!` |
| Giveaway information and moderator command |  | `giveaway` |
| Single-entry command |  | `enter` |
| Multiple-ticket purchase command |  | `tickets` |
| Ticket balance command |  | `mytickets` |
| Claim command (for the winner) |  | `claim` |
| Winners command | Shows the winners of the current or last giveaway. | `winners` |
| Giveaway name | {community} becomes your community name. | `{community} Giveaway` |
| Description |  | `Enter for a chance to win!` |
| Prize |  | `Mystery Prize` |
| Optional HTTPS prize image |  | (blank) |
| Number of winners |  | 1 |
| Entry method |  | `free-single` |
| Viewer Foundation points per ticket |  | 50 |
| Maximum tickets per viewer |  | 10 |
| Maximum entrants |  | 500 |
| Maximum total tickets |  | 10000 |
| Platforms allowed to enter |  | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Who can enter | Pick Everyone, or only the groups you want. | `everyone` |
| Extra luck for subs and members | 2 means each of their tickets counts twice. | 1 |
| Extra luck for VIPs |  | 1 |
| Skip winners of the last giveaways | 0 lets everyone enter. 2 means winners of your last 2 giveaways sit this one out. | 0 |
| Close entries automatically after (minutes) | 0 means you close entries yourself. | 0 |
| Reminder message every (minutes) | 0 turns the reminder off. | 5 |
| Time the winner has to answer (seconds) | 0 turns the claim timer off. | 60 |
| How the winner claims |  | `any-message` |
| If the winner does not answer in time |  | `wait` |
| Chats receiving open, winner, and cancellation messages |  | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| When the stream ends |  | `close` |
| Giveaway opened message |  | `{name} is open! Prize: {prize}. Use {entryCommand}.` |
| Reminder message |  | `{name} is still open! Prize: {prize}. Type {entryCommand} to join. {entrants} entered so far.` |
| Last call message (1 minute left) |  | `Last call! {name} closes in 1 minute. Type {entryCommand} to join.` |
| Entries closed message |  | `Entries for {name} are closed. {entrants} entered. Good luck!` |
| Winner message |  | `{winner} won {prize} in {name}!` |
| Claim reminder for the winner |  | `{winner}, type {claimCommand} in chat within {seconds} seconds to claim your prize!` |
| Winner claimed message |  | `{winner} claimed {prize}. Congratulations!` |
| Winner did not answer message |  | `{winner} did not claim in time.` |
| Giveaway ended message |  | `{name} has ended. Winners: {winners}. Thanks to everyone who joined!` |
| Cancellation message |  | `{name} was canceled. Purchased tickets were refunded.` |
| Source-chat ticket confirmation |  | `{viewer}, you now have {tickets} ticket(s) in {name}. Remaining: {points} {currency}.` |
| Show the giveaway card when entries open |  | On |
| Show the winner card |  | On |
| Overlay card duration (seconds) |  | 12 |
| Card background |  | `#10201b` |
| Ticket background opacity | Lower values show more of the stream behind the ticket. | 0.72 |
| Giveaway accent |  | `#7ff5cc` |
| Winner accent |  | `#ffd166` |
| Text color |  | `#ffffff` |
| Font |  | `broadcast` |
| Prize ticket size |  | `compact` |
| Drawing animation time | How long entrant names cycle before the winning ticket is revealed. | 4 |
| Show lightweight winner confetti |  | On |
| Show the prize image |  | On |
| Show the winner profile picture when available |  | On |
| Show the winner platform |  | On |
| Show entrant and ticket totals |  | On |
| Play a short winner tone | Browser-source audio must be enabled in OBS, Meld, or Streamlabs Desktop. | Off |
| Winner reveal message |  | `The community has chosen!` |

## Health checks

- **thsv.village-draw.runtime:** Checks that entries are handled one at a time, Viewer Foundation points spent or refunded can be recovered, winners are picked fairly, and result cards show.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `schedule.bounded`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.village-draw/`, `data/addons/.state/thsv.village-draw/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Cancel and refund an open points draw before uninstalling. Its private history is kept for a later reinstall.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
