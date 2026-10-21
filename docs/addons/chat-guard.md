# Chat Guard

**Module:** `thsv.chat-guard` · **Version:** `4.0.48` · **Built in (extension)**

Classifies normalized public chat, manages creator-approved trusted stable IDs, and optionally performs narrowly scoped, rate-limited moderation.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Messaging** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Chat Guard`

- `THSV Addon - Chat Guard - Moderate` in `THSV Addon - Chat Guard`
- `THSV Addon - Chat Guard - Trust Viewer` in `THSV Addon - Chat Guard`

Moderate must remain triggerless. It accepts only a one-use add-on relay token issued by StreamBridge.

Creator-selected triggers:

- **trustViewer:** Enable the imported !guardtrust command after reviewing it. Reply to a viewer's message with !guardtrust, or run it as the viewer being trusted. The action itself still requires broadcaster/moderator variables.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.chat-guard` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Turn on safe observation | Recommended first step. It flags matching public messages for review but cannot warn, delete, time out, or ban anyone. | Off |
| Allow Chat Guard to take automatic actions | Leave off while learning and testing. Observation continues when this is off. | Off |
| Confirm that I want automatic moderation | Required second safety switch. If it is off, Chat Guard remains observation-only. | Off |
| What should happen after a rule matches? |  | `observe` |
| Platforms where automatic actions are allowed | All selected platforms receive warnings and local overlay timeouts. Twitch, YouTube, and Kick also receive provider-native moderation where supported. | `twitch`, `youtube`, `kick`, `tiktok` |
| Rule matches allowed to cause an action | Safe default: only a word or website you explicitly blocked can act. Other enabled checks remain reports only. | `blocked-term`, `blocked-domain` |
| How many selected rules must match? | Keep at 1 for explicit blocked words or websites. Raise it only if you intentionally require multiple problems in one message. | 1 |
| Timeout duration (seconds) |  | 60 |
| Warning message |  | `Please keep chat safe and follow the channel rules.` |
| Maximum enforcement actions per minute |  | 5 |
| Per-viewer enforcement cooldown (seconds) | Prevents repeated actions against the same stable account during a message burst. | 60 |
| Timeout viewers who keep repeating matched offenses | After the configured number of matched offenses, suppress that account from THSV overlays on every platform and also request a provider-native timeout where supported. | On |
| Matched offenses before timeout |  | 3 |
| Repeat-offender window (seconds) |  | 600 |
| Repeat-offender timeout (seconds) |  | 600 |
| Advanced: count simulated messages in reports | Keep off for normal use. The rule tester works without this setting. | Off |
| Which chats should Chat Guard watch? | Select every public chat that enters through your main THSV platform intake actions. | `twitch`, `youtube`, `kick`, `tiktok` |
| Ignored platform accounts | Preloaded with common service bots. Name rules use platform\|name:login; stable-ID rules use platform\|stable-user-id. Prefer !guardtrust for people you trust. | `twitch\|name:nightbot`, `twitch\|name:streamelements`, `youtube\|name:streamelements`, `kick\|name:streamelements`, `twitch\|name:fossabot`, `twitch\|name:moobot`, `twitch\|name:sery_bot`, `twitch\|name:soundalerts`, `twitch\|name:wizebot`, `twitch\|name:kofistreambot`, `twitch\|name:streamlabs`, `twitch\|name:botrix`, `youtube\|name:botrix`, `kick\|name:botrix`, `tiktok\|name:botrix`, `twitch\|name:commanderroot`, `twitch\|name:deepbot`, `twitch\|name:phantombot`, `twitch\|name:stay_hydrated_bot`, `twitch\|name:coebot`, `twitch\|name:pretzelrocks`, `twitch\|name:streamavatars` |
| Exempt broadcaster |  | On |
| Exempt moderators |  | On |
| Exempt VIPs |  | On |
| Exempt subscribers and members |  | Off |
| Words or phrases you always want flagged | Preloaded with high-confidence hate, threat, sexual-exploitation, hard-drug, and promotion spam. Single words require a whole-word match; phrases use literal matching. Edit or remove any default. | `nigger`, `nigga`, `faggot`, `kike`, `wetback`, `tranny`, `chink`, `gook`, `spic`, `beaner`, `raghead`, `zipperhead`, `porch monkey`, `white power`, `heil hitler`, `gas the jews`, `kill yourself`, `go kill yourself`, `kys`, `rape you`, `dox you`, `swat you`, `child porn`, `crack`, `cocaine`, `crystal meth`, `meth`, `methamphetamine`, `heroin`, `fentanyl`, `oxycontin`, `oxycodone`, `mdma`, `ecstasy`, `molly`, `lsd`, `smoke weed`, `sell drugs`, `buy drugs`, `do drugs`, `want to become famous`, `buy followers`, `buy viewers`, `cheap viewers`, `get more viewers at`, `promote your channel at`, `grow your channel fast`, `best viewers on`, `bot liva`, `botliva`, `make your stream fire`, `ai-powered chatbot`, `chat stays active around the clock`, `!noads` |
| Spam-bot phrases that get an instant ban | Messages containing any of these are hidden from THSV chat and, when both automatic-action switches are on, the sender is banned on the platforms below - regardless of the everyday action above. Use only phrases no real viewer would type. Single words require a whole-word match; phrases use literal matching. | (none) |
| Platforms where spam-bot phrases ban the sender |  | `kick` |
| Websites you always want flagged | Preloaded with common promotion-spam hosts. Enter only the hostname, one per line; edit or remove any default. | `bigfollows.com`, `streamboo.com`, `bestviewers.com`, `viewers.shop` |
| Advanced: allow only these websites | Leave empty unless you want every other linked website flagged. Enter only hostnames. | (none) |
| Flag excessive links |  | On |
| Allowed links per message |  | 2 |
| Flag excessive capital letters |  | On |
| Minimum letters before caps rule |  | 12 |
| Capital-letter threshold (%) |  | 80 |
| Flag repeated characters |  | On |
| Allowed identical characters in a row |  | 8 |
| Flag long messages |  | On |
| Allowed message characters |  | 500 |
| Flag repeated messages |  | On |
| Repeat window (seconds) |  | 30 |
| Matching messages before flag |  | 3 |
| Maximum incidents retained |  | 200 |
| Retention window (hours) |  | 24 |
| Maximum repeat observations |  | 500 |

## Health checks

- **thsv.chat-guard.runtime:** Confirms bounded public-chat classification and fail-closed optional moderation dispatch are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.chat-guard/`, `data/addons/.state/thsv.chat-guard/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its private pseudonymous incident state remains preserved for a later reinstall or creator review.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
