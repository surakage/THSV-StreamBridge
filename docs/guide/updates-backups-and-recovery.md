# Updates, backups and recovery

## What it is

- **Updates** bring a newer StreamBridge or a newer add-on. The wizard checks, verifies and installs them only when you say so.
- **Backups** keep your settings safe. StreamBridge makes one every time you save.
- **Recovery bundles** are encrypted copies of all your StreamBridge data, for a new PC or a disaster.

## What you need

- The wizard open.
- For installing a StreamBridge update: every platform **offline**.

## Set it up: update StreamBridge

StreamBridge checks for new versions when Streamer.bot connects, and then at most every six hours. To check yourself:

1. Open **Overview** and find **Bridge updates**.
2. Select **Check for updates**.
3. If a version is available, read **View release notes**, then select **Download & prepare**. The wizard downloads the file and checks it before preparing it. Nothing stops yet.
4. When you are offline on every platform, select **Install verified update**.
5. StreamBridge stops, installs the new version, restarts and reopens the wizard. If the new version does not start properly, the old one is put back.
6. Go to **Streamer.bot > One Streamer.bot import**, make a new import with the same features, and import it in Streamer.bot (see [Streamer.bot import and approval](streamerbot-import-and-approval.md)).

Your settings, private data, logs, backups and add-on data are kept.

**"GitHub's hourly limit for update checks was reached."** GitHub allows a limited number of update checks per hour from your network, shared with other apps. Wait until the time shown, or download the newest release by hand from the [GitHub Releases page](https://github.com/surakage/THSV-StreamBridge/releases/latest) and run its installer.

You can also update by hand at any time: download the newer ZIP, extract it and run **Install THSV StreamBridge.cmd**.

## Set it up: update add-ons

1. Open **Add-ons** and select **Check official updates**.
2. For one add-on, select **Update safely**. For all of them, select **Update all compatible**.
3. Restart StreamBridge once at the end.
4. If the wizard says the add-on's Streamer.bot actions changed, make a new one import and import it again. StreamBridge never changes Streamer.bot by itself.

## Set it up: backups

Every **Save with backup** makes a local backup automatically.

- **Go back to an earlier setup:** on **Overview**, under **Safe configuration backup**, select **Load backups** and pick one from **Last-known-good local backups**. Restoring needs your approval and a restart while offline.
- **Keep a copy of your settings:** select **Download JSON**. This file holds platform switches, blockers, timed actions, chat overlay and alert settings, and your community name. It does **not** hold tokens, passwords, uploaded media or history. To load it again, select **Choose JSON file**, then **Stage import**, then save.
- **Keep your recovery key safe:** under **Wizard recovery key**, select **Download recovery key**. Never show it on stream.

## Set it up: recovery bundles

A recovery bundle is an encrypted copy of everything you set up, including settings, data, secrets and installed add-ons.

1. In the install folder, run **Create THSV Recovery Bundle.cmd**.
2. StreamBridge stops for a moment. Enter a passphrase of at least 12 characters, twice.
3. A `.thsv-recovery` file is saved in your Downloads folder and checked. Then StreamBridge restarts.

To restore: install the same or newer StreamBridge, run **Restore THSV Recovery Bundle.cmd**, enter the passphrase and the bundle path, and type `RESTORE` to confirm.

**If you lose the passphrase, the bundle cannot be opened.** Keep the bundle and the passphrase in different places.

**Moving to a new PC?** Use **Move THSV StreamBridge to Another Computer.cmd** instead. It leaves out passwords and tokens. On the new PC, run **Restore THSV Move Bundle.cmd**, then re-enter your connection passwords and test them.

## Check it works

1. After an update, **Check for updates** says "You are up to date".
2. On **Diagnostics**, select **Run pre-stream check**.
3. After a restore, open the wizard and check your platforms and overlays.

## Common problems

- **Install verified update is refused.** A platform is still live. End the stream first.
- **"Update check unavailable".** You may be offline, or GitHub's hourly limit was reached. Try later or update by hand.
- **Features stopped working after an update.** Make and import a new one Streamer.bot import, then restart StreamBridge.
- **Windows says a file is in use during an update.** Close File Explorer windows in the install folder and run the installer again.

For depth, read [Encrypted recovery bundles](../recovery-bundles.md), [Portable Windows release](../release.md) and [Getting started: update](../getting-started.md#update).
