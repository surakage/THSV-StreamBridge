# Village Draw

**Module:** `thsv.village-draw` · **Version:** `4.0.49` · **Optional add-on**

Runs restart-safe free or Viewer Foundation points giveaways with bounded weighted tickets, authenticated controls, multi-platform announcements, and winner overlays.

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

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Village-Draw-4.0.49.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Village-Draw-4.0.49.thsv-addon` and review its permissions.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.village-draw` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

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
| Giveaway name | {community} becomes your community name. | `{community} Giveaway` |
| Description |  | `Enter for a chance to win!` |
| Prize item |  | `Mystery Prize` |
| Optional HTTPS prize image |  | (blank) |
| Entry method |  | `free-single` |
| Viewer Foundation points per ticket |  | 50 |
| Maximum tickets per viewer |  | 10 |
| Maximum entrants |  | 80 |
| Maximum total tickets |  | 10000 |
| Platforms allowed to enter |  | `twitch`, `youtube`, `kick`, `tiktok` |
| Chats receiving open, winner, and cancellation messages |  | `twitch`, `youtube`, `kick`, `tiktok` |
| When the stream ends |  | `close` |
| Giveaway opened message |  | `{name} is open! Prize: {prize}. Use {entryCommand}.` |
| Winner message |  | `{winner} won {prize} in {name}!` |
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

- **thsv.village-draw.runtime:** Confirms serialized entries, recoverable Viewer Foundation spending/refunds, secure weighted selection, and hosted result cards.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `schedule.bounded`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.village-draw/`, `data/addons/.state/thsv.village-draw/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Cancel and refund an open points draw before uninstalling. Private bounded history remains available for a later reinstall.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
