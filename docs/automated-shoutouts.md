# Automated Shoutouts add-on

Automated Shoutouts is an optional `.thsv-addon` that turns already-normalized StreamBridge events into bounded shoutouts and safety-screened daily welcomes. Twitch, YouTube, Kick, and TikTok use one hosted card contract with platform-specific colors. It reuses the main bridge's event bus, one Streamer.bot WebSocket connection, outbound platform router, scheduler, private state, and hosted overlay. It does not retrieve clips, open another socket, or store chat messages.

## Supported triggers

| Trigger | Platforms | Source used | Safety rule |
|---|---|---|---|
| Incoming raid | Twitch | normalized `channel.raid`, then documented `TwitchGetExtendedUserInfoById/Login` | minimum viewer count; the message is sent only when Twitch returns a non-empty `Game` category |
| First safe chat of the day | Twitch | normalized `chat.message`, safety gate, then documented Twitch extended-user lookup | disabled by default; stable ID, ignored-bot list, explicit spam phrases/domains, link policy, and once-per-day gate apply before lookup; category-confirmed creators get a promotion and no-category viewers get a welcome |
| First safe chat of the day | YouTube, Kick, TikTok | normalized `chat.message` | same stable-ID and spam gate; platform-specific welcome only, with no unsupported category or streamer claim |
| Manual command | Twitch, YouTube, Kick, TikTok | normalized `command.received`; first command argument is the target | caller must carry normalized `moderator` or `broadcaster` role even if the creator misconfigures the Streamer.bot command |

The add-on intentionally does not require separate native First Words triggers. It derives the first accepted message from the shared normalized feed and records the stable platform account against the creator's configured calendar day. Ending and restarting a stream does not clear that record; the next welcome becomes eligible only after the date changes in the configured timezone. TikFinity does not document a separate first-words event, so TikTok follows the same normalized-message rule and requires a stable relayed user ID by default.

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

1. Download and extract `THSV-StreamBridge-AddOn-Automated-Shoutouts-1.1.0.zip`, then install its `THSV-Automated-Shoutouts-4.0.5.thsv-addon` through the authenticated wizard and enable it.
2. Review the settings. Keep daily welcomes disabled until the timezone, safety mode, editable bot list, spam phrases, and blocked domains match the channel. `Balanced` is the recommended starting point; use Allowlist only when every welcomed account must be preapproved.
3. For manual use, choose **Manual command name** in the add-on settings. Automated Shoutouts registers that moderator-only command and its recommended `!so` alias through the existing chat intakes after save and restart. Do not create a duplicate Command Sync definition or Streamer.bot Command object.
4. Import `Streamer.bot/THSV-StreamBridge-Automated-Shoutouts-4.0.5.sb` from the extracted add-on bundle. The native platform intake remains a core import supplied by the main StreamBridge download. Do not attach triggers to the Automated Shoutouts actions. Approve `Lookup Twitch Creator` whenever Twitch triggers are enabled. Approve `Twitch Native Shoutout` only when the Twitch mode is `native` or `both`. Visual cards are rendered by StreamBridge and never retrieve clips.
5. For TikTok output, enable **Allow Streamer.bot to push messages to TikFinity** in TikFinity's Chatbot settings.
6. Optionally add the concise **Shoutouts** source, `http://127.0.0.1:8787/overlay/shoutouts`, to OBS, Meld, or Streamlabs and use **Send preview card** in the wizard. The previous module-ID URL remains supported for existing scenes.

## Platform-colored visual cards

The same fixed-size card supports Twitch purple, YouTube red, Kick green, and TikTok cyan/pink. Streamer cards are Twitch-only because that is the only supported arbitrary-chatter lookup that supplies a verified current category. YouTube, Kick, and TikTok always use Viewer welcome cards. Welcome cards use the viewer identity and one randomly selected editable platform message. Automated Shoutouts never retrieves or plays clips.

The **Show the visual card for** and **Platforms allowed to show welcome cards** controls independently select event paths and platforms. Manual means the normalized moderator/broadcaster command configured under **Manual command name**. All visual delivery uses the same core-owned `/overlay/shoutouts` source and existing overlay WebSocket.

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
- first-chat candidates must pass the selected Open, Balanced, or Strict safety gate before any Twitch lookup, chat output, or card is queued;
- stable platform IDs and the creator timezone enforce one welcome per viewer per calendar day, even across multiple same-day streams and bridge restarts;
- preinstalled service-bot accounts, promotion phrases, and promotion domains remain creator-editable and are never silently re-added after removal;
- simulated events may preview the hosted card but never send chat or call Twitch.

Rule formats are `username`, `platform:username`, or `platform:id:stable-user-id`. Stable IDs survive renames and are preferred when known.

## Privacy

The add-on never persists chat message text. Private state contains only a bounded queue of shoutout targets, platform-scoped user IDs or names used for cooldowns, timestamps, and stream-session markers. A queued avatar URL may be held only until that bounded entry is delivered or expires. State stays in the add-on's private local data directory and is not included in safe wizard exports. Uninstall preserves it for a later reinstall; delete that private add-on state explicitly if the creator wants immediate removal.

## Live acceptance

1. Start StreamBridge and confirm `/ready` reports ready.
2. Run `npm run simulate -- tests/fixtures/twitch-raid.json` and confirm only the optional overlay preview appears—no live chat output.
3. Trigger a controlled Twitch raid from a channel with a category and confirm the message contains the name, category, and complete channel URL exactly once.
4. Enable daily welcomes in Balanced mode. Confirm an ordinary stable-ID Twitch viewer with no category receives one editable welcome, while a category-confirmed Twitch creator receives the creator wording.
5. Repeat the same viewer, end and restart the stream on the same calendar day, and confirm no second welcome appears. Change only the test clock/date and confirm they become eligible on the next configured day.
6. Confirm safety-approved YouTube, Kick, and TikTok first-chat events use their platform-colored cards and randomized welcome lists without a category/channel promotion claim. Confirm a missing stable ID fails closed while that setting is enabled.
7. Run the moderator command once from each enabled platform and confirm the response returns only to its source when delivery mode is `source`.
8. Confirm a viewer cannot invoke the command and an ignored target never appears.
9. If native mode is enabled, confirm the approved action returns `automatedShoutoutSucceeded = true`; then confirm an immediate repeat is suppressed/falls back rather than calling Twitch again.
10. If TikTok delivery is enabled, confirm TikFinity's chatbot push option is enabled and a source-routed test appears once.
11. Preview Twitch, YouTube, Kick, and TikTok cards and confirm long names and welcome text remain inside the fixed 16:9 card without clipping.
