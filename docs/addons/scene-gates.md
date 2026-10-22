# Scene Gates

**Module:** `thsv.scene-gates` · **Version:** `4.0.50` · **Built in (extension)**

Keeps chosen Streamer.bot commands and Twitch rewards usable only on the scenes you pick, with a chat-reply check for Kick, and turns everything back on when the stream ends.

Scene Gates makes your Streamer.bot commands and Twitch channel point rewards work only on the scenes you choose. For example, `!hydrate` can work only on your Just Chatting scene, or a "Sing a song" reward can appear only while you are on your Music scene. On any other scene the command is turned off in Streamer.bot and the Twitch reward is hidden (disabled, not paused). When the stream ends, everything is turned back on.

Kick rewards cannot be turned off by Streamer.bot, so Scene Gates also gives you a check you put at the top of a Kick action. On the wrong scene it replies in chat and stops the action.

## What you need
- The Scene Gates Streamer.bot import. It contains two actions in the **THSV Extension - Scene Gates** group. Leave both without triggers:
  - **THSV Scene Gate - Apply**: StreamBridge runs it to turn commands and Twitch rewards on or off. Approve it for Scene Gates.
  - **THSV Scene Gate - Check**: you run it from your own Kick actions (or any other action) to stop them on the wrong scene.
- Scene changes from OBS Studio, Streamlabs Desktop or Meld Studio reaching StreamBridge (the normal Scene Changed relay, as used by Scene Actions).
- Stream Online and Stream Offline from your platforms (the normal platform intake), so gates open again when you end the stream.
- Your scene roles set under Add-ons > Scene roles, if you want to use `role:live`, `role:chatting` and the other roles.
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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Broadcast Director** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Extension - Scene Gates`

- `THSV Scene Gate - Apply` in `THSV Extension - Scene Gates`
- `THSV Scene Gate - Check` in `THSV Extension - Scene Gates`

Apply must remain triggerless: StreamBridge supplies a one-use broker token and only the gate changes. Check also has no trigger of its own; your own Kick (or other) actions run it with Run Action.

Creator-selected triggers:

- **kick:** No triggers to add. For each Kick reward or command action you want to gate, add at the very top: Set Argument gateId (the gate name from the wizard), Run Action THSV Scene Gate - Check with Run Immediately ticked, then If/Else sceneGateAllowed equals False -> Break.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.scene-gates` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Scene Gates | Requires THSV Scene Gate - Apply approved for Scene Gates, and scene changes reaching StreamBridge. | Off |
| Gates | Each row is one gate: on or off, a name (Kick Check actions use it as gateId), the type, the Streamer.bot command or Twitch reward ID, the scenes where it may be used (separate with commas; role:starting, role:live, role:chatting, role:break and role:ending follow your Scene roles), and an optional wrong-scene message. | (none) |
| Only while live | Gates close only while you are live on at least one platform. Turn this off to test while offline. When every platform goes offline, everything is turned back on either way. | On |
| Wrong-scene message | Sent by THSV Scene Gate - Check when a gate is closed and the row has no message of its own. {scenes} becomes the allowed scenes and {name} the gate name. Leave blank to stop quietly. | `That only works during {scenes}.` |

## Health checks

- **thsv.scene-gates.runtime:** Confirms gates follow scene changes, send only changes to Streamer.bot, and open again when the stream ends.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.scene-gates/`, `data/addons/.state/thsv.scene-gates/`.

Dependencies: none.

## Remove or repair

1. Turn Scene Gates off and restart StreamBridge before removing it, so every gated command and reward is turned back on.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
