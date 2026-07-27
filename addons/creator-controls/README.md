# Creator Controls

Creator Controls applies one saved title/category profile to Twitch, YouTube, and/or Kick through the existing authenticated Streamer.bot connection. It does not open another socket, store credentials, or accept public chat commands.

Import the matching Streamer.bot package, approve only `THSV Addon - Creator Controls - Provider Controller`, configure the profiles in the wizard, and attach Profile 1/2/3 only to creator-controlled hotkeys, deck buttons, or Scene Actions targets. The controller must remain triggerless.

Twitch uses a numeric category ID, YouTube uses a category name and optional monitored broadcast ID, and Kick uses a category name. Empty fields are skipped. TikTok is not offered because no equivalent verified TikFinity channel metadata method is currently documented.
