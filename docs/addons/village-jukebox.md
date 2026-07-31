# Village Jukebox setup

Village Jukebox is a YouTube-first, multi-platform song-request queue. It reuses StreamBridge's existing platform intakes and overlay connection, validates every request before accepting it, and never stores the creator's YouTube API key in StreamBridge.

## Install

- Only play music and videos you are permitted to broadcast. Platform availability does not grant streaming rights.
- Install and enable Viewer Foundation if YouTube or TikTok viewers will spend bridge points.
- Create a restricted YouTube Data API v3 key for the resolver. Keep it private.
- Spotify playback is intentionally unsupported. Spotify's playback services are not used as a broadcast music source.

## Streamer.bot

1. Import `THSV-StreamBridge-Village-Jukebox-2.6.0.sb` from the add-on release ZIP.
2. Open `THSV Addon - Village Jukebox - Resolve YouTube Track`.
3. Replace the `villageJukeboxYouTubeApiKey` Set Argument placeholder with the private API key, then Save and Compile.
4. Leave Resolve YouTube Track and Settle Twitch Reward triggerless.
5. In the wizard, approve Resolve YouTube Track. Approve Settle Twitch Reward only if Twitch Channel Points requests are enabled.

The key stays inside Streamer.bot. Do not paste it into the wizard, logs, screenshots, exports, or support messages.

## 3. Create commands

Use Command Sync to add whichever commands you want:

| Command | Purpose | Default permission |
| --- | --- | --- |
| `!sr song or YouTube link` | Validate and request one track | Viewer |
| `!queue` | Show the current queue count | Viewer |
| `!when` | Show the viewer's next queue position | Viewer |
| `!wrongsong` | Remove the viewer's newest queued request | Viewer |
| `!voteskip` | Add one stable-viewer skip vote | Viewer |
| `!skip` | Stop the current track | Moderator |

Generate one command package, import it, review it, and enable the commands. Keep Twitch, YouTube, Kick, and TikTok chat/command triggers on their existing main THSV intake actions; do not add duplicate platform triggers to the jukebox helpers.

## 4. Optional rewards and points

- Twitch and Kick may use configured native reward IDs.
- Twitch can fulfill or refund a redemption through the imported settlement helper while it is pending validation. Once a valid track joins the queue, Twitch marks the reward fulfilled and `!wrongsong` cannot reverse that native redemption.
- Kick requests are accepted only from the verified native reward transport, but Kick does not provide the same refund workflow.
- YouTube and TikTok can spend Viewer Foundation points after YouTube metadata validation succeeds.
- A failed, unavailable, duplicate, recent, over-length, or unembeddable result spends no points.
- Song-title searches use a creator-configurable UTC daily allowance because YouTube search is quota-expensive. Direct YouTube links do not consume that allowance, and links-only mode is available.

## 5. Add the overlay

Add this browser source to OBS, Meld, or Streamlabs Desktop:

`http://127.0.0.1:8787/overlay/addons/thsv.village-jukebox`

Recommended starting size: **640 × 460**. The source uses the shared exclusive media slot, so it will not fight another THSV media add-on for playback.

## Offline test

1. Accept the music-rights responsibility, save the add-on settings, and restart StreamBridge.
2. Confirm Resolve YouTube Track appears as an approved action in the wizard.
3. Open the overlay URL in a browser or broadcasting-app browser source.
4. Use `!sr` with a short, public, embeddable YouTube video.
5. Confirm the lookup message, queue confirmation, now-playing card, full playback, and automatic advance.
6. Test `!wrongsong`, `!voteskip`, and moderator `!skip` before using the queue live.

The queue, recent-video bag, cooldowns, and request identities are bounded and restart-persisted. Video history, search results, API responses, and message content are not retained as an unbounded library.

## Data and permissions

- `events.subscribe` receives only declared normalized commands, rewards, lifecycle events, and the authenticated resolver result.
- `state.private` stores a bounded queue, recent YouTube IDs, cooldown timestamps, pending request metadata, and replay IDs.
- `streamerbot.run-approved-action` can call only the exact resolver and optional Twitch settlement actions approved by the creator.
- `viewer.foundation.read` and `viewer.foundation.mutate` check and spend or refund points without exposing Viewer Foundation's salt or raw account-link table.
- `overlay.publish`, `media.exclusive`, `chat.send`, and `schedule.bounded` reuse StreamBridge's shared overlay, media, output, and scheduling services.
- The YouTube API key remains a private Streamer.bot action argument and is never copied into add-on state or wizard configuration.
