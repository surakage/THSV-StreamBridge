# Soundboard

**Module:** `thsv.soundboard` · **Version:** `4.1.137` · **Built in (extension)**

Your own soundboard: buttons of sounds that play on stream from the Control Panel, a chat command or a channel point reward, in any streaming app.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.soundboard` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Soundboard |  | Off |
| Your sounds | One row per sound. Press Choose file to add an MP3, WAV or OGG file from this PC. A chat command and reward IDs are optional; every sound gets a button in the Control Panel. | (none) |
| Overall volume (%) | Multiplied with each sound's own volume. | 80 |
| Let sounds play over each other | Off: a new sound stops the one playing. | On |
| Most sounds at once |  | 3 |
| Cut sounds off after (seconds) | A safety limit so a long file never plays on and on. | 30 |
| Chats that can use the sound commands |  | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Who can play sounds by chat command | You and your moderators always can. Rewards always play, because the viewer paid for them. | `everyone` |
| Wait between any two chat sounds (seconds) |  | 3 |
| Wait per viewer (seconds) |  | 20 |
| Wait before the same sound again (seconds) |  | 0 |
| Cooldown reply (optional) | Leave empty to stay quiet. Placeholders: {viewer}, {sound}, {seconds}. | (blank) |
| Command that lists the sounds (optional) | For example sounds, so viewers type !sounds. Leave empty for none. | (blank) |
| Sound list reply | Placeholders: {viewer}, {sounds}. | `🔊 Sounds: {sounds}` |
| Moderator command that stops all sounds (optional) | For example stopsounds. Only you and your moderators can use it. | (blank) |

## Health checks

- **thsv.soundboard.runtime:** Checks sound matching for commands and rewards, cooldowns and who may play sounds.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.soundboard/`, `data/addons/.state/thsv.soundboard/`.

Dependencies: none.

## Remove or repair

1. Disable the extension and remove its browser source.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
