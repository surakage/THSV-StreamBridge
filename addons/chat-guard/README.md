# Chat Guard

Chat Guard watches public chat on Twitch, YouTube, Kick and TikTok for spam, blocked words and unwanted links. By default it only observes: matching messages are hidden from StreamBridge's own browser chat overlay and logged for you to review, but nobody is warned or moderated. If you choose, it can also warn, delete, time out or ban, but only after you turn on two separate safety switches. Viewers never see Chat Guard's reports, and chat text is never stored.

## What you need
- The Chat Guard Streamer.bot package. Import it. It adds two actions to the group **THSV Addon - Chat Guard**:
  - **THSV Addon - Chat Guard - Moderate**: leave it without a trigger. Approve it in the wizard only if you want automatic actions.
  - **THSV Addon - Chat Guard - Trust Viewer**: comes linked to a `!guardtrust` command object that starts disabled.
- Do not attach chat triggers to either action. Chat Guard reads chat through your main StreamBridge platform intake.
- Nothing else for observation only.

## Set it up
1. Open the Setup Wizard and go to **Extensions > Community Messaging > Chat Guard**.
2. **Safe beginner setup**: turn on **Turn on safe observation** and pick the chats to watch.
3. Optionally add words or website hostnames you always want flagged. Common hate, threat, hard-drug and promotion-spam terms are already filled in. Edit or remove any of them.
4. **Common spam checks**: the supplied limits for links, capitals, repeated characters, long messages and repeated messages are fine for a first test.
5. Save, restart StreamBridge, and import the `.sb` file into Streamer.bot.
6. Test it offline: paste a harmless sample into **Test current rules safely**. The tester never stores the text and never moderates anyone.
7. Use the moderation dashboard to review incidents and mark false positives. Observation only is a complete, valid setup. You can stop here.
8. Optional automatic actions: approve **Moderate**, turn on both **Allow Chat Guard to take automatic actions** and **Confirm that I want automatic moderation**, and choose **Warn** first. Only move to delete, timeout or ban after it has worked well live.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!guardtrust` | Broadcaster and moderators | Reply to a viewer's message with it to add that viewer to the trusted list. Without a reply, it trusts the person who typed it. |

## Good to know
- What each platform supports: Twitch can delete, time out and ban. YouTube can time out and ban. Kick can delete, time out and ban. TikTok can only receive a warning, plus the local overlay timeout.
- Repeat offenders: by default, after 3 matched messages within 10 minutes, the viewer is hidden from every THSV overlay for 10 minutes. Twitch, YouTube and Kick also get a real timeout when automatic actions are on.
- Safety limits: at most 5 automatic actions per minute and a 60-second cooldown per viewer by default. By default only blocked words and blocked websites can trigger an action. Other checks are reports only.
- The broadcaster, moderators and VIPs are exempt by default. Subscribers and members are not. Common service bots are on the ignored list already. For TikTok, add trusted viewers by stable ID in the wizard instead of `!guardtrust`.
- **Spam-bot phrases that get an instant ban** bans on the platforms you choose (Kick by default), whatever your everyday action is. It still needs both safety switches on. Use only phrases no real viewer would type.
- Privacy: chat text, names and account IDs are not stored. Incidents keep only scrambled IDs, time, platform and rule names, for 24 hours by default (up to 200 incidents).
