# THSV StreamBridge Multi-Commands

This package turns a receiver-validated public `command.received` event into stable `multiCommand*` arguments. Streamer.bot remains the automation engine: add your command actions after this package and branch on `multiCommandValid`, `multiCommandAuthorized`, and `multiCommandName`.

Configure the shared prefix, aliases, and role policy in the bridge `commands` section. Raw public `chat.message` events are parsed centrally and generate a correlated `command.received` event; platform adapters do not implement their own tokenizer. Direct command events are only for integrations that already supply structured command fields.

## Install

1. Import core receiver `1.0.3` or later and `THSV-StreamBridge-Multi-Commands-1.0.1.sb`.
2. Open `THSV StreamBridge - Receive Event`.
3. Add **Core > Actions > Run Action** after the receiver C# sub-action.
4. Select `THSV StreamBridge - Multi-Commands` and enable **Run Action Immediately**.
5. Keep Multi-Chat inline as well; each package ignores event types it does not own.

Core receiver upgrades overwrite manually-added child actions. Re-add both package actions after upgrading it.

## Contract

- `payload.command` is the canonical lowercase command name.
- `payload.invokedAs` records the name or alias actually used.
- `payload.arguments` is a bounded array of plain strings. Quoted argument parsing happens during normalization.
- `payload.minimumRole` supports `viewer`, `subscriber`, `moderator`, or `broadcaster`.
- `payload.allowBots` defaults to false. Bot provenance is never inferred from a username.
- `multiCommandAuthorized` reports the portable role/bot policy result. A creator action still decides what authorized commands do.
- Public `command.received` is isolated from `command.private-received` and `operator.command-received`.
- No argument is evaluated as code or passed to a shell. The action stores no globals, files, or history.
- Cooldowns are intentionally deferred until cross-platform viewer identity exists; do not implement per-platform cooldown state that can be bypassed from another service.

## Manual QA

Simulate all five `*-command.json` fixtures and inspect Action History. Valid fixtures should set `multiCommandHandled=True`, `multiCommandValid=True`, `multiCommandAuthorized=True`, canonical name `shoutout`, alias `so`, and one argument. A private/operator command should leave `multiCommandHandled=False`.
