# Beta tester quick start

Thanks for testing THSV StreamBridge! This is the short version; the full [Beta testing guide](beta-testing.md) has more detail.

## 1. Before you install (5 minutes)

- Windows 10 or 11 (64-bit) and **Streamer.bot 1.0.7 or newer** with your Twitch, YouTube or Kick accounts connected in it.
- **Back up Streamer.bot:** close it and copy its whole folder somewhere safe.
- Do your first test on a **private or unlisted stream**, not a big night.

## 2. Install and set up (about 30 minutes)

Follow the [Quick start](quick-start.md) from top to bottom without skipping ahead. In short:

1. In Streamer.bot, turn on the **WebSocket Server** (`127.0.0.1`, port `8080`, Auto Start).
2. Unblock and extract the release ZIP, then run **Install THSV StreamBridge.cmd**.
3. The Setup Wizard opens. Open **Setup checklist** first: it lists exactly what is left, and each button goes straight to the place to fix it.
4. Turn on your platforms, import the one Streamer.bot file the wizard builds for you, and add the chat and alert browser sources to OBS, Meld or Streamlabs.
5. Run a test alert. When the checklist says everything is set up, you are ready.

Keep a rough note of how long it took and anywhere you got stuck or had to guess.

## 3. Test it on stream

1. **Private test stream** of about 15 minutes: chat from a second account if you can, try a command, follow or redeem something, then end the stream normally.
2. **Stream as usual** at least twice with StreamBridge running, using only the features you would really use.

## 4. Tell us how it went

Press **Report a bug** at the top of the Setup Wizard, after the install and after each stream, even when everything worked.

- Describe what happened and what you expected.
- Leave **Download the support file** ticked. StreamBridge removes your passwords, tokens, keys and webhook links from it for you.
- The beta feedback form opens on GitHub, already filled in. Drag the downloaded file into **Support bundle**, then press **Submit**.
- No GitHub account? Press **Copy report** and send the text and the file the way you were told when you joined the beta.

## Never share these

Stream keys, your recovery key, the control token, webhook links or platform tokens, anywhere (issues, Discord, screenshots). If one slips out, delete the post and replace that key or token on the platform.

## If something goes wrong

- Most "missing" items right after a Streamer.bot import fix themselves: wait a minute and press **Check again** on the Setup checklist.
- To stop StreamBridge, right-click the tray icon (the "V" near the clock) and choose **Stop Bridge**.
- More help: [Known limits](known-limits.md) and [Updates, backups and recovery](updates-backups-and-recovery.md).
