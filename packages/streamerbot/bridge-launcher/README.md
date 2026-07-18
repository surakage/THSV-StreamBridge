# Bridge Launcher

Two actions: **THSV StreamBridge - Launch Bridge** and **THSV StreamBridge - Shutdown Bridge**.
Import the reviewed `.sb` file, then set up two things in Streamer.bot before enabling either:

1. **Global variable.** Open Streamer.bot's Global Variables panel and add `thsvBridgeInstallPath`
   set to your THSV StreamBridge checkout or install folder (for example
   `F:\The Hidden Sloth Village\THSV StreamBridge`). Both actions read this fresh every time they
   run, so updating the value here is the only thing you ever need to change to point at a
   different machine or folder — no code edit, no separate value to keep in sync between the two
   actions.
2. **Triggers.** Add Streamer.bot's own triggers to each action yourself:
   - **Launch Bridge**: something like "Streamer.bot Started" (Add > look for it in your
     version's trigger list — the exact wording/category varies by build).
   - **Shutdown Bridge**: your platform's own "stream offline" / "stream ended" trigger (for
     example Twitch > Stream Offline).

   This package does not attempt to add either trigger itself: no confirmed schema for a
   Streamer.bot startup trigger exists anywhere in its public documentation, and picking triggers
   from Streamer.bot's own trigger list needs no guess at all.

Once both are set, enable both actions. Streamer.bot launches the bridge on its own startup and
asks it to shut down when your stream ends, instead of either being done by hand.

## What each action does and does not do

**Launch Bridge**
- Reads `thsvBridgeInstallPath` as a persisted global variable (`CPH.GetGlobalVar`) — never
  hardcoded, never edited into the C# source.
- Launches `cmd.exe /c npm run dev` in that folder via `Process.Start`, with a visible console
  window so bridge logs and crashes are visible.
- Does not check whether the bridge is already running before launching. If it is, the new
  process's own HTTP server just fails to bind the port and exits — harmless, and the already
  running instance is untouched.

**Shutdown Bridge**
- Reads the same `thsvBridgeInstallPath` global variable, then reads the control token fresh
  from `data/runtime/control-token` under that folder — never copied into an argument or global
  variable by hand, so it stays correct even if the token is ever regenerated.
- Sends a single authenticated `POST /shutdown` to the bridge's own documented shutdown endpoint
  (`http://127.0.0.1:8787` — the project's default port; edit `DefaultPort` in
  `src/ShutdownBridge.cs` if you run on a different one).
- If the request doesn't reach the bridge, that most likely just means it wasn't running — this
  is logged but does not fail the action, since "make sure it's stopped" is inherently safe to
  run against an already-stopped bridge.

Neither action creates, edits, deletes, enables, disables, or otherwise mutates any other
Streamer.bot object.

## Verification status

Implementation complete; live Streamer.bot Alpha compilation of this exact reviewed source has
not been confirmed. An earlier, less complete version of the launch action (hardcoded install
path, otherwise equivalent `Process.Start` logic) was hand-pasted directly into a Streamer.bot
action and confirmed to compile and run during this project's live testing — this package
generalizes that to a creator-configurable path without changing the parts that were already
proven to work, and adds the shutdown action alongside it, but the exact byte-for-byte source
here has not itself been re-compiled live yet.
