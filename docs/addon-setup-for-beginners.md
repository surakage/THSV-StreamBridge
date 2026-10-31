# Beginner setup: turning on extensions

Every StreamBridge feature is built in. Open **Extensions** for Broadcast Director, Clip Engine, Community Rewards, Community Messaging, Community Insights, Community Play, and Voice & Language, and turn on the groups you want. Nothing is downloaded or installed separately, and there are no `.thsv-addon` packages to choose. Features that used to be separate downloads (for example Subathon Timer, Village Draw, Prize Wheel or Stream Labels) now live inside these groups.

## Before turning one on

1. Finish the [complete setup guide](complete-setup-guide.md).
2. Confirm the wizard reports StreamBridge and Streamer.bot ready.
3. Test one platform intake and the core chat or alert preview.
4. Keep every platform offline while changing extensions or Streamer.bot packages.

## Turn on the extension

1. In the authenticated wizard, open **Extensions**.
2. Turn on the group that contains the feature.
3. Open the component, enter its settings, and save. Restart StreamBridge only when the wizard requests it.

## Add its Streamer.bot actions

1. Open **Streamer.bot → One Streamer.bot import** in the wizard.
2. Choose **Select enabled features**.
3. Confirm the newly enabled feature is selected alongside the other extension groups you use.
4. Choose **Create & download one import** and import that one `.sb` file into Streamer.bot.
5. Enable overwrite for matching THSV actions so stable IDs upgrade instead of creating duplicate groups.
6. Follow the generated **Recommended trigger checklist**. Leave receivers, controllers, and delivery helpers triggerless unless the checklist explicitly names a trigger.

## Test safely

1. Use the feature's wizard preview or harmless manual control first.
2. Confirm the expected overlay, message, or state change happens once.
3. Confirm no duplicate platform trigger is attached to both a main intake and an internal action.
4. Treat simulator and Streamer.bot Test results as offline evidence only. Financial, reward, moderation, raid, outbound-chat, voice, and scene mutations still need a controlled live acceptance test.

## Dependencies

- Viewer Foundation and Community Analytics are built in and have dedicated wizard pages.
- Clip Engine is built in; media features use its shared cache and playback ownership instead of opening another socket.
- Viewer Foundation remains the only shared points authority. Extensions spend or refund through it rather than creating another balance.
- All overlays share the existing StreamBridge browser transport.

If the wizard reports a missing dependency, enable the named built-in group. Do not create a replacement Streamer.bot action.

See the [generated package guides](addons/README.md) for exact settings, permissions, overlays, commands, and recovery behavior.
