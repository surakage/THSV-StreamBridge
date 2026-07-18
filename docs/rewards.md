# Channel rewards

Stage 8 adds normalized reward-redemption intake for Twitch and Kick plus explicit,
creator-approved Twitch reward administration. The bridge does not invent platform parity.

## Install

1. Re-import `packages\streamerbot\native-platform-intake\THSV-StreamBridge-Native-Platform-Intake-1.0.0.sb` so the existing Twitch and Kick intake actions contain the current relay source.
2. Add `TwitchRewardRedemption` only to `THSV Twitch - Intake` and `KickRewardRedemption` only to `THSV Kick - Intake`.
3. Import `packages\streamerbot\reward-administration\THSV-StreamBridge-Reward-Administration-1.0.0.sb` and review its custom C# warning. The action must remain triggerless.
4. Keep `streamerbot.rewardAdministrationActionAlias` set to `THSV StreamBridge - Reward Administration`.
5. Enable the `rewards` legacy capability and the matching provider operations for the intended native platform entries, then restart StreamBridge.

## Supported behavior

Both native intake actions normalize a redemption ID, reward ID, title, cost, required-input
flag, optional user input, actor identity, stable source identity, and bridge sequence. Twitch
redemptions advertise `fulfill` and `cancel`; Kick redemptions advertise no mutation operation.

The wizard's **Rewards** page exposes only documented Twitch methods:

- enable or disable a reward;
- pause or unpause a reward;
- fulfill a redemption; and
- cancel and refund a redemption.

Every request is loopback-only, bearer-token protected, schema bounded, confirmed in the browser,
and carries a second creator-approval flag into the triggerless C# action. Fulfill and cancel also
require an explicit redemption ID. No operation runs merely because a redemption arrives.

Kick reward redemption intake is supported. Kick reward creation, editing, deletion, enablement,
pause, fulfillment, and cancellation are deliberately unavailable because Streamer.bot's Kick
Rewards sub-action contract is not documented. The wizard disables Kick mutation selection and
the service and C# trust boundaries independently reject it.

## Safe testing

Use Streamer.bot's test trigger for Twitch or Kick reward redemption to verify intake and inspect
the resulting normalized event. Do not use the administration page against a production reward
unless you have selected a harmless reward and intend the requested live state change. Automated
tests verify validation and dispatch without changing a channel reward.

