# Soundboard

Your own soundboard. Add sounds from your PC, then play them on stream from the Control Panel, a chat command such as `!airhorn`, or a Twitch or Kick channel point reward. Sounds play on one browser page that shows nothing, so the Soundboard works the same in OBS, SprigCast, Streamlabs and Meld.

It ships empty. No Streamer.bot import is needed.

## Set it up
1. Open Setup Wizard > Extensions > Community Play > Soundboard.
2. Press **Add sound**, give it a name, press **Choose file** and pick an MP3, WAV or OGG file. Press **Test** to hear it. Set its volume (0 to 100).
3. Optional: give the sound a **Chat command** (without the `!`), or paste a **Twitch reward ID** or **Kick reward ID** (right-click the reward in Streamer.bot and choose Copy Reward Id).
4. Add `http://127.0.0.1:8787/overlay/addons/thsv.soundboard` as a browser source in every scene where sounds should be heard (a small 320 x 120 source is enough; it draws nothing). Keep it running when hidden.
5. Turn on **Enable Soundboard** and restart StreamBridge.

## One page, one canvas
Add the sound page on **one canvas only**, usually your horizontal one. If you also stream a vertical canvas, don't add a second copy there, or mute it, or every sound is heard twice.

## SprigCast
SprigCast's web pages can't play MP3 files. Use WAV or OGG sounds if SprigCast is your streaming app.

## How it behaves
- Every sound gets a button in the Control Panel, plus **Stop all sounds**.
- A reward always plays, because the viewer already paid. Chat commands have a cooldown for everyone, per viewer and (optionally) per sound. You and your moderators skip the cooldowns.
- **Who can play sounds by chat command**: everyone, subscribers (and members), VIPs, or moderators only.
- **Let sounds play over each other** is on by default, up to **Most sounds at once**. Turn it off and a new sound stops the one playing.
- **Cut sounds off after** stops a long file after that many seconds.
- Optional commands: a list command (for example `!sounds`) that replies with every sound command, and a moderator-only stop command.
