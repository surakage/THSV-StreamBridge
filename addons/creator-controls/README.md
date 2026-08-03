# Creator Controls

Creator Controls saves three simple stream setups and applies one setup at a time to Twitch, YouTube, and/or Kick through the existing authenticated Streamer.bot connection. It does not open another socket, store credentials, or accept public chat commands.

## Simple setup

1. Import the matching Streamer.bot package.
2. In the wizard, turn on Creator Controls and edit only the profiles you want.
3. Approve only `THSV Addon - Creator Controls - Provider Controller`. Leave it triggerless.
4. Connect `Apply Profile 1` to Starting Soon, `Apply Profile 2` to Gameplay, and `Apply Profile 3` to Just Chatting. Use scene triggers, hotkeys, or deck buttons.
5. Temporarily allow Test buttons, test one profile, then turn Test buttons back off before going live.

The profile name is only a private label. The stream title is what viewers see. Twitch uses a numeric category ID, while YouTube and Kick use category names. The YouTube broadcast ID is advanced and can normally stay blank. Every blank category field is skipped. TikTok is not offered because no equivalent verified TikFinity channel-metadata method is currently documented.
