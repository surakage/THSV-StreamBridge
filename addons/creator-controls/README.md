# Creator Controls

Creator Controls saves up to three stream setups ("profiles") and applies one in a single step. Each profile sets your stream title and category on Twitch, YouTube and/or Kick. You run a profile from a scene change, a hotkey or a deck button. Viewers only see the new title and category. There are no chat commands.

## What you need
- The Creator Controls Streamer.bot package. Import it and Save and Compile all four actions (group **THSV Addon - Creator Controls**):
  - **THSV Addon - Creator Controls - Provider Controller**: approve this one in the wizard and leave it without a trigger. It is the only action you approve.
  - **THSV Addon - Creator Controls - Apply Profile 1**, **Apply Profile 2** and **Apply Profile 3**: attach each to a trigger you control, such as a scene change, a hotkey, a deck button or a Scene Actions target.
- Twitch, YouTube and/or Kick connected in Streamer.bot. TikTok is not supported.

## Set it up
1. Import the `.sb` file into Streamer.bot and Save and Compile all four actions.
2. Open the Setup Wizard and go to **Extensions > Creator Controls**. Turn on **Turn on Creator Controls**.
3. Edit the profiles you plan to use. They start as **Starting Soon**, **Gameplay** and **Just Chatting**, but the profile name is only a private label. For each one:
   - Tick the platforms it should change.
   - Type the stream title.
   - Optionally fill in categories: Twitch needs the numeric category ID, while YouTube and Kick use the category name. Leave a field blank to keep the current category.
4. In the **Approve Streamer.bot actions** step, approve only **Provider Controller**.
5. In Streamer.bot, connect **Apply Profile 1** to your Starting Soon scene (or a hotkey or deck button), **Apply Profile 2** to your Gameplay scene, and **Apply Profile 3** to your Just Chatting scene.
6. Restart StreamBridge if you just enabled the add-on.
7. Test it: turn on **Allow Streamer.bot Test buttons**, save, and use Streamer.bot's Test button on one Apply Profile action. Check that the title changed on each platform. Then turn Test buttons back off before going live.

## Stream info pop-out
The **Stream info** pop-out applies a profile right away, without a Streamer.bot trigger.
- Open it with **Open pop-out** under **Extensions > Creator Controls** (or Category Pilot), or **Open Stream info** in the tray menu. It unlocks the same way as the Setup Wizard.
- Pick a profile, change the title, the categories or the ticked platforms if you like, and press **Update all platforms**. Each platform shows **updated** or **failed**.
- Edits on the pop-out are used once and are not saved to the profile. Save lasting changes in the Wizard.
- It needs Streamer.bot connected, Creator Controls turned on, and Provider Controller approved. If one is missing, the pop-out says so instead of doing nothing.

## Good to know
- Only ticked platforms change. Blank category fields are skipped, and a profile with no title and no categories does nothing.
- Titles can be up to 100 characters.
- The YouTube broadcast ID is advanced. Leave it blank to update your latest monitored broadcast.
- If one platform fails, the others still update. The add-on keeps a short history of the last 20 results, with no credentials.
- It uses your existing Streamer.bot connection and does not accept public chat commands.
- Category Pilot can use these profiles to suggest or apply a setup when it sees a game running.
