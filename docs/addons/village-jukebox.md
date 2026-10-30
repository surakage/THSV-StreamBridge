# Village Jukebox

**Module:** `thsv.village-jukebox` · **Version:** `4.0.62` · **Optional add-on**

Runs a bounded, fair, YouTube-first multi-platform song-request queue through one approved Streamer.bot resolver and the shared browser-overlay host.

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
4. Open Setup Wizard > Add-ons > Village Jukebox and approve Resolve YouTube Track (and Settle Twitch Reward if you use Twitch rewards).
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

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Village-Jukebox-4.0.62.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Village-Jukebox-4.0.62.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Village-Jukebox-4.0.62.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Village Jukebox`

- `THSV Addon - Village Jukebox - Resolve YouTube Track` in `THSV Addon - Village Jukebox`
- `THSV Addon - Village Jukebox - Settle Twitch Reward` in `THSV Addon - Village Jukebox`

Both actions are broker-dispatched only. Leave them triggerless. The YouTube API key belongs only in the resolver action's Set Argument.

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.village-jukebox` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

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
| Maximum track length (minutes) |  | 8 |
| Recently played no-repeat count |  | 20 |
| Unique votes required to skip |  | 5 |
| Pause between tracks (seconds) |  | 4 |
| Announce each track in its request platform |  | On |
| Player volume |  | 0.7 |
| Now Playing background |  | `#101820` |
| Now Playing accent |  | `#7ff5cc` |
| Now Playing text |  | `#ffffff` |
| Now Playing font |  | `broadcast` |

## Health checks

- **thsv.village-jukebox.runtime:** Confirms bounded resolution, fair persistent queueing, serialized media playback, and source-routed chat responses.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `streamerbot.run-approved-action`, `overlay.publish`, `media.exclusive`, `chat.send`, `schedule.bounded`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.village-jukebox/`, `data/addons/.state/thsv.village-jukebox/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstalling preserves the bounded queue, cooldowns, and recently played IDs for a later reinstall.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
