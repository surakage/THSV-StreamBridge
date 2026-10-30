# Automated Shoutouts

**Module:** `thsv.automated-shoutouts` · **Version:** `4.0.64` · **Built in (extension)**

Sends bounded shoutouts and safety-screened once-per-day welcomes with platform-colored cards through StreamBridge's shared router.

Automated Shoutouts thanks raiders and welcomes viewers for you. It can shout out incoming Twitch raids, welcome a viewer the first time they chat each day, and give moderators a manual shoutout command. Messages go to chat on Twitch, YouTube, Kick or TikTok, and an optional platform-colored card (Twitch purple, YouTube red, Kick green, TikTok cyan/pink) can appear on stream. It never plays clips and never stores chat messages.

## What you need
- The Automated Shoutouts Streamer.bot package. Import it and approve, in the wizard's **Approve Streamer.bot actions** step:
  - **THSV Addon - Automated Shoutouts - Lookup Twitch Creator**: needed whenever Twitch triggers are on. It looks up the Twitch category.
  - **THSV Addon - Automated Shoutouts - Twitch Native Shoutout**: only if **Twitch shoutout mode** is `native` or `both`.
  - Do not attach any triggers to these actions. StreamBridge runs them for you.
- Optional browser source for the cards. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/shoutouts`).
- For TikTok chat output: in TikFinity's Chatbot settings, turn on **Allow Streamer.bot to push messages to TikFinity**.

## Set it up
1. Open the Setup Wizard and go to **Extensions > Community Messaging > Automated Shoutouts**. Enable it and review its permissions.
2. **Quick start**: choose which platforms it watches.
3. **Automatic shoutouts**: raid shoutouts are on by default (set a minimum raid size if you like). Daily welcomes are off by default. Before turning them on, set **Daily reset timezone** (for example `America/Chicago`) and review the safety section.
4. **Manual moderator command**: pick the command name (default `shoutout`). The `!so` alias is added for you. Do not create a matching command in Streamer.bot or Command Sync.
5. **Message destinations**: post replies back to the platform they came from (default), or to selected platforms. Choose the Twitch shoutout mode: `text`, `native` or `both`.
6. Edit the Twitch, YouTube, Kick and TikTok messages. You can add several welcome lines per platform and one is picked at random.
7. **Welcome safety and ignored users**: `Balanced` is the recommended level. Edit the spam phrases, blocked websites and ignored bots to fit your channel.
8. Save, then restart StreamBridge so the command registers.
9. Import the `.sb` file into Streamer.bot and approve the actions listed above.
10. Test it offline: add the browser source, then use **Open overlay & test** to send a preview. Simulated events only show the card. They never send chat or call Twitch.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!shoutout <name>` (or `!so <name>`) | Moderators and the broadcaster | Shouts out the named channel. On Twitch the category is checked first. On YouTube, Kick and TikTok it posts a channel link. |

