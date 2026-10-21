# Viewer Lobby

Viewer Lobby is a "play with viewers" waiting list. Viewers on Twitch, YouTube, Kick and TikTok type `!join` to get in line, and you pick who plays next with Streamer.bot buttons or hotkeys. An overlay shows the lobby status and the next viewers in line.

## What you need
- The Viewer Lobby Streamer.bot package. It creates **THSV Addon - Viewer Lobby - Open**, **Close**, **Pause**, **Resume**, **Next**, **Random**, **Complete** and **Clear**. Attach them only to your own hotkeys, deck buttons or scene actions, never to public chat triggers.
- A browser source for the queue overlay. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.viewer-lobby`).
- No Streamer.bot command objects are needed for `!join` and the other viewer commands. StreamBridge reads them from chat itself.

## Set it up
1. Open Setup Wizard > Add-ons, install Viewer Lobby.
2. Pick the platforms allowed to join and check the command names.
3. Set the queue limit (30 by default) and how many viewers the overlay shows (10 by default).
4. Decide on gamertags: viewers may type `!join MyTag`, but tags stay hidden on the overlay unless you turn on "Show gamertags on the public overlay".
5. Choose what happens when your last platform goes offline: **Close** keeps the list for later, **Clear** removes everyone.
6. Style the overlay (background, colors, font, text size) and add its URL to an OBS browser source.
7. Import the Streamer.bot package and attach the controls to your hotkeys or deck buttons.
8. Turn on "Enable Viewer Lobby" and restart StreamBridge.
9. To test, run the Open action, type `!join` in chat, then run Next and Complete.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!join` or `!join gamertag` | Everyone on the allowed platforms | Joins the waiting list while the lobby is open. |
| `!leave` | Everyone | Removes only your own entry. |
| `!position` | Everyone | Shows your place in line. |
| `!queue` | Everyone | Shows whether the lobby is open and how many are waiting. |

## Good to know
- The lobby starts closed. Viewers can only join after you run Open (or Resume after a Pause).
- **Next** picks the first waiting viewer, **Random** picks any waiting viewer. Both finish the current pick first. **Complete** removes the current pick. **Clear** closes the lobby and removes everyone, so put it on a deliberate button.
- Each viewer has a 3 second cooldown per command; you and moderators skip it. Common bots are on the ignore list.
- The queue survives a StreamBridge restart. Streamer.bot test events do not change it.
- The overlay never shows platform user IDs, and only shows gamertags if you allow it.
