# Village Polls

Village Polls runs one shared poll across Twitch, YouTube, Kick, and TikTok using the existing normalized chat intakes. Native provider polls cannot accept votes from every supported platform, so Village Polls maintains one universal total rather than displaying conflicting results.

## Simple setup

1. Turn on Village Polls in the wizard and keep the default `!`, `poll`, and `vote` settings for the easiest setup.
2. Keep platform chat triggers on the existing main THSV intake actions. Do not create separate poll triggers or generated commands in Streamer.bot.
3. Restart StreamBridge after saving the settings.
4. Add `/overlay/addons/thsv.village-polls` as one browser source when the live poll should appear on stream.

Open a poll with `!poll open Best game? | Game A | Game B`. It is announced in all four supported chats and the compact Village Decision Board appears immediately. Viewers vote with `!vote 1`; their confirmation stays in their source chat. Vote bars refresh at most once per second, so a busy poll does not recreate the overlay or flood its WebSocket. The default two-minute timer closes automatically, or set it to `0` and close with `!poll close`.

The completed result highlights the winner or tied choices, announces the combined result, and dismisses itself after the configured duration. The default board is a 72%-opaque dark glass panel sized like a lower third rather than a full-screen graphic. The wizard controls compact/full layout, opacity, colors, percentages, totals, countdown, platform breakdown, transition, and result duration.

A viewer may change their vote; only their latest choice counts. Raw account IDs are not stored—only installation-salted hashes and the platform needed for an optional aggregate breakdown.

The old Creator Utility counter is retired. Use **Custom Counter** for counters and **Village Draw** for giveaways.
