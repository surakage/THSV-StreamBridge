# Streamer.bot import and action approval

## What it is

StreamBridge talks to your platforms through Streamer.bot. To do that, Streamer.bot needs some THSV actions. You get all of them from **one** import file that the wizard builds for you. It only contains the features you choose.

Some features also need to *run* a Streamer.bot action, for example switching a scene or turning on an OBS filter. StreamBridge only runs actions you have **approved** for that feature. This page covers both: the import and the approval.

## What you need

- StreamBridge installed and the wizard open ([Install and first run](install-and-first-run.md)).
- Streamer.bot open, with its WebSocket server running.
- The features you want already turned on (**Extensions** page) and any add-ons already installed (**Add-ons** page).

## Set it up

### Part 1: Make and import the one Streamer.bot import

1. In the wizard, open **Streamer.bot** and scroll to **One Streamer.bot import**.
2. Select **Select enabled features**. The list has three parts: **Always included** (required), **Included features** (built-in extensions) and **Installed optional add-ons**.
3. Untick anything you do not plan to use.
4. Select **Create & download one import**. One `.sb` file downloads.
5. In Streamer.bot, select **Import** on the top toolbar and drag the `.sb` file in.
6. If this is an update, keep overwriting on, so actions are updated and not duplicated.
7. Accept Streamer.bot's custom C# warning only for a file you made in the wizard or from the official release.
8. Back in the wizard, select **I finished importing — verify now**.

Make a new import every time you turn on a new feature, install an add-on or update StreamBridge. It is safe to do again.

### Part 2: Triggers

The import already contains the triggers that are the same for everyone. That includes the Twitch, YouTube and Kick intake triggers (chat, follows, subs, cheers, raids, reward redemptions, stream online/offline). **Do not add those again by hand**, or events will arrive twice.

1. Select **Review trigger contract** to open the **Recommended trigger checklist** for your exact import.
2. Add only the triggers it lists that depend on your setup. Examples: hotkeys or Stream Deck buttons, a Ko-fi donation trigger, or **Streamer.bot Started** on the Launch Bridge action.
3. Leave every other THSV action with no triggers.
4. For TikTok, the mapping is done in TikFinity instead. See [Platforms](platforms.md).

If **verify now** finds missing, disabled or duplicate triggers, it offers **Back up, repair, restart & verify**. Save and close Streamer.bot first. StreamBridge backs up Streamer.bot's data before it changes anything.

### Part 3: Approve actions for a feature

1. Open the feature's card. Built-in features are on **Extensions**, add-ons on **Add-ons**.
2. Open its **Streamer.bot** tab, then the **Approve Streamer.bot actions** step. (Features that never run an action do not have this step.)
3. StreamBridge checks Streamer.bot for the actions this feature needs. Under **Recommended for this add-on**, each action shows `found in Streamer.bot`, `not found` or `approved`.
4. Select **Approve recommended (N)** to approve all of the found actions in one click.
5. If an action is `not found`, import the feature first (Part 1). Or open **Choose an action manually**, pick the **Streamer.bot group**, pick the **Action**, then select **Add selected action** and **Save action grants**.
6. Confirm the prompt.
7. **No restart needed.** Approvals and removals take effect straight away, even while you are live. The wizard only asks for a restart when the feature was just installed and is not running yet.

If the action list looks empty, select **Refresh action names**, or select **Inspect actions** at the top of the **Streamer.bot** page.

StreamBridge saves the action's ID, not its name, so renaming an approved action in Streamer.bot does not break it. You can remove an approval with the **✕** next to it, then **Save action grants**.

## Check it works

1. Select **I finished importing — verify now**. You want **Import, triggers, and add-on approvals are ready**.
2. On **Diagnostics**, select **Run pre-stream check**.
3. Fire a harmless Streamer.bot test trigger. In Streamer.bot's **Action History** you should see the intake action run **once**.

## Common problems

- **Events arrive twice.** A platform trigger was added by hand as well as by the import. Run **verify now** and let it repair duplicates.
- **A feature says its action is missing.** Make a new import with that feature ticked and import it again.
- **I approved an action but nothing happens.** Open **Setup checklist** in the wizard. It shows whether the action is missing from Streamer.bot (import again) or the feature still needs a restart because it was just installed.
- **Restart is refused.** StreamBridge will not restart while any platform is live. Approvals do not need a restart, so you can still approve actions mid-stream.
- **"Restore exact add-on approvals" appears.** Select it to put back approvals that went missing. They apply straight away.
- **A C# action will not compile.** Open it in Streamer.bot, select **Save and Compile**, and see [C# references](../streamerbot-csharp-references.md).

For depth, read [Streamer.bot setup](../streamerbot-setup.md) and the [Streamer.bot trigger matrix](../streamerbot-trigger-matrix.md).
