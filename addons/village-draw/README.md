# Village Draw

Village Draw runs community giveaways across Twitch, YouTube, Kick and TikTok. Viewers enter for free or buy tickets with their StreamBridge points, and a prize ticket overlay cycles through entrant names before revealing the winner. Open, winner and cancel messages go to the chats you pick.

## What you need
- The **Viewer Foundation** extension, enabled first. Village Draw uses its points and never creates a second balance.
- A browser source for the prize ticket. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.village-draw`). Enable browser-source audio if you want the winner tone.
- Nothing extra in Streamer.bot. Keep your main THSV platform chat actions as they are; do not make separate giveaway commands or triggers.

## Set it up
1. Make sure Viewer Foundation is enabled.
2. Open Setup Wizard > Add-ons, install Village Draw.
3. Fill in the giveaway name, description, prize and optional HTTPS prize image.
4. Pick the entry method: **free single entry** (best to start with), **one points ticket**, or **multiple points tickets** (50 points per ticket, up to 10 per viewer by default).
5. Pick the platforms allowed to enter and the chats that get announcements.
6. Choose what happens when the stream ends: close entries (default), pause them, or leave them open.
7. Style the ticket: compact or wide, colors, drawing time, confetti, prize image, winner avatar, and an optional winner tone.
8. Turn on "Enable Village Draw", save and restart StreamBridge, then send an overlay preview from the wizard.
9. Add the overlay URL to an OBS browser source.
10. To run a giveaway, use the Live controls in the wizard (or the moderator commands below): Open entries, Close, Draw, then Confirm.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!giveaway` | Everyone | Shows the current giveaway, its status and the number of entrants and tickets. |
| `!giveaway open` / `pause` / `resume` / `close` | You and moderators | Opens, pauses, resumes or closes entries. |
| `!giveaway draw` / `redraw` / `confirm` | You and moderators | Draws a winner (entries must be closed), draws again, or confirms the result. |
| `!giveaway cancel` / `reset` | You and moderators | Cancels and refunds all tickets, or clears a finished giveaway. |
| `!enter` | Everyone on the allowed platforms | Enters with one ticket (free or paid, depending on the entry method). |
| `!tickets 3` | Everyone on the allowed platforms | Buys that many tickets in multiple-ticket mode. |
| `!mytickets` | Everyone | Shows how many tickets you have. |

## Good to know
- Every ticket has the same chance. The winner is picked by StreamBridge from a frozen snapshot of tickets, before the overlay shows it.
- Limits by default: 80 entrants and 10,000 tickets in total. Viewers have a 2 second cooldown per command; you and moderators skip it.
- Canceling a points giveaway refunds every ticket. Cancel and refund an open points draw before you uninstall.
- Only StreamBridge points can buy tickets. Money, donations, Bits, subs and channel point rewards are not accepted.
- Streamer.bot test events only show a preview card with example names; they never buy tickets or pick a real winner.
- This is meant for casual community giveaways, not regulated or high-value prize drawings.
