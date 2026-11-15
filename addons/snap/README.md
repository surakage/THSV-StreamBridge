# Snap

Snap is an instant photo on stream. When a viewer redeems a reward, an alert such as a raid arrives, or you press **Take a snap**, a little village camera drops onto your stream. The flash fires, OBS takes the picture, and the photo prints out of the camera, develops, and gets the viewer's message written along the bottom. Every snap is saved in your folder with the date and time as its name.

## What you need
- OBS Studio added under **Platforms > Scene connections**. Snap takes the picture through OBS.
- An OBS browser source: `http://127.0.0.1:8787/overlay/addons/thsv.snap`, 1920x1080 (1080x1920 on a vertical canvas), on top of the scenes where snaps should show.
- Viewer Foundation turned on, so points rewards bought in chat can be given back when no snap is taken.

## Set it up
1. Open Setup Wizard > Extensions > Snap.
2. Choose what the picture shows. **One OBS source** (your camera) is best: the picture shows just you, never the camera animation. Press **Refresh** to pick the source from OBS.
3. Name the rewards that take a snap (the exact title, such as `Snap`). If the reward asks the viewer for text, their message becomes the caption.
4. Pick any alerts that snap by themselves, such as raids, and their captions.
5. Pick a folder for the pictures, or leave it empty for `Pictures\StreamBridge Snaps`.
6. Turn on **Enable Snap**, save, add the browser source and press **Take a snap** in the Control Panel to try it.

## Platforms without channel points
On YouTube, TikTok and Facebook, make a points reward called `Snap` under **Viewer Points > Points rewards**. Viewers buy it in chat, for example `!snap hello from the village`, and the text after the command is the caption.

## Chat commands
| Command | Who can use it | What it does |
| --- | --- | --- |
| `!snap` | Moderators and you | Takes a snap. Text after it is the caption: `!snap best moment`. |
| `!snap pause` | Moderators and you | Puts the camera away. Rewards are given back until you resume. |
| `!snap resume` | Moderators and you | Takes the camera out again. |

## Control Panel and Stream Deck
The Control Panel tab has **Take a snap** (with an optional caption and name), **Pause snaps**, and the latest snaps.

For a Stream Deck button, make a Streamer.bot action that sends `!snap` to your chat from your own broadcaster account, and point the button at that action.

## Captions
- Captions are cut to 60 characters (you can pick 10 to 80).
- Links are always removed.
- If a message has one of your blocked words, the photo still prints but without the caption.
- The viewer's name and the date are written under the caption. You can turn either off.

## Cooldowns, the queue and scenes
- One snap plays at a time. Up to five more wait in line; when the line is full, the reward is given back.
- **Seconds between snaps** is for the whole channel, and **Seconds before the same viewer can snap again** is per viewer. You and your moderators skip both.
- **Put the camera away on these scenes** stops snaps on scenes such as BRB or Starting Soon.
- When a snap is not taken, the Twitch channel points or Viewer Points are given back. Kick rewards cannot be given back.

## Saving and Discord
- Pictures are named like `2026-11-15 20-06-12 - Sura.png`. Two snaps in the same second get `(2)` added; nothing is ever replaced.
- The overlay draws the finished photo, frame and caption included, and StreamBridge saves it. If the overlay was not open, the plain photo is saved instead.
- Optionally post every snap to one of your Discord webhooks.

## Privacy
Snap only takes a picture of the one source or scene you pick. Put the camera away on scenes where you step away from the desk.
