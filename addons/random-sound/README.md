# Random Sound

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