## Good to know
- Twitch raid and creator shoutouts are sent only when Twitch returns a current category for that channel. YouTube, Kick and TikTok cannot look up a chatter's category, so their automatic messages are always plain welcomes.
- Each viewer gets at most one welcome per calendar day in your chosen timezone, even if you restart the stream. A stable platform user ID is required by default so name changes cannot get around this.
- Spam control: a global cooldown (default 30 seconds), a per-user cooldown (default 60 minutes), one shoutout per user per stream, and a queue of up to 20 that drops old entries (default after 10 minutes).
- Message tokens: `{displayName}`, `{user}`, `{platform}`, `{category}`, `{channelUrl}`, `{viewers}`, `{trigger}` and `{community}` (your community name from Settings, or your channel name). A misspelled token stays visible so you can spot it.
- Each shoutout is one message, trimmed to the platform limit (Twitch 500, YouTube 200, Kick 500, TikTok 150 characters). The channel link is always kept whole.
- The ignored-users list beats every trigger, including the manual command. Your own broadcaster and bot accounts are blocked from automatic shoutouts by default. Rules can be `username`, `platform:username` or `platform:id:user-id`.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Messaging** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Automated Shoutouts`

- `THSV Addon - Automated Shoutouts - Lookup Twitch Creator` in `THSV Addon - Automated Shoutouts`
- `THSV Addon - Automated Shoutouts - Twitch Native Shoutout` in `THSV Addon - Automated Shoutouts`

All actions are broker-dispatched only. Do not attach Streamer.bot triggers; the bridge capability broker restricts calls to creator-approved action IDs.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.automated-shoutouts` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable automated shoutouts |  | On |
| Trigger platforms | One per line: twitch, youtube, kick, or tiktok. | `twitch`, `youtube`, `kick`, `tiktok` |
| Shout out incoming Twitch raids |  | On |
| Minimum raid viewers |  | 1 |
| Welcome a viewer on their first safe message of the day | Runs at most once per stable platform account per calendar day after the welcome safety gate approves the message. | Off |
| Legacy inactivity reset | Accepted only so older saved settings remain compatible. Daily welcomes now reset by the configured timezone. | 12 |
| Who can receive an automatic welcome? | Safe all uses the safety gate. Allowlist only also requires a matching entry below. | `safe-all` |
| Optional first-chat allowlist | Used only in Allowlist only mode. One per line: username, platform:username, or platform:id:stable-user-id. | (none) |
| Daily reset timezone | IANA timezone such as America/Chicago. Invalid values safely fall back to UTC. | `UTC` |
| Welcome safety level | Balanced is recommended. Strict applies tighter message-shape limits. Open still blocks ignored accounts and explicit blocked terms/domains. | `balanced` |
| Safety delay before welcoming (seconds) | Provides a short review window and prevents instant overlay bursts. | 3 |
| Require a stable platform user ID | Recommended. Prevents display-name changes from bypassing the once-per-day gate. | On |
| Reject first messages containing links | Recommended for Balanced and Strict modes. Manual shoutouts are unaffected. | On |
| Spam phrases that block an automatic welcome | Preinstalled high-confidence promotion phrases. Edit, add, or remove one literal phrase per line. | `want to become famous`, `buy followers`, `buy viewers`, `cheap viewers`, `get more viewers at`, `promote your channel at`, `grow your channel fast`, `best viewers on` |
| Spam websites that block an automatic welcome | Preinstalled promotion domains. Enter hostnames only; edit, add, or remove them at any time. | `bigfollows.com`, `streamboo.com`, `bestviewers.com`, `viewers.shop` |
| Accept the manual shoutout command |  | On |
| Manual command name | Registered automatically through the main chat intakes after restart. The built-in alias is !so and only moderators or the broadcaster are authorized. | `shoutout` |
| Block my connected creator and bot accounts | Recommended. Automatic welcomes and raid shoutouts ignore broadcaster and bot identities detected from Streamer.bot, including learned aliases shared with TikFinity. Moderator-issued commands remain available. | On |
| Never shout out or welcome these users | Preloaded with common service bots. Your own broadcaster and bot accounts are blocked by the connected-account setting above. Same matching format as the allowlist; edit, add, or remove entries at any time. This list wins over every automatic or manual trigger. | `twitch:nightbot`, `twitch:streamelements`, `youtube:streamelements`, `kick:streamelements`, `twitch:fossabot`, `twitch:moobot`, `twitch:sery_bot`, `twitch:soundalerts`, `twitch:wizebot`, `twitch:kofistreambot`, `twitch:streamlabs`, `twitch:botrix`, `youtube:botrix`, `kick:botrix`, `tiktok:botrix`, `twitch:commanderroot`, `twitch:deepbot`, `twitch:phantombot`, `twitch:stay_hydrated_bot`, `twitch:coebot`, `twitch:pretzelrocks`, `twitch:streamavatars` |
| Where shoutout text is posted |  | `source` |
| Selected destination platforms | Used only when delivery mode is selected. One platform per line. | `twitch` |
| Twitch raid message | Sent only after Twitch returns a non-empty category. Tokens: {displayName}, {user}, {category}, {channelUrl}, {viewers}, {trigger}, {community}. | `Thank you {displayName} for the raid with {viewers} viewers! They stream {category}. Watch them at {channelUrl}` |
| Twitch creator first-chat message | Only allowlisted users with a confirmed Twitch category qualify. | `Go watch {displayName} streaming {category}: {channelUrl}` |
| Twitch viewer first-chat welcome | Used once per stream for an allowlisted Twitch first-time chatter when the verified lookup returns no current category. This is a welcome, not a streamer promotion. | `Welcome to the stream, {displayName}! Thanks for joining us on Twitch.` |
| Additional Twitch welcome messages | One message per line. A stable random choice is made for each approved daily arrival. {community} becomes your community name. | `Glad you made it, {displayName}! Welcome to the Twitch side of {community}.`, `Hey {displayName}! Settle in and enjoy the stream with us.`, `Someone new has arrived! Welcome in, {displayName}.` |
| YouTube first-chat welcome | A welcome only; Streamer.bot cannot verify an arbitrary YouTube chatter's current category. | `Welcome to the stream, {displayName}! Thanks for joining us on YouTube.` |
| Additional YouTube welcome messages |  | `Glad you found {community}, {displayName}! Welcome to the YouTube stream.`, `Hey {displayName}! Thanks for spending some time with us on YouTube.`, `Welcome in, {displayName}! Everyone in {community} is happy to have you here.` |
| Kick first-chat welcome | A welcome only; Streamer.bot exposes the connected Kick broadcaster, not an arbitrary chatter's category. | `Welcome to the stream, {displayName}! Thanks for joining us on Kick.` |
| Additional Kick welcome messages |  | `Glad you made it, {displayName}! Welcome to the Kick side of {community}.`, `Hey {displayName}! Pull up a seat and enjoy the Kick stream.`, `Someone new has arrived on Kick! Welcome, {displayName}.` |
| TikTok first-chat welcome | A welcome only; TikFinity does not provide a current channel category for the chatter. | `Welcome, {displayName}! Thanks for joining the TikTok live.` |
| Additional TikTok welcome messages |  | `Hey {displayName}! Welcome to {community} on TikTok LIVE.`, `Glad you found us, {displayName}! Enjoy the TikTok LIVE.`, `Welcome in, {displayName}! Thanks for joining {community}.` |
| Manual Twitch shoutout message | The target is still category-verified before this message is sent. | `Go watch {displayName} streaming {category}: {channelUrl}` |
| Manual YouTube, Kick, and TikTok shoutout | Moderator-selected channel link; no category claim is made. | `Go check out {displayName} at {channelUrl} and show them some love!` |
| Minimum time between shoutouts (seconds) |  | 30 |
| Per-user cooldown (minutes) |  | 60 |
| Shout out each user only once per stream |  | On |
| Maximum queued shoutouts |  | 10 |
| Drop queued shoutouts after (minutes) |  | 10 |
| Twitch shoutout mode | Native uses Streamer.bot's Twitch API action and its platform cooldowns. Both sends native plus editable text. | `text` |
| Show a platform-colored visual card | Uses Twitch purple, YouTube red, Kick green, or TikTok cyan/pink without playing clips. | On |
| Platforms allowed to show welcome cards |  | `twitch`, `youtube`, `kick`, `tiktok` |
| Show the visual card for | Choose which automated or manual paths may display a card. | `raid`, `first-chat`, `manual` |
| Legacy popup style (ignored) | Retained only so older saved settings migrate safely. Automated Shoutouts now always uses a profile or welcome card. | `profile-card` |
| Profile-card message | Tokens: {displayName}, {user}, {category}, {channelUrl}, {viewers}, {trigger}, and {community}. | `Go show {displayName} some love! They stream {category}. {channelUrl}` |
| Profile-card duration (seconds) |  | 10 |
| Legacy clip count (ignored) |  | 20 |
| Legacy clip age (ignored) |  | 90 |
| Legacy clip duration (ignored) |  | 30 |
| Legacy clip preference (ignored) |  | Off |
| Legacy clip mute setting (ignored) |  | On |
| Legacy clip volume (ignored) |  | 0.7 |
| Legacy clip fallback (ignored) |  | On |

## Health checks

- **thsv.automated-shoutouts.runtime:** Confirms shoutout event handling, bounded state, and broker access are healthy.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `overlay.publish`, `schedule.bounded`, `state.private`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.automated-shoutouts/`, `data/addons/.state/thsv.automated-shoutouts/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its private cooldown state remains preserved for a later reinstall.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
