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

## Good to know
- YouTube is the only music source. Tracks can be up to 8 minutes by default (10 at most), and the last 20 played tracks cannot be requested again.
- Limits by default: 25 tracks in the queue, 1 active request per viewer, and a 60 second cooldown per viewer.
- Searching by song title uses a lot of YouTube API quota, so title searches are capped at 50 per day (UTC). Direct links still work after the cap, and you can require links only.
- Your API key stays in Streamer.bot. It is never saved in StreamBridge settings, exports, overlay URLs or add-on state.
- Points are only spent once a track is found and accepted into the queue. Kick redemptions cannot be refunded automatically. A Twitch reward is fulfilled once the track joins the queue, so `!wrongsong` cannot reverse it.
- Playing a track does not give you the right to rebroadcast it. You are responsible for music licensing and platform rules.
