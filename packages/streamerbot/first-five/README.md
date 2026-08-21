# THSV StreamBridge - First Five

Import `THSV-StreamBridge-First-Five-4.0.2.sb`, review the custom C# warning, and keep **THSV Addon - First Five - Controller** triggerless.

In the StreamBridge wizard:

1. inspect Streamer.bot actions;
2. approve only the Controller action for First Five;
3. paste five unique Streamer.bot-owned Twitch Reward IDs into the add-on settings.
4. keep **Skip Reward Queue disabled** on all five rewards so repeat or out-of-order claims can be refunded.

The optional Reset action may be attached to a deck button or hotkey. It sends only a bounded local reset request; the installed add-on performs the guarded reset through the Controller.

The existing `THSV Twitch - Intake` action should carry one **Twitch > Channel Reward > Reward Redemption** trigger configured for **Any Reward**. Do not attach five separate redemption actions.

When Twitch reports a redemption as already fulfilled, the Controller does not attempt to fulfill it twice. The Controller uses documented `UpdateRewardTitle`, `EnableReward`, `DisableReward`, `TwitchRedemptionFulfill`, and `TwitchRedemptionCancel` methods. It does not access files, secrets, SlothCoins, or arbitrary Streamer.bot actions.
