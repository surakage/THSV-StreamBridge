# THSV StreamBridge Command Administration

This package is the Tier 1 half of the Stage 5 command-management plan
(`docs/stage-5-plan.md`): it enables or disables an existing Streamer.bot command using the
documented C# command-management methods, invoked live from the bridge wizard. It never creates,
edits, or deletes a command — those remain Tier 2, generate-and-verify `.sb` packages imported
through Streamer.bot's own native import UI, not this package.

## Verification status

**Implementation complete; live Streamer.bot Alpha compilation pending.** `CPH.EnableCommand`/
`CPH.DisableCommand` are documented at
[Streamer.bot C# command methods](https://docs.streamer.bot/api/csharp/methods/core/commands),
but the exact overload this package assumes (a Streamer.bot-assigned command ID, not a name) has
not been confirmed by compiling this source inside a running Streamer.bot instance. Every prior
package in this project was hardened against exactly this kind of assumption by a live compile
pass before being trusted (for example, the Core Receiver and Multi-Chat packages both needed a
reference removed after live Alpha compilation surfaced it). Do the same here before relying on
this package: import it, and if the compiler rejects the `EnableCommand`/`DisableCommand` call,
that's the live signal to fix the call rather than a bug in this description.

Cooldown read/write is deliberately not included in this version — the exact method signatures
were not confident enough to ship without the same live-compile confirmation, and shipping a
guess here would be worse than shipping nothing. It can be added once confirmed.

## Install

1. Import `THSV-StreamBridge-Command-Administration-1.0.0.sb` into Streamer.bot.
2. Keep the imported action triggerless — it is invoked directly by the bridge over the
   authenticated Streamer.bot WebSocket connection, the same way the Core Receiver action is,
   not chained as a child of another action.
3. The bridge's `streamerbot.commandAdministrationActionAlias` configuration value must match the
   imported action's name exactly (default: `THSV StreamBridge - Command Administration`).

## Contract

- `commandAdminOperation` must be `enable` or `disable`.
- `commandAdminCommandId` must be the Streamer.bot-assigned command ID, never a name — names are
  not stable identifiers across a rename, and this project has already had to correct that
  assumption once for action ownership tracking.
- `commandAdminApproved` must be `true`. The package refuses to act otherwise, matching the
  creator-approval gate every other mutating package in this project already enforces.
- `commandAdminDispatched=True` means the documented method call did not throw. It is not
  confirmation the command's enabled state actually changed in Streamer.bot's own store — the
  wizard's sync/inspection pass is the source of truth for that, the same way `speakerDispatched`
  in Speaker Orchestration was explicitly documented as not being a playback-completion signal.
- The action stores no globals, files, or history, and never runs another action.
