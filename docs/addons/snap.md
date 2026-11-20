# Snap

**Module:** `thsv.snap` · **Version:** `4.1.137` · **Built in (extension)**

An instant photo on stream. A reward, an alert or a button drops a camera onto the stream, the flash fires, and a photo of your camera prints out with the viewer's message on it. Every snap is saved in your folder with the date and time as its name.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.snap` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Snap |  | Off |
| Platforms it works on | Rewards and alerts from these platforms take snaps, and replies go to their chats. | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Rewards that take a snap | The exact reward titles. Twitch and Kick channel point rewards work, and so do points rewards in chat from Viewer Points on every platform. Ask viewers for text in the reward and it becomes the caption. | `Snap` |
| Caption when the viewer leaves no message | {name} is the viewer. | `Snapped by {name}` |
| Command for you and your moderators | Type !snap and a caption to take a snap from chat, or !snap pause and !snap resume. A Stream Deck button can send it through Streamer.bot from your own account. Do not include the ! prefix. | `snap` |
| Alerts that take a snap | These take a snap by themselves, with the caption below. | `raid` |
| Smallest raid that takes a snap | Raiders needed. | 1 |
| Fewest Bits that take a snap |  | 100 |
| Raid caption | {name} is the raider and {amount} the number of viewers. | `Raided by {name} with {amount} viewers!` |
| Follow caption |  | `Welcome, {name}!` |
| Sub caption |  | `Thank you for the sub, {name}!` |
| Gifted subs caption | {amount} is the number of subs. | `{name} gifted {amount} subs!` |
| Bits caption | {amount} is the number of Bits. | `{name} cheered {amount} Bits!` |
| Tip caption |  | `Thank you for the tip, {name}!` |
| Gift caption | TikTok and YouTube gifts. | `{name} sent a gift!` |
| What the picture shows | One source (such as your camera) keeps the snap animation out of its own picture. | `source` |
| OBS source or scene | The exact name in OBS. Press Refresh to pick it from the list. | (blank) |
| Folder for the pictures | A full folder path on this PC. Leave empty to use Pictures\StreamBridge Snaps. | (blank) |
| File name |  | `date-name` |
| Photo frame |  | `village` |
| Caption writing |  | `hand` |
| Longest caption | Characters. Longer messages are cut. | 60 |
| Write the caption on the photo |  | On |
| Write the name and date on the photo |  | On |
| Words that hide the caption | If a message has one of these, the photo still prints but without the caption. Links are always removed. | (none) |
| Seconds between snaps | For the whole channel. You and your moderators skip it. | 30 |
| Seconds before the same viewer can snap again |  | 300 |
| Snaps that can wait in line |  | 5 |
| Put the camera away on these scenes | No snaps while one of these scenes is live, such as BRB or Starting Soon. role:brb and the other roles follow Scene roles. | (none) |
| Give the reward back when no snap is taken | Twitch channel points and Viewer Points. Kick rewards cannot be given back. | On |
| Where the photo shows |  | `center` |
| Photo size |  | `medium` |
| Seconds the finished photo stays |  | 6 |
| Play the shutter and print sounds |  | On |
| Sound volume |  | 70 |
| Reply in chat when a snap cannot be taken |  | On |
| Cooldown reply | {name} and {seconds}. | `{name}, the camera needs {seconds} more seconds to cool down.` |
| Queue full reply |  | `{name}, the camera is busy right now. Try again in a moment.` |
| Camera put away reply |  | `{name}, the camera is put away right now.` |
| Post each snap to Discord | Optional. Pick one of your Discord webhooks. | (blank) |
| Discord message | {name}, {caption} and {platform}. | `📸 {name}: {caption}` |

## Health checks

- **thsv.snap.runtime:** Confirms rewards, alerts and the Control Panel take one snap at a time, cooldowns and paused scenes are respected, and skipped rewards are given back.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`, `media.snapshot`, `viewer.foundation.read`, `viewer.foundation.mutate`, `rewards.administer`.

Private storage: `data/addons/thsv.snap/`, `data/addons/.state/thsv.snap/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Disable the extension and remove its browser source. Your saved pictures stay in your folder.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
