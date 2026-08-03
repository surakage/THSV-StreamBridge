# Village Polls

Village Polls runs one shared poll across Twitch, YouTube, Kick, and TikTok using the existing normalized chat intakes. Streamer.bot supports native Twitch and YouTube polls, but those provider polls cannot accept Kick or TikTok votes. Village Polls therefore uses one universal command-based total for all four platforms instead of displaying conflicting provider totals.

## Simple setup

1. Turn on Village Polls in the wizard and keep the default `!`, `poll`, and `vote` settings for the easiest setup.
2. Keep platform chat triggers on the existing main THSV intake actions. Do not create separate poll triggers or generated commands in Streamer.bot.
3. Restart StreamBridge after saving the settings.
4. Add `/overlay/addons/thsv.village-polls` as one browser source if poll-result cards should appear on stream.

Moderator/broadcaster opens a poll with `!poll open Best game? | Game A | Game B`. The poll is announced in all four supported chats. Any viewer votes with `!vote 1`; their confirmation stays in the chat where they voted. Closing with `!poll close` announces the combined result to all four chats and displays it for 12 seconds on the one Village Polls overlay. A viewer may change their vote; only their latest choice counts. Raw account IDs are not stored—only installation-salted hashes.

The old Creator Utility counter is retired from new setup. Use **Custom Counter** for counters, persistent overlays, presets, event increments, and creator controls. Use **Village Draw** for giveaways.
