# Creator Controls

**Module:** `thsv.creator-controls` · **Version:** `4.0.52` · **Optional add-on**

Applies creator-authored Twitch, YouTube, and Kick channel profiles through one guarded shared Streamer.bot provider controller.

Creator Controls saves up to three stream setups ("profiles") and applies one in a single step. Each profile sets your stream title and category on Twitch, YouTube and/or Kick. You run a profile from a scene change, a hotkey or a deck button. Viewers only see the new title and category. There are no chat commands.

## What you need
- The Creator Controls Streamer.bot package. Import it and Save and Compile all four actions (group **THSV Addon - Creator Controls**):
  - **THSV Addon - Creator Controls - Provider Controller**: approve this one in the wizard and leave it without a trigger. It is the only action you approve.
  - **THSV Addon - Creator Controls - Apply Profile 1**, **Apply Profile 2** and **Apply Profile 3**: attach each to a trigger you control, such as a scene change, a hotkey, a deck button or a Scene Actions target.
- Twitch, YouTube and/or Kick connected in Streamer.bot. TikTok is not supported.

## Set it up
1. Import the `.sb` file into Streamer.bot and Save and Compile all four actions.
2. Open the Setup Wizard and go to **Add-ons > Creator Controls**. Turn on **Turn on Creator Controls**.
3. Edit the profiles you plan to use. They start as **Starting Soon**, **Gameplay** and **Just Chatting**, but the profile name is only a private label. For each one:
   - Tick the platforms it should change.
   - Type the stream title.
   - Optionally fill in categories: Twitch needs the numeric category ID, while YouTube and Kick use the category name. Leave a field blank to keep the current category.
4. In the **Approve Streamer.bot actions** step, approve only **Provider Controller**.
5. In Streamer.bot, connect **Apply Profile 1** to your Starting Soon scene (or a hotkey or deck button), **Apply Profile 2** to your Gameplay scene, and **Apply Profile 3** to your Just Chatting scene.
6. Restart StreamBridge if you just enabled the add-on.
7. Test it: turn on **Allow Streamer.bot Test buttons**, save, and use Streamer.bot's Test button on one Apply Profile action. Check that the title changed on each platform. Then turn Test buttons back off before going live.

## Good to know
- Only ticked platforms change. Blank category fields are skipped, and a profile with no title and no categories does nothing.
- Titles can be up to 100 characters.
- The YouTube broadcast ID is advanced. Leave it blank to update your latest monitored broadcast.
- If one platform fails, the others still update. The add-on keeps a short history of the last 20 results, with no credentials.
- It uses your existing Streamer.bot connection and does not accept public chat commands.
- Category Pilot can use these profiles to suggest or apply a setup when it sees a game running.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Creator-Controls-4.0.52.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Creator-Controls-4.0.52.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Creator-Controls-4.0.52.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Creator Controls`

- `THSV Addon - Creator Controls - Provider Controller` in `THSV Addon - Creator Controls`
- `THSV Addon - Creator Controls - Apply Profile 1` in `THSV Addon - Creator Controls`
- `THSV Addon - Creator Controls - Apply Profile 2` in `THSV Addon - Creator Controls`
- `THSV Addon - Creator Controls - Apply Profile 3` in `THSV Addon - Creator Controls`

Provider Controller must remain triggerless and requires a one-use broker token. Profile request actions only relay an exact profile ID; StreamBridge validates saved fields before dispatch.

Creator-selected triggers:

- **profiles:** Optional: attach Apply Profile 1/2/3 only to creator-controlled hotkeys, deck buttons, or approved Scene Actions targets.

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.creator-controls` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Turn on Creator Controls | When enabled, the three Apply Profile actions can request your saved channel setup. | Off |
| Allow Streamer.bot Test buttons | Turn this on only while testing. Turn it back off before a live stream. | Off |
| Use this profile | Makes Profile 1 available to its Streamer.bot action. | On |
| Profile name | A private label that helps you remember when to use it. | `Starting Soon` |
| Update these platforms | Only checked platforms are changed when this profile runs. | `twitch`, `youtube`, `kick` |
| Stream title | The title sent to every checked platform. | `Starting soon - welcome in!` |
| Twitch category ID | Optional numeric Twitch game/category ID. Leave blank to keep the current category. | (blank) |
| YouTube category | Optional category name. Leave blank to keep the current category. | `Gaming` |
| YouTube broadcast ID (advanced) | Usually leave blank to use the latest monitored broadcast. | (blank) |
| Kick category | Optional category name. Leave blank to keep the current category. | `Just Chatting` |
| Use this profile | Makes Profile 2 available to its Streamer.bot action. | On |
| Profile name | A private label that helps you remember when to use it. | `Gameplay` |
| Update these platforms | Only checked platforms are changed when this profile runs. | `twitch`, `youtube`, `kick` |
| Stream title | The title sent to every checked platform. | `Live gameplay with the community` |
| Twitch category ID | Optional numeric Twitch game/category ID. Leave blank to keep the current category. | (blank) |
| YouTube category | Optional category name. Leave blank to keep the current category. | `Gaming` |
| YouTube broadcast ID (advanced) | Usually leave blank to use the latest monitored broadcast. | (blank) |
| Kick category | Optional category name. Leave blank to keep the current category. | (blank) |
| Use this profile | Makes Profile 3 available to its Streamer.bot action. | On |
| Profile name | A private label that helps you remember when to use it. | `Just Chatting` |
| Update these platforms | Only checked platforms are changed when this profile runs. | `twitch`, `youtube`, `kick` |
| Stream title | The title sent to every checked platform. | `Hanging out with chat` |
| Twitch category ID | Optional numeric Twitch game/category ID. Leave blank to keep the current category. | `509658` |
| YouTube category | Optional category name. Leave blank to keep the current category. | `Entertainment` |
| YouTube broadcast ID (advanced) | Usually leave blank to use the latest monitored broadcast. | (blank) |
| Kick category | Optional category name. Leave blank to keep the current category. | `Just Chatting` |

## Health checks

- **thsv.creator-controls.runtime:** Confirms guarded creator profiles can use the shared provider controller.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`.

Private storage: `data/addons/thsv.creator-controls/`, `data/addons/.state/thsv.creator-controls/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its bounded last-result audit remains preserved for a later reinstall.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
