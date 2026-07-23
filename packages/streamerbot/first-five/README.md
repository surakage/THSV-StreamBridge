# THSV StreamBridge - First Five

Import `THSV-StreamBridge-First-Five-2.4.0.sb`, review the custom C# warning, and keep **THSV Addon - First Five - Controller** triggerless.

In the StreamBridge wizard:

1. inspect Streamer.bot actions;
2. approve only the Controller action for First Five;
3. paste five unique Streamer.bot-owned Twitch Reward IDs into the add-on settings.

The optional Reset action may be attached to a deck button or hotkey. It sends only a bounded local reset request; the installed add-on performs the guarded reset through the Controller.

The existing `THSV Twitch - Intake` action should carry one **Twitch > Channel Reward > Reward Redemption** trigger configured for **Any Reward**. Do not attach five separate redemption actions.

The Controller uses documented `UpdateRewardTitle`, `EnableReward`, `DisableReward`, `TwitchRedemptionFulfill`, and `TwitchRedemptionCancel` methods. It does not access files, secrets, SlothCoins, or arbitrary Streamer.bot actions.
