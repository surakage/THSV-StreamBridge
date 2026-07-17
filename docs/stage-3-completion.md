# Stage 3 completion

Stage 3 is complete on `overhaul/v2-preview` for `2.0.0-preview.1`. Stable `main` and its `1.x` releases remain unchanged.

## Authenticated local wizard

- The wizard shell is served only by the bridge at `/wizard/`; management APIs require the existing installation control token and loopback access.
- The browser keeps the token only in JavaScript memory for the current tab. It is not placed in the URL, cookies, local storage, or logs.
- Same-origin browser requests are accepted without weakening the configurable cross-origin allowlist. Security headers deny framing, external scripts, external connections, forms, and base-URL rewriting.
- Overview, Streamer.bot inventory, ownership, diagnostics, lock, and cancellation surfaces use ordinary accessible HTML controls.

## Read-only Streamer.bot inspection

- The existing authenticated Streamer.bot WebSocket is reused; the wizard opens no second socket.
- Inspection sends exactly the documented `GetActions` and `GetCommands` requests and keeps a bounded audit of those request names and timestamps.
- Response data is reduced to action/command summaries. Malformed responses fail closed with a readable unavailable result.
- The wizard provides no create, edit, delete, enable, disable, execute, subscription, cooldown, or other mutation request.

## Ownership and safe cancellation

- The ownership registry is seeded from reviewed package manifests. An inspected action is owned only when its exact stable ID and exact package name both match.
- Similar names, copied actions, creator commands, and unknown IDs remain creator-owned and untouched.
- Stage 3 transactions are intentionally empty drafts. Cancellation changes the draft to `cancelled` and clears staged changes. There is no commit route and therefore no partial Streamer.bot mutation to recover.
- Diagnostics report the two supported read requests and an invariant mutation request count of zero.

## Streamer.bot launcher

- `THSV StreamBridge - Setup Wizard Launcher` is a reviewed, reproducible `.sb` package with author and description metadata.
- It opens only the loopback wizard URL and never passes a token or credential in the URL.
- A non-default bridge port can be opened manually until configuration writes are introduced in an approved later stage.

## Acceptance evidence

- Unit tests cover exact-match ownership, creator-object non-ownership, read-only diagnostics, transaction cancellation, unknown transaction rejection, launcher contents, metadata, and reproducible source embedding.
- HTTP integration tests cover the public locked shell, token rejection, authenticated same-origin API use, documented inspection reads, CSP, and rollback.
- Streamer.bot WebSocket integration tests verify the exact request sequence is `GetActions`, `GetCommands` and that response data is returned without any mutation request.
