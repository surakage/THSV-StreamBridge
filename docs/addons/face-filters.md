# Face Filters

**Module:** `thsv.face-filters` · **Version:** `4.0.47` · **Built in (extension)**

Lets chat trigger Streamfog face lenses on your camera with commands or channel point rewards, one lens at a time with cooldowns and a short queue.

Face Filters lets your chat put [Streamfog](https://streamfog.com) face lenses on your camera. Viewers type a lens command (such as `!banana`), use the main command (`!filter sloth` or `!filter random`), or redeem a Twitch or Kick channel point reward. One lens shows at a time and extra requests wait in a short line. Each lens can optionally switch on a Voicemod voice too.

## What you need
- **Streamfog**, installed and signed in, and connected in Streamer.bot under **Integrations > StreamFog** (Remote Key, Auto Connect, Auto Reconnect).
- Your OBS face-camera source switched to the **Streamfog virtual camera** instead of your physical camera.
- The Face Filters Streamer.bot package. Import it, Save and Compile, leave every action without a trigger, and approve them in the wizard:
  - **THSV Extension - Face Filters - Activate Lens** and **THSV Extension - Face Filters - Deactivate Lens** (required)
  - **THSV Extension - Face Filters - Set Voice**, **Voice Off** and **Report Voice** (only if you use Voicemod voices)
- Optional: Twitch and/or Kick channel point rewards. Paste each reward ID into the wizard. In Streamer.bot, right-click the reward and choose **Copy Reward Id**.

## Set it up
1. Connect Streamfog in Streamer.bot and switch your OBS camera source to the Streamfog virtual camera.
2. Import the `.sb` file and approve the actions listed above.
3. Open the Setup Wizard and go to **Extensions > Community Play > Face Filters**.
4. **Lenses**: each row is one lens. Fill in its name, the lens name exactly as Streamfog shows it, an optional `!command`, optional Twitch and Kick reward IDs, how many seconds it stays on, and an optional Voicemod voice ID. Leave a box empty to skip it. Four starter lenses are included.
5. **Who can trigger lenses**: pick the chats that can use commands and who may use them (everyone by default).
6. **Timing and limits**: set the cooldowns, the pause between lenses and how many can wait in line.
7. **Chat replies**: edit or turn off the confirmation messages.
8. Tick **Enable Face Filters**, save and restart StreamBridge. Restart again whenever you change commands.
9. Test it offline: as the broadcaster or a moderator, type `!filter banana` (or use the wizard test) and check that the lens appears on camera and turns off when its time is up.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!filter` | Everyone (set in the wizard) | Lists the available lenses. |
| `!filter <lens>` | Everyone (set in the wizard) | Puts that lens on your camera. |
| `!filter random` | Everyone (set in the wizard) | Puts a random lens on. Can be turned off. |
| `!banana` (each lens's own command) | Everyone (set in the wizard) | Puts that lens on. |
| `!filter voice` | Moderators and the broadcaster | Replies with the ID of the voice selected in Voicemod, to paste into a lens row. |

## Good to know
- Defaults: 30 seconds per lens (5-600), a 2-second pause between lenses, up to 5 lenses waiting, a 20-second cooldown for everyone and 120 seconds per viewer.
- Twitch redemptions, moderators and you skip cooldowns but still wait in line. Kick rewards have no cooldown setting, so Kick redemptions follow the command cooldowns. A moderator refunds refused ones from the Kick reward queue.
- **Only while live** is on by default. Moderators and you can still test while offline.
- Streamfog has no "lens ended" signal, so StreamBridge runs **Deactivate Lens** when each lens's time is up.
- Voicemod is optional. If Voicemod is closed, the lens still shows without the voice.
- Reward IDs never change when you rename a reward, so renaming is safe.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Extension - Face Filters`

- `THSV Extension - Face Filters - Activate Lens` in `THSV Extension - Face Filters`
- `THSV Extension - Face Filters - Deactivate Lens` in `THSV Extension - Face Filters`
- `THSV Extension - Face Filters - Set Voice` in `THSV Extension - Face Filters`
- `THSV Extension - Face Filters - Voice Off` in `THSV Extension - Face Filters`
- `THSV Extension - Face Filters - Report Voice` in `THSV Extension - Face Filters`

All five actions must remain triggerless. StreamBridge supplies a one-use broker token with each request: a Streamfog lens name and a 5-600 second duration, or a Voicemod voice ID, and turns the lens and voice off again when the time is up.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.face-filters` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Face Filters | Requires Streamfog connected in Streamer.bot and your face camera in OBS switched to the Streamfog virtual camera. | Off |
| Lenses | Each row is one lens: its name, the exact Streamfog lens name, an optional chat command, optional Twitch and Kick channel point reward IDs, how many seconds it stays on, and an optional Voicemod voice ID. | `Banana \| Banana \| !banana \| \| \| 30 \|`, `Sloth \| Sloth \| !sloth \| \| \| 30 \|`, `Female \| Female \| !female \| \| \| 30 \|`, `Mystery \| Mystery \| !mystery \| \| \| 30 \|` |
| Main command | Viewers type !filter banana, or !filter random. !filter on its own lists the lenses. | `filter` |
| Allow !filter random |  | On |
| Chats that can use lens commands |  | `twitch`, `youtube`, `kick`, `tiktok` |
| Who can use lens commands |  | `viewer` |
| Default lens length (seconds) | Used when a lens line has no seconds column. | 30 |
| Pause between queued lenses (seconds) |  | 2 |
| Command cooldown for everyone (seconds) | Twitch channel point redemptions, moderators, and you skip cooldowns. Kick redemptions follow them because Kick rewards have no cooldown. | 20 |
| Command cooldown per viewer (seconds) |  | 120 |
| Lenses that can wait in line | Only one lens shows at a time. Set to 0 to refuse requests while a lens is on. | 5 |
| Only while live | Moderators and you can still test lenses while offline. | On |
| Reply in chat |  | On |
| Lens started message | Placeholders: {viewer}, {lens}, {seconds}. | `{viewer} put the {lens} filter on for {seconds}s!` |
| Lens queued message | Placeholders: {viewer}, {lens}, {position}. | `{viewer}, {lens} is queued (#{position}).` |
| Cooldown message | Placeholders: {viewer}, {seconds}. | `{viewer}, face filters are cooling down. Try again in {seconds}s.` |
| Lens list message | Placeholders: {list}, {command}, {random}. | `Face filters: {list}. Use !{command} <name>{random}.` |

## Health checks

- **thsv.face-filters.runtime:** Confirms bounded lens parsing, cooldowns, a single serialized lens queue, and approved Streamfog dispatch.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `chat.send`, `schedule.bounded`.

Private storage: `data/addons/thsv.face-filters/`, `data/addons/.state/thsv.face-filters/`.

Dependencies: none.

## Remove or repair

1. Disable the extension. Streamfog ends any active lens when its duration runs out.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
