# Viewer Lobby

**Module:** `thsv.viewer-lobby` · **Version:** `4.0.64` · **Built in (extension)**

Provides a bounded multi-platform play-with-viewers queue with source-routed commands, creator controls, and a read-only overlay.

Viewer Lobby is a "play with viewers" waiting list. Viewers on Twitch, YouTube, Kick and TikTok type `!join` to get in line, and you pick who plays next with Streamer.bot buttons or hotkeys. An overlay shows the lobby status and the next viewers in line.

## What you need
- The Viewer Lobby Streamer.bot package. It creates **THSV Addon - Viewer Lobby - Open**, **Close**, **Pause**, **Resume**, **Next**, **Random**, **Complete** and **Clear**. Attach them only to your own hotkeys, deck buttons or scene actions, never to public chat triggers.
- A browser source for the queue overlay. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.viewer-lobby`).
- No Streamer.bot command objects are needed for `!join` and the other viewer commands. StreamBridge reads them from chat itself.

## Set it up
1. Open Setup Wizard > Extensions, install Viewer Lobby.
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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Viewer Lobby`

- `THSV Addon - Viewer Lobby - Open` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Close` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Pause` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Resume` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Next` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Random` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Complete` in `THSV Addon - Viewer Lobby`
- `THSV Addon - Viewer Lobby - Clear` in `THSV Addon - Viewer Lobby`

Controls use an exact action-name/payload allowlist in StreamBridge. Clear is destructive and should be attached only to a deliberate creator control.

Creator-selected triggers:

- Attach only to creator-controlled hotkeys, deck buttons, or scene actions.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.viewer-lobby` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Viewer Lobby | Turn on viewer chat commands and creator controls after setup is complete. | Off |
| Platforms allowed to join | Only viewers chatting on checked platforms can use the lobby commands. | `twitch`, `youtube`, `kick`, `tiktok` |
| Command prefix | The one character viewers type before every lobby command. | `!` |
| Join command | A viewer types this command to enter the waiting list. | `join` |
| Leave command | A viewer types this command to remove only their own entry. | `leave` |
| Position command | Shows the invoking viewer's current waiting position. | `position` |
| Queue summary command | Shows whether the lobby is open and how many viewers are waiting. | `queue` |
| Maximum waiting viewers | New joins stop at this private queue limit. | 30 |
| Viewers shown on overlay | Limits the public browser source while the full private queue remains available. | 10 |
| Allow an optional gamertag after !join | When enabled, viewers can type !join followed by a gamertag. | On |
| Show gamertags on the public overlay | Off is safer; gamertags remain private unless this is explicitly enabled. | Off |
| Show platform names on the overlay | Displays Twitch, YouTube, Kick, or TikTok beside each visible viewer. | On |
| When the final live platform ends | Close keeps the queue for later; Clear permanently removes every entry. | `close` |
| Overlay background | Glass is recommended; None leaves only text visible. | `glass` |
| Background color | Six-digit hexadecimal color used behind the queue. | `#101820` |
| Background opacity | 0 is transparent and 1 is fully opaque. | 0.92 |
| Accent color | Used for borders and highlights. | `#7ff5cc` |
| Text color | Choose a high-contrast color for readable names and queue details. | `#ffffff` |
| Font style |  | `broadcast` |
| Overlay text size |  | 32 |
| Ignored viewers/bots | Preloaded with common service bots; add or remove exact login names as needed. | `nightbot`, `streamelements`, `fossabot`, `moobot`, `sery_bot`, `soundalerts`, `wizebot`, `kofistreambot`, `botrix`, `streamlabs` |

## Health checks

- **thsv.viewer-lobby.runtime:** Confirms serialized source-routed queue commands and creator-only controls are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.viewer-lobby/`, `data/addons/.state/thsv.viewer-lobby/`.

Dependencies: none.

## Remove or repair

1. Export any wanted queue summary before uninstalling. Private state remains preserved.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
