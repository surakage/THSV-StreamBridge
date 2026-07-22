# Automated Shoutouts add-on

Automated Shoutouts is an optional `.thsv-addon` that turns already-normalized StreamBridge events into bounded shoutout messages. It reuses the main bridge's event bus, one Streamer.bot WebSocket connection, outbound platform router, scheduler, private state, and hosted overlay. It does not open another socket or store chat messages.

## Supported triggers

| Trigger | Platforms | Source used | Safety rule |
|---|---|---|---|
| Incoming raid | Twitch | normalized `channel.raid`, then documented `TwitchGetExtendedUserInfoById/Login` | minimum viewer count; the message is sent only when Twitch returns a non-empty `Game` category |
| First chat of stream | Twitch | normalized `chat.message`, Streamer.bot's known `firstMessage` flag, then documented Twitch extended-user lookup | disabled by default and requires an explicit allowlist; category-confirmed creators get a promotion, while a verified no-category viewer is welcomed only when `firstMessage=true` (their first message ever in the channel) |
| First chat of stream | YouTube, Kick, TikTok | normalized `chat.message` | platform-specific welcome only; no unsupported category or streamer claim |
| Manual command | Twitch, YouTube, Kick, TikTok | normalized `command.received`; first command argument is the target | caller must carry normalized `moderator` or `broadcaster` role even if the creator misconfigures the Streamer.bot command |

Streamer.bot also exposes native First Words triggers for Twitch, YouTube, and Kick. Twitch's documented trigger uses a creator-configured cache reset (12 hours by default) unless a separate Stream Online action runs **Reset First Words**; Kick uses the same default cache model and a manual reset. Those triggers would require separate platform actions and still would not cover TikFinity. Native Platform Intake 1.5.1 instead preserves the documented Twitch `firstMessage` flag already supplied with chat data, so the no-category viewer welcome is limited to their first message ever and fails closed when that fact is missing. The add-on derives the broader per-stream first-chat gate from the shared normalized feed and resets its bounded seen-set on `stream.online`. For a TikTok-only setup without a reliable lifecycle event, the creator-set inactivity window (12 hours by default) is the explicit fallback. TikFinity documents ordinary chat events and user placeholders, but no dedicated first-words event in its Streamer.bot integration, so the add-on does not invent one.

## Documented platform variables and methods

The intake packages—not this add-on—translate provider variables into `event.user`, `event.payload`, and `event.source`. These are the source facts reviewed for this implementation:

| Provider | Useful documented inputs | Output used |
|---|---|---|
| Twitch / Streamer.bot | Raid `%viewers%`; Twitch user ID, login, display name, profile image; command `%command%`, `%commandName%`, `%commandSource%`, `%input#%`, `%rawInput%`; extended user `Game` and `ProfileImageUrl` | lookup action uses `CPH.TwitchGetExtendedUserInfoById/Login`; shared router uses `CPH.SendMessage`; optional native action uses `CPH.TwitchSendShoutoutById/Login` |
| YouTube / Streamer.bot | Chat `%message%`, `%messageId%`, `%publishedAt%`; YouTube user and broadcast variables; normalized command arguments | shared router uses `CPH.SendYouTubeMessageToLatestMonitored` because the broadcast ID is not part of every normalized event |
| Kick / Streamer.bot | Chat `%isInternal%`, Kick chat variables including message ID, and Kick user variables; normalized command arguments | shared router uses `CPH.SendKickMessage`; automatic first chat is a welcome because the documented user API exposes only `KickGetBot` and `KickGetBroadcaster`, not arbitrary chatter categories |
| TikTok / TikFinity | `%userId%`, `%username%`, `%nickname%`, documented `%profilePicturUrl%` spelling, `%commandParams%`, `%giftId%`, `%giftName%`, `%coins%`, `%repeatCount%`, `%likeCount%`, `%totalLikeCount%`, `%subMonth%`, `%emoteId%`, `%emoteImageUrl%` | TikFinity's documented `CPH.WebsocketBroadcastJson` envelope with `action: "sendChatbotMessage"` and `args.message` |

Official references:

- <https://docs.streamer.bot/api/triggers/twitch/raid/raid>
- <https://docs.streamer.bot/api/triggers/twitch/chat/first-words>
- <https://docs.streamer.bot/api/triggers/youtube/chat/first-words>
- <https://docs.streamer.bot/api/triggers/kick/chat/first-words>
- <https://docs.streamer.bot/api/triggers/core/commands/command-triggered>
- <https://docs.streamer.bot/api/triggers/youtube/chat/message>
- <https://docs.streamer.bot/api/triggers/kick/chat/message>
- <https://docs.streamer.bot/api/sub-actions/twitch/moderation/send-shoutout>
- <https://docs.streamer.bot/api/csharp/methods/twitch/user/twitch-get-extended-user-info-by-id>
- <https://docs.streamer.bot/api/csharp/methods/kick/user>
- <https://docs.streamer.bot/api/csharp/methods/youtube/chat/send-youtube-message-to-latest-monitored>
- <https://tikfinity.zerody.one/streamerbot-integration>

