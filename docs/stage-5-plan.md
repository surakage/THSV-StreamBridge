# Stage 5 plan: Streamer.bot command discovery and management

Status: **proposed, not implemented.** This document defines the design before any Stage 5 code
lands, the same way `overhaul-stage-1-audit.md` preceded Stage 2. Nothing in `bridge/`,
`schemas/`, `packages/streamerbot/`, or `wizard/` should be assumed to exist until a
`stage-5-completion.md` replaces this file.

## Guiding principle

**Streamer.bot remains the sole authoritative store for installed commands and actions. The
bridge never becomes a second command database.** Everywhere this plan below looks like the
bridge is "managing" a command, what it is actually doing is either (a) invoking a documented,
already-existing Streamer.bot operation, or (b) reading Streamer.bot's live state and keeping a
local *mirror* of it for the bridge's own multi-platform parsing needs — never inventing a
command's existence independently of Streamer.bot confirming it exists.

This resolves the risk the Stage 1 audit flagged directly: *"current JSON command definitions
are authoritative for bridge parsing, conflicting with the revised rule that Streamer.bot owns
installed commands... A staged read/sync/backup model is required to avoid duplicate
databases and collisions."* Stage 5 is that read/sync/backup model.

## Why the API split matters — read this before implementing anything

Streamer.bot exposes two genuinely different surfaces, and Stage 5 must not conflate them:

1. **The WebSocket API** (what the bridge, an external process, can call directly) — documents
   `GetActions`, `GetCommands`, `DoAction`, and event subscriptions. This is what
   `StreamerBotAdapter.inspectActions()`/`inspectCommands()` already use.
2. **C# command-management methods** (`EnableCommand`, `DisableCommand`, cooldown getters/setters,
   etc.) — these are documented, but as methods callable **from C# code running inside a
   Streamer.bot action**, not as standalone WebSocket requests. The bridge cannot call
   `EnableCommand` directly over the socket the way it calls `GetActions`.

That means "live" command mutation (enable/disable/cooldown) is not a new kind of WebSocket call
— it has to go through a small, reviewed Streamer.bot package, the same way every prior
capability in this project that needed a native API (`CPH.TtsSpeak` in Speaker Orchestration,
companion state in Bloom) went through a package rather than an undocumented direct hook. The
bridge sends a documented `DoAction` request naming that package's action; the package's C# calls
the documented method and reports the result back through validated arguments. **Nothing new is
invented here — this is the exact pattern Milestones 6 and 10 already used, applied to command
administration instead of speech or companion state.**

## Two tiers of capability

### Tier 1 — live, real-time, via a new reviewed package (`command-administration`)
Operations the documented C# API actually supports: enable, disable, read/set cooldown, read
current permission/role gate if Streamer.bot exposes one. A new package, structured exactly like
every other package in this project:
- `packages/streamerbot/command-administration/manifest.json` + `src/ProcessCommandAdministration.cs`
- Triggerless, `Run Action Immediately`-invoked, same as Speaker Orchestration and Bloom.
- Input arguments: `commandAdminOperation` (`enable`/`disable`/`set-cooldown`), `commandAdminCommandId`
  (the Streamer.bot-assigned stable ID, never a name — see collision section), `commandAdminCooldownSeconds`
  (optional), `commandAdminApproved` (boolean, same creator-approval gate Speaker Orchestration
  established — this package must never act without it).
- Output arguments: `commandAdminValid`, `commandAdminHandled`, `commandAdminResult`, mirroring the
  `InitializeOutputs()`-first pattern every prior package uses so a rejected request can never
  leave a stale successful-looking output.
- The bridge invokes it via `DoAction`, the same documented request the existing `StreamerBotAdapter.sendEvent()`
  already uses for delivery — no new WebSocket surface needed on the bridge side.

### Tier 2 — generate-and-verify, for anything the documented API doesn't support
Command *creation*, response-template *editing*, and *deletion* aren't in the documented API at
any level, C# or WebSocket. Do not work around that. Instead:
1. The wizard lets the creator design a command (name, aliases, prefix override, plain-text
   response template, cooldown, minimum role, platform targeting) using the same shape
   `bridge/core/multi-commands.ts` and `schemas/config.ts`'s `commandsSchema` already define.
2. The wizard checks it against a fresh live inspection (see collision section) before generating
   anything.
3. The wizard generates a `.sb` package through the **same `tools/build-streamerbot-export.ts`
   pipeline every existing package already uses** — deterministic `stableUuid()` IDs, reproducible
   source, no new export mechanism to build or trust.
