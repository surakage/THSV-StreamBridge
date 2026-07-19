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

Official references:

- [Streamer.bot C# code API](https://docs.streamer.bot/api/csharp)
- [Streamer.bot triggers](https://docs.streamer.bot/api/triggers)
- [Streamer.bot C# methods](https://docs.streamer.bot/api/csharp/methods)
- [Set Argument sub-action](https://docs.streamer.bot/api/sub-actions/core/arguments/set-argument)
- [Arguments and variables](https://docs.streamer.bot/api/csharp/guide/variables)
- [TryGetArg](https://docs.streamer.bot/api/csharp/methods/core/arguments/try-get-arg)
