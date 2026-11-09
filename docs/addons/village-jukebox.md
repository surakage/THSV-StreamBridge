# Village Jukebox

**Module:** `thsv.village-jukebox` · **Version:** `4.1.67` · **Built in (extension)**

Runs a fair, YouTube-first song-request queue across platforms, using one approved Streamer.bot song lookup action and the shared overlay.

Village Jukebox is a song-request queue for Twitch, YouTube, Kick and TikTok viewers. Viewers request a YouTube track with a link or a song title, and the track plays through a "Now Playing" browser source in your scene. Each viewer has one request at a time by default, so the queue stays fair.

## What you need
- The **Viewer Foundation** extension, enabled, if any platform pays with points (YouTube and TikTok do by default).
- A YouTube Data API key from your Google account.
- The Village Jukebox Streamer.bot package, kept triggerless: **THSV Addon - Village Jukebox - Resolve YouTube Track** (holds your API key) and **THSV Addon - Village Jukebox - Settle Twitch Reward** (only needed for Twitch reward requests).
- A visible browser source for the player. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.village-jukebox`); 640 x 460 is recommended. Make sure its audio goes to your stream.
- Optional: Twitch and Kick "Song Request" channel point rewards that require viewer text input. Paste the reward IDs into the wizard.

## Set it up
1. Make sure Viewer Foundation is enabled.
2. Import the Village Jukebox package into Streamer.bot.
3. Open **Resolve YouTube Track** in Streamer.bot and replace the `villageJukeboxYouTubeApiKey` Set Argument with your YouTube API key. Leave the action without triggers.
4. Open Setup Wizard > Extensions > Village Jukebox and approve Resolve YouTube Track (and Settle Twitch Reward if you use Twitch rewards).
5. Check the command names, platforms, points price (100 by default) and limits.
6. If you use rewards, turn on "Accept Twitch and Kick reward requests" and paste the reward IDs.
7. Add the overlay URL to an OBS browser source.
8. Tick "I understand that I am responsible for permission to rebroadcast requested music", save and restart StreamBridge.
9. Send an overlay preview from the wizard, then turn on "Enable Village Jukebox". Test with `!sr` and a YouTube link.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!sr <YouTube link or title>` | Everyone on the allowed platforms | Requests a track (costs points on YouTube and TikTok by default). |
| `!songqueue` | Everyone | Shows the queue length and the current track. |
| `!when` | Everyone | Shows your place in the queue. |
| `!wrongsong` | Everyone | Removes your newest queued request and refunds points. |
| `!voteskip` | Everyone | Votes to skip the current track (5 unique votes skip it). |
| `!skip` | You and moderators | Skips the current track right away. |
| `!pausesong` | You and moderators | Pauses the song where it is (or holds the queue). |
| `!resumesong` | You and moderators | Carries on from where it paused. |
| `!blocksong` | You and moderators | Blocks the song that is playing, or `!blocksong <YouTube link>`, so it can never be requested again. |

## Controlling the jukebox
**Jukebox remote:** a small player window of its own. Open it from the tray (**Open Jukebox remote**) or the **Open Jukebox remote** button on the Data tab; it unlocks itself. You can keep it beside OBS or add it as an OBS custom browser dock (`http://127.0.0.1:8787/wizard/jukebox`). It shows the video playing with its thumbnail and progress, **Play / Pause**, **Stop** (ends the video and holds the queue until you press Play), **Skip**, volume, the queue with **Play now** (start that video straight away), **Next**, **Remove** and **Block**, a box to block any link, and everything played and requested with **Play again** and **Copy all links**.

**Review each video before it plays** (on by default): every new request waits in the queue marked **Waiting for approval**, with its title, channel, length, thumbnail and link showing, so you can check it before anything reaches the stream. Press **Approve** to let it play in its turn, **Approve all** to let every waiting video through, **Play now** to start it straight away, or **Remove** / **Block** to turn it down (the viewer is refunded). Approved videos keep playing in order while others wait. Turn this off in Playback settings to play requests straight away.

**Streamer.bot buttons:** the Village Jukebox import also adds creator controls you can put on a Stream Deck button, a hotkey or any other creator-only trigger (never a chat command): **Open Remote** (opens the Jukebox remote, already unlocked), **Play Pause**, **Skip**, **Stop**, **Approve Next** (lets the oldest waiting video play in its turn) and **Approve All**. Find them in Streamer.bot under *THSV Addon - Village Jukebox*, right-click an action > Add trigger. StreamBridge accepts only these exact actions.

The same controls are in the Setup Wizard:
Open Setup Wizard > Extensions > Village Jukebox > **Data** for the **Jukebox controls** panel. Changes apply straight away, with no restart:
- **Now playing** with **Pause / Resume**, **Skip to next**, **Clear queue** and a **volume** slider. Pausing frees the stream audio for other clips; resuming carries on from the same spot.
- **Up next**: every queued song with its YouTube link. **Play next** moves a request to the front, **Remove** takes it out and refunds the viewer, **Block** removes it and blocks the video.
- **Block a video**: paste any YouTube link. Blocked videos are refused before anything is looked up or spent, and a blocked song that is queued or playing is removed or skipped with a refund. Unblock it from the same list.
- **Requested songs**: the last 200 requests with their links, who asked and what happened (played, skipped, removed, blocked). **Copy all links** copies them for a playlist or a post.

