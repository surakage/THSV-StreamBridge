# Channel rewards

Stage 8 adds normalized reward-redemption intake for Twitch and Kick plus explicit,
creator-approved Twitch reward administration. The bridge does not invent platform parity.

## Install

1. Re-import `packages\streamerbot\native-platform-intake\THSV-StreamBridge-Native-Platform-Intake-1.5.1.sb` so the existing Twitch and Kick intake actions contain the current relay source.
2. Add `TwitchRewardRedemption` only to `THSV Twitch - Intake` and `KickRewardRedemption` only to `THSV Kick - Intake`.
3. Import `packages\streamerbot\reward-administration\THSV-StreamBridge-Reward-Administration-1.0.0.sb` and review its custom C# warning. The action must remain triggerless.
4. Keep `streamerbot.rewardAdministrationActionAlias` set to `THSV StreamBridge - Reward Administration`.
5. Enable the `rewards` legacy capability and the matching provider operations for the intended native platform entries, then restart StreamBridge.

## Supported behavior

Both native intake actions normalize a redemption ID, reward ID, title, cost, required-input
flag, optional user input, actor identity, stable source identity, and bridge sequence. Twitch
redemptions advertise `fulfill` and `cancel`; Kick redemptions advertise no mutation operation.

The wizard's **Rewards** page exposes six Twitch CPH calls that compile successfully in
Streamer.bot `1.0.5-alpha.31`:

- enable or disable a reward;
- pause or unpause a reward;
- fulfill a redemption; and
- cancel and refund a redemption.

Every request is loopback-only, bearer-token protected, schema bounded, confirmed in the browser,
and carries a second creator-approval flag into the triggerless C# action. Fulfill and cancel also
require an explicit redemption ID. No operation runs merely because a redemption arrives.

Live state-changing behavior for these six calls has deliberately not been executed or confirmed.
Compilation proves the method names and signatures are accepted by the installed Streamer.bot
build; it does not prove behavior for every reward state or reward category.

Streamer.bot exposes no documented reward-listing request equivalent to the action and command
inspection APIs. The wizard therefore cannot discover rewards and requires the creator to copy the
exact custom reward GUID from Twitch or Streamer.bot. StreamBridge creates no rewards and claims no
ownership over creator rewards. Default Twitch rewards and Power-Ups are unverified; do not use
their IDs for acceptance testing.

Reward administration intentionally bypasses the wizard's staged configuration transaction. It is
an immediate live operation protected by loopback authentication, a named confirmation prompt, a
literal creator-approval flag, strict validation, and a triggerless Streamer.bot action. Cancelling
a configuration draft cannot cancel an operation that was already submitted.

Kick reward redemption intake is supported. Kick reward creation, editing, deletion, enablement,
pause, fulfillment, and cancellation are deliberately unavailable because Streamer.bot's Kick
Rewards sub-action contract is not documented. The wizard disables Kick mutation selection and
the service and C# trust boundaries independently reject it.

## Safe testing

Use Streamer.bot's test trigger for Twitch or Kick reward redemption to verify intake and inspect
the resulting normalized event. Do not use the administration page against a production reward.
To finish mutation acceptance, create or select a harmless custom reward and intentionally verify
one operation at a time while inspecting Streamer.bot Action History and the Twitch dashboard.
Automated tests verify validation and dispatch boundaries without changing a channel reward.
