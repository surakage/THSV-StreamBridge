# Village Jukebox

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
