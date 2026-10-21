# Stage 4 completion

Stage 4 is complete on `overhaul/v2-preview` for `2.0.0-preview.1`. Stable `main` and the `1.x` release line remain unchanged.

## Delivered

- Input providers declare their own legacy runtime capabilities and complete v2 operation-level capability reports. Creator configuration cannot add unsupported behavior.
- The authenticated browser wizard displays provider support, verification state, and limitations alongside platform, input, and output switches.
- Blocker rules have independent display, command, and internal-module scopes with optional platform and actor targeting.
- Exact and contains matches are bounded. Regex is restricted to a conservative safe subset and dangerous patterns are rejected during full configuration validation.
- Wizard imports and exports cover only platform switches and blocker rules. They never include tokens, password-variable names, WebSocket URLs, logging paths, or unrelated configuration.

## Mutation safety

- Streamer.bot remains inspection-only in this stage; its mutation request count remains zero.
- Exactly one configuration draft may hold the mutation lease. A second tab receives a conflict instead of overlapping writes.
- A draft captures the source hash. Commit rereads the file and rejects stale drafts before writing.
- Commit validates the complete candidate, saves the exact pre-write file in the wizard backup directory, atomically replaces the configuration, and immediately rereads and validates it.
- A failed post-write verification restores the pre-commit file and increments a separate rollback counter. Successful writes, rollback writes, active leases, and transaction outcomes are visible in wizard diagnostics.
- Configuration changes are intentionally restart-applied; the wizard states this before and after commit.

## Acceptance evidence

- Unit coverage proves scope separation, provider authority, unsupported-claim rejection, dangerous-regex rejection, single-lease behavior, backup fidelity, safe export, and stale-draft rejection.
- HTTP coverage proves the wizard shell remains locked by default and every wizard API call requires the local bearer token.
- The complete suite passes with 43 files and 180 tests, followed by lint, typecheck, build, and example-configuration validation.

## Next stage

Stage 5 owns Streamer.bot command discovery, collision handling, templates and drafts, documented enable/disable/cooldown operations, action selection, and the approved reviewed-package workflow for creation operations unavailable through the documented API.