Streamer.bot does not currently document an arbitrary-channel native shoutout for YouTube or Kick, nor a general arbitrary-user lookup for either platform. `KickSetCategory` changes the connected broadcaster's own channel; it does not read a chatter's category. The add-on does not invent these methods. Automatic YouTube, Kick, and TikTok first-chat messages are welcomes. A moderator can still issue a manual plain-text channel-link shoutout.

## Setup

1. Download and extract `THSV-StreamBridge-AddOn-Automated-Shoutouts-1.0.0.zip`, then install its `THSV-Automated-Shoutouts-1.0.0.thsv-addon` through the authenticated wizard and enable it.
2. Review the settings. Keep first-chat automation disabled until its allowlist is populated.
3. For manual use, open **Command Sync** and create the command named by **Manual command name**. Recommended aliases are `so` and `shoutout`; set the reference role to Moderator and enable the desired message sources.
4. Import `Streamer.bot/THSV-StreamBridge-Automated-Shoutouts-1.0.0.sb` from the extracted add-on bundle. The native platform intake remains a core import supplied by the main StreamBridge download. Do not attach triggers to the Automated Shoutouts actions. Approve `Lookup Twitch Creator` whenever Twitch triggers are enabled. Approve `Twitch Native Shoutout` only when the Twitch mode is `native` or `both`.
5. For TikTok output, enable **Allow Streamer.bot to push messages to TikFinity** in TikFinity's Chatbot settings.
6. Optionally add `http://127.0.0.1:8787/overlay/addons/thsv.automated-shoutouts` to OBS, Meld, or Streamlabs and use **Send preview card** in the wizard.

## Template tokens

`{displayName}`, `{user}`, `{platform}`, `{category}`, `{channelUrl}`, `{viewers}`, and `{trigger}` are replaced. Unknown tokens remain visible so a typo is apparent rather than silently deleting creator text. Control characters are removed and whitespace is normalized before delivery.

Every delivery is kept to one message and fitted before it reaches the router: Twitch 500 characters, YouTube 200, Kick 500, and TikTok 150. When one message is routed to several selected platforms, the strictest selected limit wins. If shortening is necessary, the complete channel URL is preserved and the descriptive portion is shortened with an ellipsis. The router uses `overflow: reject`, so contract drift cannot silently split a shoutout into chat spam.

Twitch category is available because Streamer.bot documents it as `TwitchUserInfoEx.Game`. Pronoun and team tokens remain deferred. No equivalent arbitrary-user category lookup exists across YouTube, Kick, or TikFinity, so their automatic messages do not pretend otherwise.

## Spam and restart behavior

- only one queued entry per stable platform user;
- creator-set global and per-user cooldowns;
- optional one-shoutout-per-user-per-stream gate;
- queue maximum 20 and creator-set lower bound;
- queued entries expire rather than appearing long after their context;
- state is persisted before external delivery, favoring a missed cosmetic shoutout over a duplicate after a crash;
- Twitch-native mode additionally reserves Twitch's documented two-minute global and one-hour per-user constraints;
- ignored-user rules override automatic and manual triggers;
- simulated events may preview the hosted card but never send chat or call Twitch.

Rule formats are `username`, `platform:username`, or `platform:id:stable-user-id`. Stable IDs survive renames and are preferred when known.

## Privacy

The add-on never persists chat message text. Private state contains only a bounded queue of shoutout targets, platform-scoped user IDs or names used for cooldowns, timestamps, and stream-session markers. A queued avatar URL may be held only until that bounded entry is delivered or expires. State stays in the add-on's private local data directory and is not included in safe wizard exports. Uninstall preserves it for a later reinstall; delete that private add-on state explicitly if the creator wants immediate removal.

## Live acceptance

1. Start StreamBridge and confirm `/ready` reports ready.
2. Run `npm run simulate -- tests/fixtures/twitch-raid.json` and confirm only the optional overlay preview appears—no live chat output.
3. Trigger a controlled Twitch raid from a channel with a category and confirm the message contains the name, category, and complete channel URL exactly once.
4. Test an allowlisted Twitch chatter whose relayed `firstMessage` is true and whose lookup returns no category. Confirm the editable viewer welcome appears exactly once, without a channel/category promotion. Confirm a returning chatter (`firstMessage=false` or absent) and an empty-category raid produce no automatic promotion.
5. Repeat the same source event and confirm no second message is posted.
6. Confirm allowlisted YouTube, Kick, and TikTok first-chat events use their welcome messages without a category/channel promotion claim.
7. Run the moderator command once from each enabled platform and confirm the response returns only to its source when delivery mode is `source`.
8. Confirm a viewer cannot invoke the command and an ignored target never appears.
9. If native mode is enabled, confirm the approved action returns `automatedShoutoutSucceeded = true`; then confirm an immediate repeat is suppressed/falls back rather than calling Twitch again.
10. If TikTok delivery is enabled, confirm TikFinity's chatbot push option is enabled and a source-routed test appears once.
