# Face Filters

This built-in StreamBridge extension lets chat put [Streamfog](https://streamfog.com) face lenses on your camera. Viewers type a lens command (`!banana`), the main command (`!filter sloth`, `!filter random`), or redeem a Twitch or Kick channel point reward. Rewards match by their stable reward ID, so renaming a reward never breaks it.

Streamfog has no C# API and no "lens ended" trigger, so StreamBridge owns the queue: one lens at a time, each for a bounded number of seconds that Streamfog also enforces. Commands have global and per-viewer cooldowns; paid redemptions, moderators, and the broadcaster skip cooldowns but still wait in line.

Connect Streamfog in Streamer.bot (Integrations > StreamFog), switch your OBS face-camera source to the Streamfog virtual camera, import the Face Filters package, approve **Activate Lens** and **Deactivate Lens**, and leave both triggerless. Streamfog ignores the lens duration, so StreamBridge runs Deactivate Lens when each lens's time is up.
