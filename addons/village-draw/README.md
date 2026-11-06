# Village Draw

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
