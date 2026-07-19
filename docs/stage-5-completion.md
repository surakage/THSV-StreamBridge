# Stage 5 completion

Stage 5 is complete on `overhaul/v2-preview` for `2.0.0-preview.1`. Stable `main` and the `1.x` release line remain unchanged.

## Delivered

- **Command sync mirror.** `FileCommandSyncStore` tracks only commands the bridge already has a reason to track (framework packages or wizard-generated) — it never adds an entry for a live command it wasn't already told about. `reconcileCommandSync` matches by Streamer.bot-assigned ID, never name, and reports `in-sync` / `renamed` / `missing`.
- **Tier 1 — live enable/disable.** The reviewed Command Administration package wraps the documented `CPH.EnableCommand`/`CPH.DisableCommand` C# methods, dispatched from the bridge over the already-authenticated `DoAction` WebSocket request. `WizardService.administerCommand` and `POST /wizard/api/commands/administer` expose it, gated by explicit creator approval enforced before a request is even built.
- **Tier 2 — generate-and-verify.** For command creation, which no documented API level supports: `bridge/core/command-generation.ts` validates a batch of designs, checks every one against a fresh live inspection (case-insensitive, against both actions and commands, regardless of ownership, and against the rest of the same batch), and generates one `.sb` package containing an action, a native Command object, and the trigger binding them for every design. `WizardService.generateCommands`/`verifyGeneratedCommands` and `POST /wizard/api/commands/generate`/`/verify` expose it. A command is marked owned or synced only after re-inspection independently confirms the generated ID is actually live.
- **Wizard UI.** A "Command Sync" panel: sync-now, a batch command-design builder (queue several designs, approve once, generate one package), download, and verify-import with per-command drift status. Enable/Disable buttons appear only for tracked commands shown by "Inspect now"; unrelated live commands remain read-only.
- **Post-completion trust hardening.** Enable/Disable is restricted to commands in the persisted
  THSV sync mirror; unrelated live commands remain inspection-only. The design form labels its
  role value as reference metadata, not an enforced Streamer.bot permission. Twitch, YouTube,
  Kick, and TikFinity are explicit creator-controlled switches and imports remain disabled until
  the creator reviews them.
- **Shared export pipeline.** `bridge/services/streamerbot-package-builder.ts` was extracted out of `tools/build-streamerbot-export.ts` so the CLI tool and the wizard's Tier 2 generation share one proven mechanism instead of two. Reproducibility re-verified byte-for-byte across all 9 previously-shipped packages after the extraction and again after later shape corrections.
- **Post-stage command designer upgrade.** The wizard now captures the Streamer.bot action name,
  Twitch/YouTube/Kick command sources, per-platform response text, cooldowns, filtering toggles,
  aliases, and either a generated source-gated response or creator-reviewed C# body. The exported
  native command and action are already bound; primary and alias phrases are stored one per line
  in Streamer.bot's Command(s) field. Imports remain disabled for final creator review. This
  supersedes the older limitations recorded below.

## Dispatch safety

- Streamer.bot remains the sole authoritative store. The sync mirror never becomes a second command database; it only ever updates entries it already tracks.
- Every mutating operation (Tier 1 dispatch, Tier 2 generation) requires explicit creator approval, checked before a request is built.
- Tier 2 collision detection runs immediately before generation against a fresh inspection, never a stale one, and rejects the whole batch if any design collides with live state or with another design in the same batch.
- Generated commands import **disabled and already bound** to their generated action in
  `THSV Bridge - Commands`. Enabling remains a manual creator step, and the wizard never claims a
  generated command is live until it re-inspects and confirms the ID is actually present.
- A base64 package pasted into chat can be corrupted in transit; packages are handed over as files for direct import, not pasted text, after this was observed to fail once.

## Acceptance evidence

- The complete suite passes with 48 files and 266 tests, including the post-completion command-administration trust regressions, followed by lint and typecheck. The original completion pass also verified the build and example configuration.
- **Tier 1 confirmed live:** dispatched a disable request at a real Streamer.bot command over an actual WebSocket connection; a fresh `GetCommands` inspection confirmed `enabled: false`. An enable request afterward confirmed `enabled: true` again.
- **Tier 2 confirmed live, full loop:** designed a command in the wizard, generated a package,
  imported it into a real Streamer.bot instance, enabled it through Streamer.bot's own UI, then
  called the wizard's verify endpoint and confirmed `verified: true`, `driftStatus: "in-sync"`,
  `source: "wizard-generated"`.
- **Command/trigger shape ground truth.** The first generation attempt was rejected by a real Streamer.bot import. Decoding a manually-created command+action export from that same instance revealed the real shape (the binding lives on the action's `triggers` array, not the command; a command's trigger phrase is a single string, not a list) and replaced what had been inferred from Streamer.bot's own out-of-date public documentation.
- Batch generation, sync, and administration were each also live-verified against Streamer.bot test mode for the parts a live instance couldn't exercise directly (HTTP wiring, UI rendering, the never-mark-synced-without-confirmation guarantee under a controlled empty inventory).

## Not built

- Cooldown read/write for Tier 1 — the CPH method signatures were never confident enough to ship a guess, and the live-verification pass that would have confirmed them was scoped to enable/disable only.
- Command deletion remains a manual Streamer.bot step.
- TikTok commands require the creator to assign the generated action to the matching command event
  in TikFinity. TikFinity supplies the user and command arguments; the generated action performs
  the source gate and optional response.

## Next stage

Not yet determined. The original milestone list's post-command-management scope (Browser Overlay Hub, Viewer Identity/Progression, Companion Systems) was narrowed out of the revised core; what comes after Stage 5 is an open decision for the user, not implied by this document.
