# Channel rewards

Stage 8 adds normalized reward-redemption intake for Twitch and Kick plus explicit,
creator-approved Twitch reward administration. The bridge does not invent platform parity.

## Install

1. Re-import `packages\streamerbot\native-platform-intake\THSV-StreamBridge-Native-Platform-Intake-4.0.0.sb` so the existing Twitch and Kick intake actions contain the current relay source. Back up Streamer.bot and restore the trigger matrix after an overwrite import.
2. Add `TwitchRewardRedemption` only to `THSV Twitch - Intake` and `KickRewardRedemption` only to `THSV Kick - Intake`.
3. Import `packages\streamerbot\reward-administration\THSV-StreamBridge-Reward-Administration-4.0.0.sb` and review its custom C# warning. The action must remain triggerless.
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

## Add-on redemption routing

Reward-driven first-party add-ons use one consistent platform policy:

| Platform | Viewer entry | Failure behavior |
| --- | --- | --- |
| Twitch | Native Channel Points reward | Add-ons may use the approved Twitch controller to fulfill or refund when the reward queue is enabled. |
| Kick | Native Kick channel reward | The claim is processed directly. Streamer.bot currently exposes no documented Kick fulfill, refund, title, cost, enable, or disable method, so rejected claims cannot return points automatically. |
| YouTube | Viewer Foundation points plus the add-on command | A failed save or dispatch refunds the internal points with an idempotent rollback. |
| TikTok | Viewer Foundation points plus the add-on command relayed by TikFinity | A failed save or dispatch refunds the internal points with an idempotent rollback. |

This policy currently applies to Village Voice viewer TTS, Viewer Spotlight requests, Village Roll
Call, Fan Crown, First Five, and Raid Scout viewer suggestions. Generic reward observers such as
Stream Labels, Community Analytics, and Viewer Foundation continue to consume normalized Twitch
and Kick redemption events without owning or mutating the platform reward.

## Recommended reward blueprints

The wizard shows these values beside each add-on. They are safe starting points, not hidden
requirements; creators may change the cost, color, and wording. Reward IDs must always be copied
from the exact reward created on that platform.

| Add-on | Twitch and Kick title | Cost | Color | Viewer input | Twitch queue |
| --- | --- | ---: | --- | --- | --- |
| Fan Crown | `Fan Crown` | Match the configured base cost | `#F2C94C` | Off | Off, so Twitch can mutate and settle the claim |
| First Five | `First Five: Claim 1st Place` through `5th Place` | 100 each | `#2DB7A3` | Off | Off, so Twitch can sequence and settle each placement |
| Village Roll Call | `Village Roll Call` | 50 | `#2E8B57` | Off | On; the add-on records valid check-ins directly |
| Viewer Spotlight | `Viewer Spotlight` | 250 | `#2DB7A3` | Off | Off, so rejected cards can be refunded |
| Village Voice | `Village Voice - TTS` | 500 | `#7C3AED` | Required | On; accepted speech enters the bounded queue directly |
| Raid Scout | `Raid Scout Suggestion` | 500 | `#F59E0B` | Required | Off, so invalid suggestions can be refunded |

Kick rewards use the same recommended titles, colors, descriptions, and costs, but remain fixed.
The add-ons never claim that a Kick title, price, queue state, or refund changed because the current
Streamer.bot contract exposes redemption intake without those administration operations.

## Safe testing

Use Streamer.bot's test trigger for Twitch or Kick reward redemption to verify intake and inspect
the resulting normalized event. Do not use the administration page against a production reward.
To finish mutation acceptance, create or select a harmless custom reward and intentionally verify
one operation at a time while inspecting Streamer.bot Action History and the Twitch dashboard.
Automated tests verify validation and dispatch boundaries without changing a channel reward.
