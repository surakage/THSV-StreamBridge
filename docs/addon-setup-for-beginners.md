# Beginner setup: optional add-ons

Version 4 includes most frequently used features in StreamBridge itself. Open **Extensions** for Broadcast Director, Clip Engine, Community Rewards, Community Messaging, Community Insights, Community Play, and Voice & Language. Do not download those components separately.

Use this guide only for the 11 optional add-ons published beside the main 4.0 release:

- Accessibility Captions
- Category Pilot
- Creator Controls
- Free Game Check
- Prize Wheel
- Stream Labels
- Subathon Timer
- Viewer Lobby
- Village Draw
- Village Jukebox
- Village Polls

## Before installing one

1. Finish the [complete setup guide](complete-setup-guide.md).
2. Confirm the wizard reports StreamBridge and Streamer.bot ready.
3. Test one platform intake and the core chat or alert preview.
4. Keep every platform offline while changing installation or Streamer.bot packages.

## Install the add-on

1. Download the matching `THSV-StreamBridge-AddOn-<Name>-4.0.1.zip` from the same official release as the main application.
2. Extract the ZIP. Do not install directly from the ZIP preview.
3. In the authenticated wizard, open **Add-ons** and choose the `.thsv-addon` file.
4. Review its publisher, compatibility range, permissions, and dependencies.
5. Install it, enter its settings, enable it, and save. Restart StreamBridge only when the wizard requests it.

## Add its Streamer.bot actions

1. Open **Streamer.bot → One Streamer.bot import** in the wizard.
2. Choose **Select enabled features**.
3. Confirm the new optional add-on is selected alongside the extension groups you use.
4. Choose **Create & download one import** and import that one `.sb` file into Streamer.bot.
5. Enable overwrite for matching THSV actions so stable IDs upgrade instead of creating duplicate groups.
6. Follow the generated **Recommended trigger checklist**. Leave receivers, controllers, and delivery helpers triggerless unless the checklist explicitly names a trigger.

The individual `.sb` file inside an add-on bundle is a recovery option. Normal setup should use the wizard-generated combined import.

## Test safely

1. Use the add-on's wizard preview or harmless manual control first.
2. Confirm the expected overlay, message, or state change happens once.
3. Confirm no duplicate platform trigger is attached to both a main intake and an internal action.
4. Treat simulator and Streamer.bot Test results as offline evidence only. Financial, reward, moderation, raid, outbound-chat, voice, and scene mutations still need a controlled live acceptance test.

## Dependencies

- Viewer Foundation and Community Analytics are built in and have dedicated wizard pages.
- Clip Engine is built in; optional media features should use its shared cache and playback ownership instead of opening another socket.
- Viewer Foundation remains the only shared points authority. Optional add-ons spend or refund through it rather than creating another balance.
- All overlays share the existing StreamBridge browser transport.

If the wizard reports a missing dependency, enable the named built-in group or install the named optional add-on. Do not create a replacement Streamer.bot action.

See the [generated package guides](addons/README.md) for exact settings, permissions, overlays, commands, and recovery behavior.
