# Village Jukebox

Village Jukebox is the THSV-native, YouTube-first song-request add-on. It accepts requests from the existing Twitch, YouTube, Kick, and TikTok intakes, resolves tracks through one creator-approved Streamer.bot action, persists a bounded fair queue, and plays through the shared browser-overlay host.

## Setup

1. Install and enable Viewer Foundation when any request platform charges points.
2. Import `THSV-StreamBridge-Village-Jukebox-4.0.3.sb` into Streamer.bot.
3. Open **THSV Addon - Village Jukebox - Resolve YouTube Track** and replace the `villageJukeboxYouTubeApiKey` Set Argument value with your private YouTube Data API key. Leave the action triggerless.
4. Approve **Resolve YouTube Track** and **Settle Twitch Reward** in the wizard. The reward helper is needed only for Twitch reward requests.
5. Choose the Jukebox command names in the wizard. They register automatically through the existing platform chat intakes after restart.
6. If rewards are enabled, create Streamer.bot-owned Twitch/Kick rewards that require text input and paste their exact IDs into the wizard.
7. Add `http://127.0.0.1:8787/overlay/addons/thsv.village-jukebox` as a visible browser source. A 640x460 source is recommended.
8. Review and accept the music-rights responsibility, save settings, restart StreamBridge, send an overlay preview, and then enable Village Jukebox.

The API key remains in Streamer.bot. It is never stored in StreamBridge settings, diagnostic exports, overlay URLs, or add-on state.

## Commands

- `!sr <YouTube link or title>` requests a track.
- `!songqueue` shows the current queue length and track. The distinct name avoids colliding with Viewer Lobby's `!queue` command.
- `!when` reports the viewer's queue position.
- `!wrongsong` removes the viewer's newest queued request.
- `!voteskip` records one vote per stable viewer account for the current track.
- `!skip` skips the current track for moderators and the broadcaster.

## Deliberate limits

- YouTube is the only playback provider in this release.
- Search and validation require the creator's YouTube Data API key.
- Song-title searches have a creator-configurable UTC daily cap because YouTube search is quota-expensive. Direct YouTube links remain available after that cap and can be required exclusively.
- Tracks are limited to ten minutes because the shared media-slot lease is deliberately bounded.
- Kick redemptions cannot currently be refunded automatically through Streamer.bot's documented API.
- `!wrongsong` refunds Viewer Foundation points when applicable. A Twitch reward is fulfilled when its validated track joins the queue, so removing that track later cannot reverse the already-fulfilled native redemption.
- Playing a track does not grant rebroadcast rights. Creators remain responsible for music licensing and platform rules.
