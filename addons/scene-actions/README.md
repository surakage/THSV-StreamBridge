# Scene Actions

Scene Actions runs a Streamer.bot action of your choice when OBS Studio, Streamlabs Desktop or Meld Studio switches to a certain scene. For example, it can run your "Be Right Back" action whenever you go to your break scene. It reacts to scene changes; it never switches scenes by itself. Viewers only see whatever your chosen actions do.

## What you need
- The Scene Actions Streamer.bot import. It contains:
  - **THSV Scene Actions - Intake**: receives scene changes. The OBS Studio, Streamlabs Desktop and Meld Studio **Scene Changed** triggers are already included; do not add them again.
  - Starter actions **THSV Scene - Starting Soon**, **Just Chatting**, **Gameplay**, **Be Right Back**, **Ending Soon** and **BRB 180 Second Ad**. They do nothing until you add your own sub-actions. Leave them without triggers.
- Your scene roles set under Extensions > Scene roles, if you want to use the starter mappings.
- No overlay or rewards.

## Set it up
1. In Streamer.bot, import the Scene Actions package. If your Streamer.bot version asks for a Meld Studio scene value, choose it on the imported Meld trigger.
2. Fill the starter actions with what you want to happen (sub-actions such as sounds, filters or chat messages). You can rename them freely.
3. Open Setup Wizard and refresh the Streamer.bot action list.
4. Go to Extensions > Broadcast Director > Scene Actions and approve only the actions Scene Actions may run.
5. Choose which apps can trigger mappings (OBS, Streamlabs, Meld).
6. Edit the mappings. Each one links a scene to one action, with an optional delay. The starters use `role:starting`, `role:chatting`, `role:break` and `role:ending`, which follow the scenes you chose under Extensions > Scene roles. You can also pick a detected scene name or type one exactly. Map Gameplay to `role:live` if you want it.
7. Save the settings and action approvals, then restart StreamBridge.
8. Switch scenes in your streaming app to test. Streamer.bot's trigger Test button does not run your actions unless you turn on **Allow Streamer.bot trigger tests to run mapped actions**.

## Good to know
- OBS gives the wizard a full scene list. Streamlabs and Meld scene names are learned as you switch to them, and you can always type a name by hand.
- Scene names are not case-sensitive by default.
- Repeat copies of the same scene change within 1.5 seconds are ignored. At most 5 actions run in any 10-second window, to stop loops.
- Mappings point to the action's ID, so renaming an action does not break anything.
- The same scene picker and scene roles are used by Stream Launch Countdown, Random Clip Player and Raid Scout.
- Only scene names, connection labels and times are stored. No streaming-app passwords are kept.
