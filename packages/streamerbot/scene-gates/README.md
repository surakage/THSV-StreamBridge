# THSV StreamBridge - Scene Gates

Import the `.sb` file, Save and Compile **THSV Scene Gate - Apply** and **THSV Scene Gate - Check**, approve Apply for Scene Gates in the wizard, and leave both triggerless.

**Apply** turns Streamer.bot commands on or off with `CPH.EnableCommand`/`CPH.DisableCommand` and shows or hides Twitch rewards with `CPH.EnableReward`/`CPH.DisableReward` (hidden, not paused). It also sets the temporary global variables `thsvGate.<gateId>` (True or False) and `thsvGateMessage.<gateId>`. It checks the one-use StreamBridge broker token first, and StreamBridge sends only the gates that changed.

**Check** is for Kick rewards and commands, which Streamer.bot cannot turn off. At the very top of the Kick action add:

1. **Set Argument** `gateId` = the gate's name from the wizard (for example `hydrate`).
2. **Run Action** **THSV Scene Gate - Check**, with **Run Immediately** ticked.
3. **If/Else** `sceneGateAllowed` equals `False` -> **Break**.

On the wrong scene Check replies in the chat the trigger came from (Kick, Twitch or YouTube) and sets `sceneGateAllowed` to `False`. A gate that StreamBridge has not set yet counts as open. Kick channel points are not refunded automatically: reject the redemption from the Kick reward queue.
