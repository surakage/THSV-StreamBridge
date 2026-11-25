# Random Sound

**Module:** `thsv.random-sound` · **Version:** `4.1.165` · **Built in (extension)**

Point it at a folder of sounds on this PC; each chat command, channel point reward or Control Panel press plays one of them at random.

Point it at a folder of sounds on your PC. Each time a viewer uses its chat command or channel point reward, or you press its button in the Control Panel, one sound from that folder plays at random. Sounds you drop into the folder later are picked up by themselves. You can add up to 20 folders, each with its own command, reward and volume.

Sounds play on one browser page that shows nothing, so Random Sound works the same in OBS, SprigCast, Streamlabs and Meld. It ships empty. No Streamer.bot import is needed.

## Set it up
1. Put your sounds in a folder, for example `C:\Users\You\Music\Funny sounds`. MP3, WAV, OGG, OPUS, FLAC, M4A and WEBM files up to 50 MB work. Only files directly in the folder are used, not ones in folders inside it.
2. Open Setup Wizard > Extensions > Community Play > Random Sound and press **Add folder**. Give it a name and paste the folder's full path (in File Explorer, click the address bar and copy it).
3. Optional: give the folder a **Chat command** (without the `!`), or paste a **Twitch reward ID** or **Kick reward ID**.
4. Add `http://127.0.0.1:8787/overlay/addons/thsv.random-sound` as a browser source in every scene where sounds should be heard (a small 320 x 120 source is enough; it draws nothing). Keep it running when hidden.
5. Turn on **Enable Random Sound** and restart StreamBridge. The Control Panel shows how many sounds each folder has, or what is wrong with a folder path.

## One page, one canvas
Add the sound page on **one canvas only**, usually your horizontal one, so each sound is heard once.

## SprigCast
SprigCast's web pages can't play MP3 or M4A files. Use WAV, OGG or OPUS sounds if SprigCast is your streaming app.

## How it behaves
- **Play every sound once before any repeats** (on by default) works like a shuffled deck: every sound in the folder plays once, then the deck is shuffled again. Off, any sound can come up, but never the same one twice in a row.
- A reward always plays. Chat commands have a cooldown for everyone and per viewer; you and your moderators skip them.
- **Let sounds play over each other** is off by default, so a new sound stops the one playing.
- Optional chat reply when a sound plays, using `{viewer}`, `{sound}` (the file name) and `{folder}`.
- StreamBridge only reads the list of sound files in the folders you name. It never changes, moves or deletes them, and the sound page can only play files from that list.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.random-sound` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Random Sound |  | Off |
| Sound folders | One row per folder. Each time it is triggered, one sound from that folder plays at random. Sounds you add to the folder later are picked up by themselves. | (none) |
| Play every sound once before any repeats | Off: any sound can come up again, but never twice in a row. | On |
| Overall volume (%) | Multiplied with each folder's own volume. | 80 |
| Let sounds play over each other | Off: a new sound stops the one playing. | Off |
| Most sounds at once |  | 3 |
| Cut sounds off after (seconds) | A safety limit so a long file never plays on and on. | 30 |
| Chats that can use the folder commands |  | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Who can play sounds by chat command | You and your moderators always can. Rewards always play, because the viewer paid for them. | `everyone` |
| Wait between any two chat sounds (seconds) |  | 5 |
| Wait per viewer (seconds) |  | 30 |
| Chat reply when a sound plays (optional) | Leave empty to stay quiet. Placeholders: {viewer}, {sound} (the file name), {folder}. | (blank) |
| Cooldown reply (optional) | Leave empty to stay quiet. Placeholders: {viewer}, {folder}, {seconds}. | (blank) |
| Moderator command that stops all sounds (optional) | For example stopsounds. Only you and your moderators can use it. | (blank) |

## Health checks

- **thsv.random-sound.runtime:** Checks folder matching for commands and rewards, fair random picks without repeats, and cooldowns.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `overlay.publish`, `audio.folder`.

Private storage: `data/addons/thsv.random-sound/`, `data/addons/.state/thsv.random-sound/`.

Dependencies: none.

## Remove or repair

1. Disable the extension and remove its browser source. Your sound folders are never changed.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
