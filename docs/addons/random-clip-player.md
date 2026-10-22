# Random Clip Player

**Module:** `thsv.random-clip-player` · **Version:** `4.0.51` · **Built in (extension)**

Plays a random clip from the broadcaster's own Twitch clip library on a timer, using a creator-approved Streamer.bot action to fetch clips and resolve playable download URLs.

Random Clip Player plays random clips from your own Twitch clip library on your stream. It is made for scenes like Be Right Back, Starting Soon and Ending: clips start when you switch to one of those scenes and stop when you leave. Viewers see one clip at a time, with a short pause and fade between clips.

## What you need
- The Random Clip Player Streamer.bot import:
  - **THSV Addon - Random Clip Player - Get Clips** and **THSV Addon - Random Clip Player - Get Clip Download**: keep both triggerless and approve both for this add-on.
  - **THSV Addon - Random Clip Player - Enable** and **THSV Addon - Random Clip Player - Disable**: optional manual controls.
- A browser source for the clips. Copy the URL from the wizard (it uses the short `/overlay/clips` address). In OBS, keep hardware acceleration on and turn off **Shutdown source when not visible**.
- Scene changes from OBS, Meld or Streamlabs reaching StreamBridge (the normal Scene Changed relay).
- Clips on your Twitch channel.

## Set it up
1. In Streamer.bot, import the Random Clip Player package. Do not add triggers to Get Clips or Get Clip Download.
2. Open Setup Wizard > Extensions > Clip Engine > Random Clip Player. Under its approved Streamer.bot actions, approve **Get Clips** and **Get Clip Download**.
3. List the scenes that should play clips, one per line. The defaults `role:break` and `role:ending` use the Break and Ending scenes you picked under Add-ons > Scene roles. You can also type exact scene names, including any emoji or symbols.
4. List scenes where clips should play without sound (default `role:starting`, for a Starting scene that already has music).
5. Set the pause between clips (default 5 seconds), how many recent clips to fetch (default 20) and the clip length range (default 5 to 60 seconds).
6. Choose audio: muted or not, and volume.
7. Copy the clips overlay URL into a browser source on those scenes.
8. Save and restart StreamBridge. To test, switch to one of your clip scenes (you do not need to be live).
9. Optional: if you prefer manual control, attach Enable to your scene-active trigger and Disable to the scene-inactive trigger (or to a hotkey).

## Good to know
- Clips are shuffled so the same clip does not repeat until the pool is used up.
- Only clips from your own channel can be played, because Twitch only gives download links to the channel owner.
- By default the selected clip is downloaded to a small private cache first for smoother playback. Cached clips expire automatically (12 hours, 40 MB per clip by default).
- With **Stop after leaving those scenes** on (default), switching to any other scene stops the rotation cleanly.
- When Raid Scout plays a raid clip, Random Clip Player fades out and pauses, then resumes afterward.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Clip Engine** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Random Clip Player`

- `THSV Addon - Random Clip Player - Get Clips` in `THSV Addon - Random Clip Player`
- `THSV Addon - Random Clip Player - Get Clip Download` in `THSV Addon - Random Clip Player`
- `THSV Addon - Random Clip Player - Enable` in `THSV Addon - Random Clip Player`
- `THSV Addon - Random Clip Player - Disable` in `THSV Addon - Random Clip Player`

Get Clips and Get Clip Download are broker-dispatched only and must not receive triggers. Enable and Disable are intentionally creator-triggered scene controls.

Creator-selected triggers:

- **enable:** Attach the streaming host's scene-active trigger for the scene that should play clips.
- **disable:** Attach the same scene's scene-inactive trigger, or the next scene's scene-active trigger.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.random-clip-player` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Exact broadcast-app scenes that play clips | Enter one exact OBS, Meld, or Streamlabs program-scene name per line, including any emoji, icon, bracketed text, or punctuation. Matching ignores capitalization only. role:break and role:ending use the scenes you chose under Add-ons > Scene roles. | `role:break`, `role:ending` |
| Scenes that play clips without sound | Clips on these scenes play muted, for scenes that already have music. role:starting uses your Starting scene from Add-ons > Scene roles. | `role:starting` |
| Stop after leaving those scenes | Recommended. Scene changes outside the automatic list stop clip rotation cleanly. | On |
| Pause between clips (seconds) | The complete pause from one clip ending until StreamBridge requests the next clip. The short fade happens during this pause; no hidden seconds are added. | 5 |
| Clips to fetch per refresh | How many of your most recent Twitch clips to pull into the rotation pool at once. | 20 |
| Minimum clip length (seconds) |  | 5 |
| Maximum clip length (seconds) |  | 60 |
| Mute clip audio | Disable clip audio. Leave this off to play the clip's original sound in OBS, Meld, or Streamlabs. | Off |
| Clip volume | Playback volume from 0 (silent) through 1 (full volume). | 1 |
| Prefetch clip video locally | Recommended. Fully downloads the selected Twitch clip before playback so OBS can play it smoothly from the private loopback cache. Cached video expires automatically and is never shared outside the overlay server. | On |
| Cache lifetime (hours) |  | 12 |
| Maximum cached clip size (MB) |  | 40 |

## Health checks

- **thsv.random-clip-player.runtime:** Confirms the add-on can request clips and receive Streamer.bot relay events.

## Data and permissions

Package kind: **executable**. Requested permissions: `streamerbot.run-approved-action`, `overlay.publish`, `media.exclusive`, `media.cache`, `schedule.bounded`, `state.private`, `events.subscribe`.

Private storage: `data/addons/thsv.random-clip-player/`, `data/addons/.state/thsv.random-clip-player/`.

Dependencies: none.

## Remove or repair

1. Remove the add-on package; its separately owned rotation state remains preserved.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
