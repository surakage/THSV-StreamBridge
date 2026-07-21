# Streamer.bot C# compiler references

THSV StreamBridge targets Streamer.bot `1.0.5-alpha.31` or newer. Import packages only from this repository or an official release, review the included source, then accept Streamer.bot's custom C# warning.

## Required references

Every generated import now carries the standard `mscorlib.dll` and `System.dll` compiler references. Packages that parse or create JSON also carry Streamer.bot's local `.\Newtonsoft.Json.dll` reference:

- Core Receiver
- Multi-Chat
- Multi-Commands
- Multi-Alerts
- Multi-Timed Actions
- Native Platform Intake
- TikFinity Intake
- Timed Message Output

Normally no manual reference step is required after importing a current package. In the **Execute C# Code** editor, verify the reference list if compilation reports a missing type. Use only the `Newtonsoft.Json.dll` supplied with Streamer.bot; do not download a random DLL or replace Streamer.bot's bundled assembly.

The current source does **not** require `System.Core.dll`, `System.Net.Http.dll`, or any downloaded third-party reference. Earlier compatibility workarounds are not required: current packages use documented `CPH.TryGetArg`, `CPH.SetArgument`, `CPH.WebsocketBroadcastJson`, platform chat methods, action dispatch, command administration, and Twitch reward methods directly.

## Packages using only built-in references

- Bridge Launcher
- Setup Wizard Launcher
- Command Administration
- Reward Administration

## Compile check

1. Open the imported THSV action.
2. Open its enabled **Execute C# Code** sub-action.
3. Confirm the references above.
4. Select **Save and Compile**.
5. Do not enable live platform triggers until compilation succeeds.

The Bridge Launcher has one editable **Set Argument** above each C# block. Leave `thsvBridgeInstallPath` at `%LOCALAPPDATA%\THSV StreamBridge`, or replace it with a custom install path without editing or recompiling code.

If a package still fails, copy the exact compiler error and the package version from its `manifest.json`. Adding unrelated assemblies can hide the real incompatibility and makes a creator installation harder to reproduce.

## Accessing arguments in generated and reviewed C#

`args` is a real `Dictionary<string, object>` Streamer.bot populates before `Execute()` runs, but Streamer.bot's own guide is explicit: **do not read or write it with the indexer directly** (`args["x"]`, `args["x"] = y`) — only `CPH.TryGetArg<T>()`, `args.ContainsKey()`, and `args.TryGetValue()` are documented as safe. THSV's generated and reviewed C# (the `Has`/`Read` helpers in wizard-generated commands, `RelayPlatform.cs`, etc.) only ever call `ContainsKey`/`TryGetValue`, matching this guidance.

Argument names are **case-sensitive**. A name that's correct on one platform is not automatically correct on another — see the table below, verified directly against docs.streamer.bot.

## Verified per-platform argument names (chat/command context)

| Purpose | Twitch | YouTube | Kick |
| --- | --- | --- | --- |
| User's display name | `user` | `user` | `user` |
| User's login/handle | `userName` | `userName` | `userName` |
| User's unique ID | `userId` | `userId` | `userId` |
| Broadcaster's display name | `broadcastUser` | — | `broadcastUser` |
| Broadcaster's login/handle | `broadcastUserName` | `broadcastUsername` | `broadcastUsername` |
| Broadcaster's unique ID | `broadcastUserId` | `broadcastUserId` | `broadcastUserId` |

The broadcaster-login field is the one true trap: Twitch capitalizes it `broadcastUserName`, YouTube and Kick lowercase the second word to `broadcastUsername`. Because argument lookups are case-sensitive, a fallback chain that only tries the Twitch spelling silently returns nothing on YouTube and Kick — no error, just an empty string. `broadcasterUserName`, `broadcasterId`, `broadcasterUserId`, and bare `broadcaster` are **not** real Streamer.bot arguments on any platform; they were incorrect guesses in earlier versions of `bridge/core/command-generation.ts` and `packages/streamerbot/native-platform-intake/src/RelayPlatform.cs`, fixed once this was verified against the live docs (both now try `broadcastUserName`, then `broadcastUsername`, then `broadcastUser`, covering all three platforms with real names only).

Command-specific arguments (`commandSource`, `rawInput`, `input0`/`input#`, `commandId`, `commandName`) are documented on the [Command Triggered trigger](https://docs.streamer.bot/api/triggers/core/commands/command-triggered) and are the same across platforms; only the platform-specific identity/broadcaster fields above vary by capitalization.

Official references:

- [Streamer.bot C# code API](https://docs.streamer.bot/api/csharp)
- [Streamer.bot triggers](https://docs.streamer.bot/api/triggers)
- [Streamer.bot C# methods](https://docs.streamer.bot/api/csharp/methods)
- [Set Argument sub-action](https://docs.streamer.bot/api/sub-actions/core/arguments/set-argument)
- [Arguments and variables](https://docs.streamer.bot/api/csharp/guide/variables)
- [TryGetArg](https://docs.streamer.bot/api/csharp/methods/core/arguments/try-get-arg)
- [Command Triggered trigger](https://docs.streamer.bot/api/triggers/core/commands/command-triggered)
- [Twitch Chat Message trigger](https://docs.streamer.bot/api/triggers/twitch/chat/message)
- [YouTube Chat Message trigger](https://docs.streamer.bot/api/triggers/youtube/chat/message)
- [Kick Chat Message trigger](https://docs.streamer.bot/api/triggers/kick/chat/message)
