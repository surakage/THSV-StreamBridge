# Bridge Launcher

Import the reviewed `.sb` file, then set up two things in Streamer.bot before enabling the action:

1. **Global variable.** Open Streamer.bot's Global Variables panel and add `thsvBridgeInstallPath`
   set to your THSV StreamBridge checkout or install folder (for example
   `F:\The Hidden Sloth Village\THSV StreamBridge`). No code edit is needed to point this at a
   different machine or folder — the action reads the variable fresh every time it runs.
2. **Trigger.** Add Streamer.bot's own startup trigger to the imported **THSV StreamBridge -
   Launch Bridge** action yourself (Add > look for something like "Streamer.bot Started" in your
   version's trigger list — the exact wording/category varies by build). This package does not
   attempt to add that trigger itself: no confirmed schema for a startup trigger was found
   anywhere in Streamer.bot's public documentation, and picking it from Streamer.bot's own
   trigger list needs no guess at all.

Once both are set, enable the action. Every time Streamer.bot starts, it launches
`npm run dev` in the configured install folder, so the bridge comes up automatically instead of
needing to be started manually first.

## What it does and does not do

- Reads `thsvBridgeInstallPath` as a persisted global variable (`CPH.GetGlobalVar`) — never
  hardcoded, never edited into the C# source.
- Launches `cmd.exe /c npm run dev` in that folder via `Process.Start`, with a visible console
  window so bridge logs and crashes are visible.
- Does not check whether the bridge is already running before launching. If it is, the new
  process's own HTTP server just fails to bind the port and exits — harmless, and the already
  running instance is untouched. This keeps the action simple and avoids needing an extra
  network reference just for a redundant health check.
- Does not create, edit, delete, enable, disable, or otherwise mutate any Streamer.bot object.

## Verification status

Implementation complete; live Streamer.bot Alpha compilation of this exact reviewed source has
not been confirmed. An earlier, less complete version of this same idea (hardcoded install path,
otherwise equivalent `Process.Start` logic) was hand-pasted directly into a Streamer.bot action
and confirmed to compile and run during this project's live testing — this package generalizes
that to a creator-configurable path without any change to the parts that were already proven to
work, but the exact byte-for-byte source here has not itself been re-compiled live yet.
