# Streamer Punishments

This built-in StreamBridge extension lets viewers buy punishments. A **screen effect** turns on one of your OBS filters for a few seconds, for example a Color Correction filter that blacks out your game capture. An **exercise** such as 10 pushups goes on an owed list.

Twitch and Kick viewers use channel point rewards, matched by their stable reward ID. YouTube, Facebook and TikTok viewers type `!buy <name>` and pay with StreamBridge points, which are refunded when an effect cannot run.

Twitch rewards enforce their own per-stream limit and cooldown. Kick rewards have neither, so StreamBridge applies the exercise limit and cooldown and a per-effect cooldown (30 seconds by default) to Kick redemptions. Leave Redemption Skips Queue off on Kick rewards, so a blocked redemption stays in the Kick queue for you to reject.

Effects run one at a time. For an exercise, the overlay counts down a grace period; then StreamBridge switches to your safe scene (Just Chatting by default) so you can step away from a game you cannot pause. You or a moderator type `!done` and StreamBridge switches back. Exercises bought during Starting Soon, a break, or the ending wait for a normal scene. `!punishments` shows this month's reps and what is owed; monthly totals reset at your first stream in a new month.

Import the Streamer Punishments package, approve **Set Filter** and **Switch Scene**, and leave both triggerless.
