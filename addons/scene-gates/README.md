# Scene Gates

Scene Gates makes your Streamer.bot commands and Twitch channel point rewards work only on the scenes you choose. For example, `!hydrate` can work only on your Just Chatting scene, or a "Sing a song" reward can appear only while you are on your Music scene. On any other scene the command is turned off in Streamer.bot and the Twitch reward is hidden (disabled, not paused). When the stream ends, everything is turned back on.

Kick rewards cannot be turned off by Streamer.bot, so Scene Gates also gives you a check you put at the top of a Kick action. On the wrong scene it replies in chat and stops the action.

## What you need
- The Scene Gates Streamer.bot import. It contains two actions in the **THSV Extension - Scene Gates** group. Leave both without triggers:
  - **THSV Scene Gate - Apply**: StreamBridge runs it to turn commands and Twitch rewards on or off. Approve it for Scene Gates.
  - **THSV Scene Gate - Check**: you run it from your own Kick actions (or any other action) to stop them on the wrong scene.
- Scene changes from OBS Studio, Streamlabs Desktop or Meld Studio reaching StreamBridge (the normal Scene Changed relay, as used by Scene Actions).
- Stream Online and Stream Offline from your platforms (the normal platform intake), so gates open again when you end the stream.
- Your scene roles set under Features > Scene roles, if you want to use `role:live`, `role:chatting` and the other roles.
- Commands and rewards that Streamer.bot owns. Twitch rewards must have been created by Streamer.bot (or another tool using Streamer.bot's Twitch connection) for Twitch to let it turn them on and off.

## Set it up
1. In Streamer.bot, import the Scene Gates package. Do not add triggers to its two actions.
2. Open Setup Wizard > Extensions > Broadcast Director > Scene Gates and approve **THSV Scene Gate - Apply**.
3. Click **Refresh Streamer.bot commands** under Gates, then click **Add gate** once per command or reward:
   - **On**: turn one gate off without deleting it.
   - **Name**: a short name, such as `Hydrate`. Kick checks use it as the `gateId` (written in lowercase with dashes, so `Sing Song` becomes `sing-song`).
   - **Type**: **Streamer.bot command**, **Twitch reward** or **Check only (Kick)**.
   - **Command or reward ID**: pick the command from the list (it fills in the command ID), or paste the Twitch reward ID (right-click the reward in Streamer.bot and choose **Copy Reward Id**). Leave it empty for Check only.
   - **Allowed scenes**: the scenes where it may be used, separated by commas. Use exact scene names, or `role:starting`, `role:live`, `role:chatting`, `role:break` and `role:ending` to follow your Scene roles.
   - **Wrong-scene message**: optional. Leave it empty to use the shared message (`That only works during {scenes}.`).
4. Turn on **Enable Scene Gates**, save, and restart StreamBridge.
5. For each Kick reward or command you want to gate, add a **Check only (Kick)** gate with its scenes, then open the Streamer.bot action that the Kick trigger runs and add these sub-actions at the very top, in this order:
   1. **Core > Arguments > Set Argument**: Variable Name `gateId`, Value the gate's name (for example `hydrate`).
   2. **Core > Actions > Run Action**: **THSV Scene Gate - Check**, with **Run Immediately** ticked.
   3. **Core > Logic > If/Else**: if `sceneGateAllowed` equals `False`, then **Break**.

   The same three steps work for Twitch, YouTube or any other trigger if you want a chat reply on the wrong scene as well.
6. To test while offline, turn off **Only while live**, switch scenes, and watch the command or reward turn off and on in Streamer.bot. Turn it back on afterwards.

## Chat commands
Scene Gates adds no chat commands of its own. It turns your existing Streamer.bot commands on and off. While a command is off, Streamer.bot ignores it, so viewers get no reply. Use a Check gate in that command's action instead if you would rather reply.

## Good to know
- Only changes are sent to Streamer.bot. A scene switch that does not open or close any gate sends nothing.
- Nesting scenes (the 🟠 scenes you picked under Scene roles) are ignored, the same as for every other feature. Switching to one keeps the gates of the scene you came from.
- With **Only while live** on (default), gates close only while you are live on at least one platform, using the scene you are on when you go live. When every platform goes offline, every gated command and reward is turned back on.
- If StreamBridge or Streamer.bot is closed when you switch scenes, StreamBridge tries again every 15 seconds and catches up after a restart.
- Each gate also sets a temporary Streamer.bot global variable, `thsvGate.<gateId>` (True or False), and `thsvGateMessage.<gateId>` with the reply text. They are not saved, so after Streamer.bot restarts the Check treats every gate as open until the next scene switch.
- Kick channel points cannot be refunded automatically. When the Check stops a Kick redemption, reject it yourself from the Kick reward queue so the viewer gets their points back. Leave **Redemption Skips Queue** off on those Kick rewards so they stay in the queue for that.
- Twitch rewards are hidden, not paused, so viewers cannot see them on the wrong scene. Rewards not created through Streamer.bot's Twitch connection cannot be changed; Streamer.bot logs a warning for those.
- Before removing Scene Gates, turn it off and restart StreamBridge once so every gate is turned back on.
