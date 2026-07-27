# Streamer.bot trigger matrix

Add triggers only to the actions listed below. Streamer.bot owns provider connections and trigger objects, so a first portable import installs the reviewed actions without creating creator-owned trigger bindings. **Do not use Streamer.bot's overwrite import as an in-place code updater:** overwriting an existing intake action replaces its trigger collection with the package's empty collection. Back up Streamer.bot first and either reattach the matrix below after an overwrite or use a reviewed migration that preserves the existing trigger objects.

## THSV Twitch - Intake

- Twitch > Chat > Message
- Twitch > Channel > Follow
- Twitch > Chat > Cheer
- Twitch > Subscriptions > Subscription
- Twitch > Subscriptions > Resubscription
- Twitch > Subscriptions > Gift Subscription
- Twitch > Subscriptions > Gift Bomb
- Twitch > Raid > Raid
- Twitch > Channel Reward > Reward Redemption
- Twitch > Channel > Stream Online
- Twitch > Channel > Stream Offline

## THSV YouTube - Intake

- YouTube > Chat > Message
- YouTube > Chat > Super Chat
- YouTube > Chat > Super Sticker
- YouTube > Chat > Jewels Gifted
- YouTube > General > New Subscriber
- YouTube > General > New Sponsor
- YouTube > Membership > Member Milestone
- YouTube > Membership > Gift
- YouTube > Broadcast > Started
- YouTube > Broadcast > Ended

YouTube New Subscriber is a free channel subscription (the equivalent of a follow). New Sponsor, Member Milestone, and Membership Gift represent paid membership activity and remain separate. Jewels Gifted is normalized as a platform gift using Streamer.bot's `messageId`, `gift.name`, `gift.comboCount`, `gift.jewelsAmount`, and `gift.altText` arguments; it feeds the gift alert profile and has its own optional chat-activity template.

## THSV Kick - Intake

- Kick > Chat > Message
- Kick > Channel > Follow
- Kick > Subscriptions > Subscription
- Kick > Subscriptions > Resubscription
- Kick > Subscriptions > Gift Subscription
- Kick > Subscriptions > Mass Gift Subscription
- Kick > Kicks > Gifted
- Kick > Channel Reward > Reward Redemption
- Kick > Channel > Stream Online
- Kick > Channel > Stream Offline

## TikFinity mappings

Map TikFinity Chat, Follow, Gift, Like, and Subscription events to the corresponding `THSV TikTok - ...` actions. TikFinity owns these mappings; they are not native Streamer.bot provider triggers.

## Bridge launcher

`THSV StreamBridge - Launch Bridge` may use **Core > Streamer.bot > Streamer.bot Started**. Keep `THSV StreamBridge - Shutdown Bridge` manual so one platform ending cannot terminate an active multistream.

## Actions that must remain triggerless

- THSV StreamBridge - Receive Event
- THSV StreamBridge - Multi-Chat
- THSV StreamBridge - Multi-Commands
- THSV StreamBridge - Multi-Alerts
- THSV StreamBridge - Multi-Timed Actions
- THSV StreamBridge - Send Timed Message
- THSV StreamBridge - Command Administration
- THSV StreamBridge - Reward Administration
- THSV StreamBridge - Open Setup Wizard

Direct platform triggers on an internal action can bypass receiver validation or process one event twice.

Wizard-generated commands are separate: each exported command action includes its own generated Command trigger and only the selected Twitch, YouTube, and Kick command sources. TikFinity command mapping remains creator-configured in TikFinity.

The machine-readable equivalent is `triggerContract` plus `manualTriggerSetup` in `packages/streamerbot/native-platform-intake/manifest.json`.
