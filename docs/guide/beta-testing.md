# Beta testing guide

Thanks for testing THSV StreamBridge before its public release. This page says what to do, what to look out for, and how to tell us what happened. In a hurry? Read the one-page [Beta tester quick start](beta-quick-start.md).

## Before you start

- You need **Windows 10 or newer (64-bit)** and **Streamer.bot 1.0.7 or newer**, with your Twitch, YouTube or Kick accounts already connected in Streamer.bot. See [Install and first run](install-and-first-run.md).
- **Back up Streamer.bot first.** Close it, then copy its whole folder somewhere safe. StreamBridge adds its own actions and never removes yours, but a copy makes trying things stress-free.
- Read [Known limits](known-limits.md). It lists what StreamBridge cannot do, so you do not spend time on those.
- This is a beta. Do your first test on a private or unlisted stream, not on a big night.

## What to do

1. **Install** from the release ZIP and follow the [Quick start](quick-start.md) from top to bottom, without skipping ahead. Note roughly how long it took and anywhere you got stuck or had to guess.
2. **Connect and import:** open the wizard, connect Streamer.bot, import the Streamer.bot package, approve the actions, add the chat and alert browser sources, and run the test alert.
3. **Private test stream** of about 15 minutes. Chat from a second account if you can, try a command, follow or redeem something, then end the stream normally.
4. **Stream as usual** at least twice with StreamBridge running. Turn on the features you would really use; you do not need to try everything.
5. **Report** with the Beta feedback form after the install and after each stream, even when everything worked. "No problems" is useful too.

If the wizard says something is missing right after a Streamer.bot import, wait a minute and check again. Streamer.bot saves imported actions to disk a little later. Closing Streamer.bot normally also saves them.

## Things worth checking

- Did the quick start match what you saw on screen?
- Do chat messages, emotes and alerts show on the overlays, on every platform you use?
- Did going live and ending the stream do what you expected (scenes, timers, outputs stopping)?
- Did anything appear on stream that you did not expect, or cover your camera, chat or gameplay?
- Was any wording in the wizard confusing?

## How to report

Open a new issue with the **Beta feedback** form: [Report beta feedback](https://github.com/surakage/THSV-StreamBridge/issues/new?template=beta_feedback.yml).

The easiest way is **Report a bug** at the top of the Setup Wizard: describe what happened, and it downloads the support file (with your keys and tokens removed) and opens this form already filled in. Drag the file into **Support bundle** and submit.

You can also make the support file yourself: in the wizard open **Diagnostics > Preview support bundle**, check what it contains, then download it and attach the file.

## Never share these

Never post your stream keys, recovery key, control token, webhook links or platform tokens, in issues, Discord or screenshots. If you post one by mistake, delete the post and replace that key or token on the platform.

## Stopping or removing StreamBridge

- To stop it, right-click the tray icon (the "V" near the clock) and choose **Stop Bridge**.
- To remove it, run **Uninstall THSV StreamBridge.cmd** (see [Updates, backups and recovery](updates-backups-and-recovery.md#uninstall-or-reinstall)). It keeps your settings in case you come back. Your Streamer.bot backup restores Streamer.bot exactly as it was.