4. The creator imports it through Streamer.bot's own native Import UI — the exact step every
   setup doc in this project already walks them through.
5. The wizard **never marks the command as owned or synced until it re-inspects and confirms the
   generated ID is actually present.** A generated-but-not-yet-imported package is not a command
   that exists.

## Data model

### New contracts (`bridge/contracts/v2/`)
- `command-sync.ts`: `SyncedCommand { streamerBotId, name, aliases, lastSeenAt, source: 'framework' | 'wizard-generated', driftStatus: 'in-sync' | 'renamed' | 'missing' }`.
- Extend `module-manifest.ts`'s pattern for a **runtime, persisted** ownership entry distinct from
  the existing `PACKAGE_OWNERSHIP` constant in `wizard-service.ts`. `PACKAGE_OWNERSHIP` is
  compile-time, hardcoded, and correct for the framework's own packages — it must **not** be
  where wizard-generated command IDs get added, since those are created at runtime, per
  installation, per creator. Those need their own persisted store (see below), checked
  separately from `PACKAGE_OWNERSHIP` in `isOwned()`.

### New store: `bridge/services/command-sync-store.ts`
Same shape as every other store in this project (`viewer-progression-store.ts`,
`companion-store.ts`): atomic file writes via the existing `writeJsonAtomic`, a `Noop`
implementation for tests, load-failure handling that degrades the *command sync feature only* —
not the whole bridge (this is the exact fault-isolation pattern already fixed for viewer
progression and companion in an earlier pass; Stage 5 must apply it from the start, not retrofit
it after an incident). File: `data/state/command-sync.json`.

### `schemas/config.ts` changes
`commandsSchema.definitions` currently means "creator hand-typed these." Stage 5 needs to
distinguish that from "the wizard synced these from Streamer.bot" without breaking existing
configs (Milestone 4/9's hand-authored definitions must keep working — Stage 5 is additive, not
a breaking migration). Add an optional `source: z.enum(['manual', 'synced']).default('manual')`
per definition, defaulting existing/hand-written entries to `'manual'` so nothing already deployed
changes behavior. Synced entries get overwritten on each sync pass; manual entries never do.

## Collision detection — runs before generation, not after

Before staging a Tier 2 generation:
1. Inspect live (`GetCommands`, already-proven code path).
2. Reject if the proposed name or any alias matches an existing command's name/alias, **regardless
   of whether the bridge owns it** — a collision against a creator's own command is exactly as
   invalid as a collision against another framework command.
3. Reject if the proposed name or alias case-insensitively collides with an existing one — a
   case-only difference is not a safe distinguishing factor in chat.
4. Surface the specific colliding object (name + ID) to the creator rather than a generic error,
   so they can rename and retry without guessing what conflicted.

This reuses `filtersSchema`'s and `commandsSchema`'s existing duplicate-ID `superRefine` pattern —
no new validation architecture, just applied against live Streamer.bot state instead of only the
local config.

## Drift detection — runs on every inspection, not just at generation time

A creator can rename or delete a command directly in Streamer.bot at any time — that's normal,
expected, and must never be treated as corruption. On every `GetCommands` inspection:
- An ID present in `command-sync.json` but absent from the live result → mark `driftStatus: 'missing'`.
  Never keep parsing chat for a command that's gone. Offer removal of the local mirror entry;
  never remove it silently.
- An ID present in both but with a different name → mark `driftStatus: 'renamed'`, update the
  mirrored name. The stable ID is authoritative, never the name — this is exactly what already
  makes Stage 3's ownership registry correct (`isOwned()` matches on ID *and* name together for
  framework packages, but for synced entries the ID alone must be sufficient to follow a rename,
  or every rename would look like a deletion followed by an unrelated new command).
- A `source: 'wizard-generated'` ID that reappears after being marked missing → treat as a new,
  unverified object requiring re-confirmation, not an automatic re-link — a creator could have
  reused a name for something unrelated.

## Wizard UI

A new `Commands` panel, matching the existing `Platforms`/`Blockers` panel pattern:
- Synced command list with drift badges (`in-sync` / `renamed` / `missing`), a `Sync now` button
  that re-runs inspection and reports what changed — modeled directly on `Streamer.bot inventory`'s
  existing `Inspect now` button and its `role="status" aria-live="polite"` result region.