## Good to know
- Viewers can request any public, embeddable YouTube video: songs, Shorts (`youtube.com/shorts/...` links work) and longer videos. Videos can be up to 8 minutes by default; raise **Maximum video length** to allow up to an hour. Live streams, private and non-embeddable videos are refused. The last 20 played videos cannot be requested again.
- Limits by default: 25 tracks in the queue, 1 active request per viewer, and a 60 second cooldown per viewer.
- Searching by song title uses a lot of YouTube API quota, so title searches are capped at 50 per day (UTC). Direct links still work after the cap, and you can require links only.
- Your API key stays in Streamer.bot. It is never saved in StreamBridge settings, exports, overlay URLs or add-on state.
- Points are only spent once a track is found and accepted into the queue. Kick redemptions cannot be refunded automatically. A Twitch reward is fulfilled once the track joins the queue, so `!wrongsong` cannot reverse it.
- Playing a track does not give you the right to rebroadcast it. You are responsible for music licensing and platform rules.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Village Jukebox`

- `THSV Addon - Village Jukebox - Resolve YouTube Track` in `THSV Addon - Village Jukebox`
- `THSV Addon - Village Jukebox - Settle Twitch Reward` in `THSV Addon - Village Jukebox`
- `THSV Addon - Village Jukebox - Open Remote` in `THSV Addon - Village Jukebox`
- `THSV Addon - Village Jukebox - Play Pause` in `THSV Addon - Village Jukebox`
- `THSV Addon - Village Jukebox - Skip` in `THSV Addon - Village Jukebox`
- `THSV Addon - Village Jukebox - Stop` in `THSV Addon - Village Jukebox`
- `THSV Addon - Village Jukebox - Approve Next` in `THSV Addon - Village Jukebox`
- `THSV Addon - Village Jukebox - Approve All` in `THSV Addon - Village Jukebox`

Leave the lookup and reward actions triggerless. Your YouTube API key goes only in the song lookup action.

Creator-selected triggers:

- Optional: attach Open Remote, Play Pause, Skip, Stop, Approve Next or Approve All to a Stream Deck button, hotkey or other creator-only trigger. Never attach them to chat commands.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.village-jukebox` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Village Jukebox |  | Off |
| I understand that I am responsible for permission to rebroadcast requested music |  | Off |
| Song request command | Do not include the ! prefix. | `sr` |
| Queue status command |  | `songqueue` |
| Viewer position command |  | `when` |
| Remove own request command |  | `wrongsong` |
| Vote-skip command |  | `voteskip` |
| Moderator skip command |  | `skip` |
| Moderator pause command | You and your moderators pause the song (or hold the queue). | `pausesong` |
| Moderator resume command | Carries on from where the song paused. | `resumesong` |
| Moderator block command | Blocks the song that is playing (or a YouTube link after the command) so it can never be requested again. | `blocksong` |
| Allow song-title searches | Direct YouTube links use far less API quota. Disable this to require links only. | On |
| Maximum title searches per UTC day | YouTube search requests are quota-expensive; direct links do not consume this safety allowance. | 50 |
| Platforms allowed to request |  | `twitch`, `youtube`, `kick`, `tiktok` |
| Platforms charged Viewer Foundation points | Twitch and Kick can be free commands or use their native rewards. YouTube and TikTok default to points. | `youtube`, `tiktok` |
| Points per accepted request |  | 100 |
| Accept Twitch and Kick reward requests |  | Off |
| Twitch Song Request reward ID | The reward must require viewer text input. | (blank) |
| Kick Song Request reward ID | Kick reward failures cannot currently be refunded automatically. | (blank) |
| Maximum queued tracks |  | 25 |
| Maximum active requests per viewer |  | 1 |
| Viewer request cooldown (seconds) |  | 60 |
| Maximum video length (minutes) | Songs, Shorts and longer videos up to this length can be requested (up to an hour). | 8 |
| Recently played no-repeat count |  | 20 |
| Unique votes required to skip |  | 5 |
| Pause between tracks (seconds) |  | 4 |
| Review each video before it plays | New requests wait in the queue with their title showing until you press Approve in the Jukebox remote or the Wizard. Turn off to play requests straight away. | On |
| Announce each track in its request platform |  | On |
| Player volume |  | 0.7 |
| Now Playing background |  | `#101820` |
| Now Playing accent |  | `#7ff5cc` |
| Now Playing text |  | `#ffffff` |
| Now Playing font |  | `broadcast` |

## Health checks

- **thsv.village-jukebox.runtime:** Checks that song lookups, the fair saved queue, one-at-a-time playback, and replies to the right platform all work.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `streamerbot.run-approved-action`, `overlay.publish`, `media.exclusive`, `chat.send`, `schedule.bounded`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.village-jukebox/`, `data/addons/.state/thsv.village-jukebox/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstalling keeps the queue, cooldowns, and recently played songs for a later reinstall.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
