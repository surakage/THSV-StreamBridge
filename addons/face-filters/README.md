# Face Filters

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
