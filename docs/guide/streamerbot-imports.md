# Where to find the Streamer.bot imports

## What it is

StreamBridge needs a set of THSV actions inside Streamer.bot. They come as `.sb` import files. There are two places to get them:

- **The normal way: one combined import.** The Setup Wizard builds **one** `.sb` file that holds exactly the features you picked. This is what almost everyone should use, for a first setup and after every update.
- **The recovery way: the single files.** Every feature also has its own `.sb` file in the installed StreamBridge folder. You only need these if support asks you to, or the wizard cannot build the combined file.

This page shows where both are, how to import them in Streamer.bot, and what to do afterwards. For approving actions, see [Streamer.bot import and approval](streamerbot-import-and-approval.md).

## What you need

- StreamBridge installed and the wizard open ([Install and first run](install-and-first-run.md)).
- Streamer.bot 1.0.7 or newer, open, with its WebSocket server running. The wizard shows the exact minimum version under **One Streamer.bot import** ("Ready for Streamer.bot ... or newer").
- The features you want turned on (**Extensions** page).

## Set it up: the one combined import (normal way)

### 1. Build the file in the wizard

1. In the wizard, open **Streamer.bot** and scroll down to the card **One Streamer.bot import**.
2. Look at the three lists:
   - **Always included**: the connection, receiver, platform intake and launcher actions. These are ticked and greyed out, because StreamBridge always needs them. This part includes the Twitch, YouTube and Kick intake and the TikTok (TikFinity) intake.
   - **Included features**: the built-in extensions. Only tick what you plan to use.
   - **Integrations**: built-in integrations such as Ko-fi. They can be ticked once the integration is turned on.
3. Select **Select enabled features** to tick everything you have turned on. Or select **Clear optional selections** and tick features by hand. The line next to the buttons shows how many packages and actions you picked.
4. Select **Create & download one import**.
5. Your browser downloads one file called `THSV-StreamBridge-Universal-Setup-<version>.sb` (for example `THSV-StreamBridge-Universal-Setup-4.1.5.sb`). It goes to your browser's normal download folder, usually **Downloads**. The wizard shows "Downloaded ... : N actions" when it is done.

The file is built on your own PC from the checked files in your StreamBridge install. It keeps the same action IDs every time, so importing a newer one upgrades your actions instead of making copies.

### 2. Import it in Streamer.bot

1. In Streamer.bot, select **Import** in the top toolbar.
2. Drag the `.sb` file onto the import window. You can also open the file in Notepad, copy all of its text and paste it into the import box. The file is plain text, so both ways work.
3. Streamer.bot lists the actions it is about to add. If it says some already exist (for example after an update), choose to **overwrite** them. Do not import them as extra copies.
4. Streamer.bot warns that the import contains custom C# code. Accept only for a file you made in the wizard or that came from the official StreamBridge release.
5. Select **Import**. The actions appear in groups whose names start with `THSV`.
6. Let Streamer.bot save (closing it normally also saves).

### 3. Verify in the wizard

