# Discord Chat Archive

Discord Chat Archive is an optional, disabled-by-default add-on that copies creator-selected **public** Twitch, YouTube, Kick, and TikTok chat into a creator-owned Discord channel or forum. It uses StreamBridge's normalized chat event and existing Streamer.bot connection; it does not attach separate platform triggers or open another WebSocket.

Channel mode sends bounded batches directly to one normal webhook channel. Forum mode creates one thread when the first batch arrives, reuses the returned thread ID for later batches, and clears that session identity after the final live platform goes offline. It never creates one forum post for every viewer message.

## Before installing

Create a dedicated private Discord webhook for the chosen channel type. One webhook belongs to one destination: select either **Normal channel** or **Forum channel** in the wizard. Treat its URL like a password. If the URL appears in a screenshot, stream, log, or shared import, delete that webhook in Discord and create a new one.

Selected public messages become Discord records and are retained according to that server and channel's policies. Tell viewers if chat is being archived. Private, operator, and system chat are never subscribed. StreamBridge does not create a local transcript and keeps waiting or retry content only in a bounded in-memory queue.

## Install

1. Download and extract the matching Discord Chat Archive add-on ZIP from the same official GitHub Release as core.
2. In Streamer.bot, import `THSV-StreamBridge-Discord-Chat-Archive-4.0.2.sb` from the ZIP's `Streamer.bot` folder.
3. Accept the custom C# warning only after verifying the release source.
4. Open `THSV Addon - Discord Chat Archive - Deliver`.
5. Replace the `discordArchiveWebhookUrl` Set Argument placeholder with the new private webhook URL.
6. Open its Execute C# Code sub-action, confirm the package references, and select **Save and Compile**.
7. Run the action manually once. A manual run sends only a safe setup message to a normal channel; it does not contain viewer data.
8. In the StreamBridge wizard, open **Add-ons**, install the `.thsv-addon`, and restart StreamBridge.
9. Inspect Streamer.bot, approve only `THSV Addon - Discord Chat Archive - Deliver`, and save the grant.
10. Choose the matching channel type. For forum mode, optionally supply forum tag IDs and an editable thread-name template.
11. Review platforms, filters, batching, message appearance, and the privacy notice before enabling the add-on.

Do not attach chat or platform triggers to the delivery action. Core already receives each supported platform once and routes normalized `chat.message` events to the add-on.

## Ignore rules

Rules are exact and case-insensitive:

- `nightbot` ignores that username or display name on every platform.
- `twitch:nightbot` ignores it only on Twitch.
- `youtube:id:UC123` ignores one stable platform identity even if its display name changes.

System messages are always excluded. Detected bots are excluded by default. Command messages and simulated trigger tests can also be excluded; simulations are blocked by default.

## Delivery behavior

- Messages wait for a 5–30 second batching window.
- Each Discord post contains at most 1–20 messages and no more than 1,900 characters.
- The waiting queue is bounded to 10–500 messages. When full, the oldest entry is omitted instead of allowing unbounded memory growth.
- StreamBridge can retry a failed approved action at most twice. The Streamer.bot controller also honors Discord HTTP 429 responses with at most two bounded retries.
- Discord mentions are disabled through an explicit `allowed_mentions` payload. Untrusted message Markdown is neutralized before delivery.
- Confirmed responses return only bounded message and thread IDs to StreamBridge. Response bodies, message content, and the webhook are never logged.
- The private webhook URL stays in Streamer.bot. It is not sent to StreamBridge, saved in add-on settings, logged, or included in wizard exports.

## Test

1. Confirm the manual Streamer.bot setup message appears once in a normal channel.
2. Enable one platform in the add-on and send a harmless real chat message.
3. Wait for the saved batching window and confirm one formatted Discord post appears.
4. In forum mode, send a second message and confirm it appends to the same thread.
5. End the last live platform, start a new session, and confirm a new forum thread is created.
6. Add the test account to **Ignored viewers and bots**, save, send another message, and confirm it is not posted.
7. Repeat for each enabled live platform.

If nothing arrives, check that the add-on is enabled, the source platform is selected, the exact delivery action is approved and enabled, Streamer.bot is connected, the wizard destination matches the webhook's channel type, and the webhook has not been deleted or rotated.

Official references:

- [Streamer.bot Discord integration](https://docs.streamer.bot/guide/integrations/discord)
- [Streamer.bot Discord webhook method](https://docs.streamer.bot/api/csharp/methods/integrations/discord/post-text-to-webhook)
- [Discord webhook resource](https://docs.discord.com/developers/resources/webhook)