- Tier 1 controls (enable/disable/cooldown) inline per synced row, dispatched through the
  transaction/lease model Stage 4 already built (`begin` → `stage` → `commit`, single lease,
  source-hash staleness check) so two tabs can't race a command mutation the same way they can't
  race a config mutation today.
- A `Design a command` form for Tier 2: the same fields as the existing filter-rule form's
  conventions (accessible labels, `maxlength` bounds, a live collision check before the generate
  button enables), producing a downloadable `.sb` file plus a `Verify import` button that re-runs
  inspection and only then marks the entry synced.

## Explicit non-goals

- No response-template logic beyond a single plain-text (or simple placeholder-substitution)
  response body. Multi-sub-action chains, conditional branching, and anything requiring
  Streamer.bot's own action editor stay in Streamer.bot's own action editor — this project is not
  rebuilding it, per the standing rule from Stage 1.
- No attempt to call C# command-management methods from the bridge directly. Every Tier 1
  operation goes through the reviewed package.
- No automatic re-linking of a `missing` synced command if a same-named object reappears later.

## Test scenarios (mapped to what was asked for)

| Scenario | Where it's covered |
|---|---|
| Duplicate command / Alias collision / Case-only collision | Collision detection, pre-generation, case-insensitive |
| Invalid prefix / Empty command / Unicode command / Long command | Reuses `commandsSchema`'s existing `commandNameSchema`/prefix validation — Stage 5 adds no new name grammar |
| Missing action / Renamed action / Deleted action | Drift detection on every inspection, ID-first matching |
| User-modified framework command | Ownership check still requires exact ID **and** name; a creator-edited name on a framework-owned ID surfaces as `renamed` drift, not silent re-ownership |
| Partial save failure | Reuses `WizardConfigurationGateway`'s existing backup-before-write, verify-after-write, auto-rollback path |
| Streamer.bot unavailable during save | Tier 1 actions fail closed via the existing `sendInspectionRequest`/`DoAction` unavailable-error path; Tier 2 generation doesn't require a live connection at all (it's local file generation) — only *verification* does, and verification correctly reports "unavailable," never "failed" |
| Command created twice | Prevented by collision detection before generation; if a duplicate `.sb` is imported anyway, Streamer.bot's own import behavior governs, and the next sync surfaces it as an unexpected duplicate ID for the creator to resolve manually |
| Wizard restart | All sync/ownership state is file-persisted (`command-sync-store.ts`), not in-memory-only — a restart re-reads it, same guarantee `viewer-progression`/`companion` state already has |
| Platform-specific unsupported response | Deferred to the existing capability-report mechanism from Stage 4 — a platform lacking `chatOutput` simply can't be selected as a response target, enforced the same way `AdapterRegistry` already rejects unsupported capability claims |
| Cooldown bypass between platforms | Tier 1 cooldown operations key on the Streamer.bot-side command ID, which is already platform-neutral by construction — no per-platform cooldown state to desync in the first place |

## Open questions before implementation starts

1. Does `GetCommands`' response include enough fields to distinguish "renamed" from "deleted +
   unrelated new command with a different ID"? Needs a live check against the actual installed
   Alpha build, the same way every prior package's assumptions were live-verified, not assumed.
2. Exact list of C# command-management methods available for the Tier 1 package's `EnableCommand`/
   `DisableCommand`/cooldown calls — confirm signatures against the live Alpha build before writing
   `ProcessCommandAdministration.cs`, the same compile-then-verify discipline every prior package
   used.
3. Whether `command-sync.json` should be included in the existing backup script's file list
   (almost certainly yes, matching `viewer-progression.json`/`companion.json`) — trivial, but
   worth stating explicitly rather than discovering it missing later.

## Suggested build order

1. Contracts + `command-sync-store.ts` + schema `source` field — no behavior change yet, matches
   Stage 2A's "contracts before code" discipline.
2. Tier 1 package + live enable/disable/cooldown, since it's the smaller, fully-documented-API
   surface and proves the `DoAction`-wrapped-C#-method pattern works before Tier 2 depends on it.
3. Inspection-based sync + drift detection, independent of Tier 2, and immediately useful on its
   own (a creator can see drift even before any generation feature exists).
4. Collision detection + Tier 2 generation + verify-after-import loop, last, since it's the
   riskiest and most novel piece and benefits most from 1–3 already being tested and stable.

Each step should land with its own full quality gate pass (lint, typecheck, test, build), matching
every prior stage in this project — no stage in this series has ever been merged as one large,
untested change, and Stage 5 shouldn't be the first.
