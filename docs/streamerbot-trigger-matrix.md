# Streamer.bot trigger matrix

The imports now carry every trigger whose type and settings do not depend on your setup: the three platform intakes below, the Scene Actions intake (OBS Studio, Streamlabs Desktop and Meld Studio Scene Changed, any scene) and the two Ad Break Companion intakes. Streamer.bot's import overwrites an existing action with the same name, including its trigger collection, so re-importing replaces these triggers instead of adding copies; do not also attach them by hand. Triggers that depend on your setup (Launch Bridge's Streamer.bot Started, the Monitor Connections timed action, broadcast-app start/stop, hotkeys, scene-specific and Ko-fi or Voice Control triggers) are not in the imports yet and are removed by an overwrite import, so reattach them afterward. **Trigger assurance** in the wizard reports any contract trigger that is missing, disabled or duplicated.

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
