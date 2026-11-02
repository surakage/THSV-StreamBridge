# Scene Actions

**Module:** `thsv.scene-actions` · **Version:** `4.1.8` · **Built in (extension)**

Runs creator-approved Streamer.bot actions when OBS Studio, Streamlabs Desktop, or Meld Studio changes to a mapped scene.

Scene Actions runs a Streamer.bot action of your choice when OBS Studio, Streamlabs Desktop or Meld Studio switches to a certain scene. For example, it can run your "Be Right Back" action whenever you go to your break scene. It reacts to scene changes; it never switches scenes by itself. Viewers only see whatever your chosen actions do.

## What you need
- The Scene Actions Streamer.bot import. It contains:
  - **THSV Scene Actions - Intake**: receives scene changes. The OBS Studio, Streamlabs Desktop and Meld Studio **Scene Changed** triggers are already included; do not add them again.
  - Starter actions **THSV Scene - Starting Soon**, **Just Chatting**, **Gameplay**, **Be Right Back**, **Ending Soon** and **BRB 180 Second Ad**. They do nothing until you add your own sub-actions. Leave them without triggers.
- Your scene roles set under Features > Scene roles, if you want to use the starter mappings.
- No overlay or rewards.

## Set it up
1. In Streamer.bot, import the Scene Actions package. If your Streamer.bot version asks for a Meld Studio scene value, choose it on the imported Meld trigger.
2. Fill the starter actions with what you want to happen (sub-actions such as sounds, filters or chat messages). You can rename them freely.
3. Open Setup Wizard and refresh the Streamer.bot action list.
4. Go to Extensions > Broadcast Director > Scene Actions and approve only the actions Scene Actions may run.
5. Choose which apps can trigger mappings (OBS, Streamlabs, Meld).
6. Edit the mappings. Each one links a scene to one action, with an optional delay. The starters use `role:starting`, `role:chatting`, `role:break` and `role:ending`, which follow the scenes you chose under Features > Scene roles. You can also pick a detected scene name or type one exactly. Map Gameplay to `role:live` if you want it.
7. Save the settings and action approvals, then restart StreamBridge.
8. Switch scenes in your streaming app to test. Streamer.bot's trigger Test button does not run your actions unless you turn on **Allow Streamer.bot trigger tests to run mapped actions**.

## Good to know
- OBS gives the wizard a full scene list. Streamlabs and Meld scene names are learned as you switch to them, and you can always type a name by hand.
- Scene names are not case-sensitive by default.
- Repeat copies of the same scene change within 1.5 seconds are ignored. At most 5 actions run in any 10-second window, to stop loops.
- Mappings point to the action's ID, so renaming an action does not break anything.
- The same scene picker and scene roles are used by Stream Launch Countdown, Random Clip Player and Raid Scout.
- Only scene names, connection labels and times are stored. No streaming-app passwords are kept.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Broadcast Director** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Scene Actions`

- `THSV Scene Actions - Intake` in `THSV Addon - Scene Actions`
- `THSV Scene - Starting Soon` in `THSV Addon - Scene Actions`
- `THSV Scene - Just Chatting` in `THSV Addon - Scene Actions`
- `THSV Scene - Gameplay` in `THSV Addon - Scene Actions`
- `THSV Scene - Be Right Back` in `THSV Addon - Scene Actions`
- `THSV Scene - Ending Soon` in `THSV Addon - Scene Actions`
- `THSV Scene - BRB 180 Second Ad` in `THSV Addon - Scene Actions`

Only the Intake action receives scene-change triggers. Starter target actions have no triggers and must be dispatched through creator-approved stable-ID mappings.

Creator-selected triggers:

- Included in the import, do not add again: OBS Studio > Scene Changed, Streamlabs Desktop > Scene Changed and Meld Studio > Scene Changed (any connection, any scene) on THSV Scene Actions - Intake.
- If your Streamer.bot version requires a Meld Studio Scene value, choose it on the imported Meld Studio trigger.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.scene-actions` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Scene Actions |  | On |
| Scene providers |  | `obs`, `streamlabs`, `meld` |
| Scene mappings | Use the guided mapping editor. Each saved mapping binds one provider scene to one stable Streamer.bot action ID. A scene of role:starting, role:live, role:chatting, role:break or role:ending follows the scenes you chose under Features > Scene roles. | `{"id":"starting-soon","enabled":true,"provider":"obs","connectionName":"","sceneName":"role:starting","actionId":"68fa3646-8b6c-4ef0-bf96-19474de8b620","delaySeconds":0}`, `{"id":"just-chatting","enabled":true,"provider":"obs","connectionName":"","sceneName":"role:chatting","actionId":"93ff064c-dd73-44fd-9a7e-f0b9499e4760","delaySeconds":0}`, `{"id":"be-right-back","enabled":true,"provider":"obs","connectionName":"","sceneName":"role:break","actionId":"8b58b594-06c3-45e9-9fc1-f2655b02b92f","delaySeconds":0}`, `{"id":"ending-soon","enabled":true,"provider":"obs","connectionName":"","sceneName":"role:ending","actionId":"c7f5238b-33e1-4095-9dbe-06a331218c74","delaySeconds":0}` |
| Scene names are case-sensitive |  | Off |
| Duplicate suppression window (milliseconds) |  | 1500 |
| Loop-protection window (seconds) |  | 10 |
| Maximum actions in the loop window |  | 5 |
| Allow Streamer.bot trigger tests to run mapped actions | Keep this off while configuring. Turn it on only when you intentionally want Trigger Test events to execute mapped actions. | Off |

## Health checks

- **thsv.scene-actions.runtime:** Confirms normalized scene events can dispatch creator-approved actions without repeat loops.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.scene-actions/`, `data/addons/.state/thsv.scene-actions/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its private anti-loop state remains preserved for a later reinstall.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