1. Back on the wizard's **Streamer.bot** page, select **I finished importing — verify now**.
2. You want the green message **Import, triggers, and add-on approvals are ready**.
3. If it says something is missing, disabled or duplicated, see [Common problems](#common-problems) below.

## Where the single `.sb` files are (recovery only)

Use these only for repair or when support asks. A normal setup imports the one combined file instead, so you do not end up with a mix of versions.

### In your installed StreamBridge folder

StreamBridge installs to `%LOCALAPPDATA%\THSV StreamBridge`. Each version lives in its own folder under `app`. The single imports are here:

```text
%LOCALAPPDATA%\THSV StreamBridge\app\<version>\packages\streamerbot\<package>\THSV-StreamBridge-<Name>-<version>.sb
```

For example:

```text
...\app\4.0.48\packages\streamerbot\native-platform-intake\THSV-StreamBridge-Native-Platform-Intake-4.1.5.sb
...\app\4.0.48\packages\streamerbot\tikfinity-intake\THSV-StreamBridge-TikFinity-Intake-4.1.5.sb
```

To get there quickly:

1. In the wizard, open **Streamer.bot**.
2. Under **Safe Streamer.bot launcher**, select **Open installed folder**. (The **Installed StreamBridge folder** box above it shows the same path.)
3. Open `app`, then the folder with your current version number, then `packages\streamerbot`.

You can also paste `%LOCALAPPDATA%\THSV StreamBridge` into the Windows File Explorer address bar.

Every package folder holds its `.sb` file, a `manifest.json` (what the package contains and which triggers it needs) and usually a `README.md`. Only one `.sb` per folder is current; it has the same version number as your StreamBridge.

The folders you are most likely to need:

| Folder | What it installs in Streamer.bot |
| --- | --- |
| `core-receiver` | `THSV StreamBridge - Receive Event`, the action StreamBridge calls for every event |
| `native-platform-intake` | `THSV Twitch - Intake`, `THSV YouTube - Intake`, `THSV Kick - Intake`, with their platform triggers |
| `tikfinity-intake` | `THSV TikTok - Chat`, `Follow`, `Gift`, `Like` and `Subscription` |
| `multi-chat`, `multi-commands`, `multi-alerts` | The chat, command and alert steps that run after the receiver |
| `bridge-launcher` | Launch Bridge (starts StreamBridge with Streamer.bot), Shutdown Bridge, Check Connections, Monitor Connections |
| `wizard-launcher` | `THSV StreamBridge - Open Setup Wizard` |
| `reward-administration` | The action that fulfils or refunds Twitch redemptions |
| `timed-message-output` | The action that sends timed chat messages |

Feature packages (for example `streamer-punishments` or `face-filters`) are in the same place. Every feature ships with StreamBridge, so all of them are there.

`INSTALL.txt` tells you to use the wizard's combined import. The single `.sb` in the ZIP is a recovery copy only.

### After an add-on update

If an add-on update changes its Streamer.bot actions, the wizard says so in its message, for example "Re-import ... from ... in Streamer.bot so its actions match this add-on." The message names the folder that holds the checked copy; in a normal install it is `addons\packages\inbox\streamerbot\<add-on>\<version>` inside your StreamBridge folder. The simplest fix is still to build a new combined import that includes the add-on and import that.

## The import index and checksums

`packages\streamerbot\import-index.json` (next to the package folders) is the list of every official import in this version. For each package it records:

- the folder and the feature it belongs to (`moduleId`);
- whether it is **core** (always included), an **extension** (built in) or an **addon** (optional);
- the minimum Streamer.bot version (currently 1.0.7);
- the exact `.sb` file name, its size in bytes and its **SHA-256** checksum.

The wizard reads this list to build the **One Streamer.bot import** card. When the release is built, any `.sb` whose size or checksum does not match the index stops the build, and the installer checks every copied file. You do not need to check anything by hand for a normal setup.

If you want to check a single file yourself (for example a recovery copy):

1. Open PowerShell in the folder with the file.
2. Run `Get-FileHash -Algorithm SHA256 .\THSV-StreamBridge-<Name>-<version>.sb`.
3. Compare the result with the `sha256` value for that file in `import-index.json`, or with the matching `.sha256` file in an add-on ZIP. They must be identical.

The combined file the wizard downloads is made on your PC, so it has no published checksum. It is built only from the checked files above.

To check the whole StreamBridge download, see [Release verification](../../RELEASE-VERIFICATION.md).

## After importing

### Triggers that come included

The import already puts these triggers on the right actions. **Do not add them again by hand**, or events arrive twice:

- **Twitch** (on `THSV Twitch - Intake`): Chat Message, Follow, Cheer, Subscription and Resubscription, Gift Subscription, Gift Bomb, Raid, Reward Redemption, Stream Online, Stream Offline.
- **YouTube** (on `THSV YouTube - Intake`): Message, Super Chat, Super Sticker, Jewels Gifted, New Subscriber, New Sponsor, Member Milestone, Membership Gift, Broadcast Started, Broadcast Ended.
- **Kick** (on `THSV Kick - Intake`): Chat Message, Follow, Resubscription, Gift Subscription, Mass Gift Subscription, Kicks Gifted, Reward Redemption, Stream Online, Stream Offline.
- **Launch Bridge**: Streamer.bot Started, so StreamBridge starts when Streamer.bot starts.
- **Scene Actions** (if included): Scene Changed for OBS Studio, Streamlabs Desktop and Meld Studio.
- **Ad Break Companion** (if included): Twitch Upcoming Ad and Ad Run.

The exact list for your file is in the wizard: select **Review trigger contract** to open the **Recommended trigger checklist**.

### Triggers you add yourself (setup-dependent)

Some triggers depend on your own setup, so they cannot be in the file. The **Recommended trigger checklist** lists the ones for the features you picked. Common ones:

- a five-minute Streamer.bot Timed Action called **THSV StreamBridge Health** on **THSV StreamBridge - Monitor Connections** (optional connection warnings);
- **Streaming Started / Stopped** from your broadcast app for Live Beacon and Raid Scout;
- the **Ko-fi Donation** trigger for Ko-fi Donations;
- hotkeys, Stream Deck buttons, Voice Control, and scene-specific Random Clip Player triggers.

TikTok is different: you do not add Streamer.bot triggers for it. TikFinity calls the THSV TikTok actions directly. See [TikTok](platforms/tiktok.md).

Leave every other THSV action with no triggers. The receiver, the `Multi-*` actions and the administration actions only run when StreamBridge calls them.

### Approve actions

Some features need permission to run a Streamer.bot action (for example switching a scene). Open the feature's card, its **Streamer.bot** tab, then **Approve Streamer.bot actions**, and select **Approve recommended (N)**. Since 4.0.48 an approval works straight away, **with no restart**, even while you are live. The wizard only asks for a restart when the feature was just installed and is not running yet. Full steps: [Streamer.bot import and approval](streamerbot-import-and-approval.md#part-3-approve-actions-for-a-feature).

### Check the Setup checklist

Open **Setup checklist** (right under **Overview** in the wizard menu). For each feature you turned on it shows what is still missing: actions not imported yet, actions to approve, empty Twitch or Kick reward IDs, scene roles, a needed restart, and platforms that are not connected. Each item has a button to the exact place to fix it. Select **Check again** after you fix something.

## Re-importing after updates

Make a new combined import and import it again when:

- you installed a **StreamBridge update** (the update steps end with this; see [Updates, backups and recovery](updates-backups-and-recovery.md));
- the wizard says an **add-on update** changed its Streamer.bot actions;
- you turned on a new feature or installed a new add-on;
- **verify now** says "Re-import required" or "Managed actions are missing", or the **Setup checklist** says to import a feature's actions.

Steps: **Streamer.bot > One Streamer.bot import**, tick the same features, **Create & download one import**, import it in Streamer.bot with **overwrite** on, then **I finished importing — verify now**.

What overwriting keeps and what it replaces:

| Kept | Replaced (you may need to redo it) |
| --- | --- |
| The action IDs, so nothing is duplicated | Everything inside each THSV action, back to the official version. Any change you made inside a THSV action is lost. |
| Your approvals in StreamBridge (they are saved by action ID) | The trigger list of each THSV action. Included triggers come back exactly once; triggers you added yourself (the setup-dependent ones above) are removed. |
| All StreamBridge settings, points and feature data (they live in StreamBridge, not Streamer.bot) | |
| Your own non-THSV actions in Streamer.bot | |

So after a re-import, open **Review trigger contract** and put back only your setup-dependent triggers. Then select **verify now**.

## Check it works

1. **I finished importing — verify now** shows **Import, triggers, and add-on approvals are ready**.
2. On **Diagnostics**, select **Run pre-stream check**. The line **The current Streamer.bot package and trigger contract are verified** is ticked automatically.
3. Send a test chat message (or use a Streamer.bot test trigger). In Streamer.bot's **Action History**, the platform's intake action runs **once**, followed by `THSV StreamBridge - Receive Event`.

## Common problems

- **The download button is greyed out.** Nothing is ticked yet. Select **Select enabled features**.
- **"Import was not created: ... is an optional add-on."** Install that add-on on the **Extensions** page first, then build the import again.
- **"Universal import unavailable".** The package list in your install is missing or damaged. Repair or reinstall StreamBridge, or install the latest update.
- **Events arrive twice.** A platform trigger was added by hand as well as by the import. Select **verify now**; if it offers **Back up, repair, restart & verify**, save and close Streamer.bot first, then select it. StreamBridge backs up Streamer.bot's data before it changes anything.
- **"Managed actions are missing".** Repair will not invent missing actions. Build a new combined import and import it.
- **"Version verification blocked repair".** Your Streamer.bot version is not one StreamBridge has tested for automatic repair. Fix triggers by hand using the checklist, or update Streamer.bot.
- **Duplicate THSV groups or actions.** You imported a single recovery file and the combined file from different versions, or turned overwrite off. Delete the duplicates in Streamer.bot and import the current combined file once with overwrite on.
- **A C# action will not compile.** Open it in Streamer.bot and select **Save and Compile**. See [C# references](../streamerbot-csharp-references.md).
- **A feature says "Approve the ... action in the wizard first" right after approving.** Open **Setup checklist**: the action may not be imported yet, or a just-installed feature still needs one restart.

For depth, read [Streamer.bot setup](../streamerbot-setup.md) and the [Streamer.bot trigger matrix](../streamerbot-trigger-matrix.md).
