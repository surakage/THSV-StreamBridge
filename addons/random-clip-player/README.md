# Random Clip Player

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
