# Security

- Services bind to `127.0.0.1` by default.
- JSON input is wire-size-limited and schema-validated.
- Unknown event and configuration fields are rejected.
- Raw payload retention is disabled by default.
- Logs redact likely credential keys, common inline credential patterns, and registered runtime secret values in fields, messages, and errors.
- State files use atomic replacement and restrictive file modes where supported.
- No event data is passed to a shell.
- HTTP routes are fixed and do not accept file paths.
- Credentials and runtime data are ignored by Git.

Mutable `/simulate`, `/shutdown`, and `/timed-actions/start|stop|pause|resume` requests are loopback-only and require a constant-time-checked bearer control token. Browser Origins are denied unless explicitly allowlisted; simulation additionally requires `application/json`. Rate and concurrency limits protect the local control surface and output queues/pending acknowledgements are separately bounded.

The mock adapter overwrites caller-provided source and simulation metadata, so simulated input cannot masquerade downstream as a genuine platform adapter event. Keep `security.controlTokenFile` in ignored runtime storage and do not share it.

The Browser Overlay Hub WebSocket accepts loopback clients only and broadcasts public projections rather than raw normalized events. Private, system, operator, and command traffic is excluded. Browser assets and the same-origin shared connection worker use a restrictive Content Security Policy, and reviewed JavaScript constructs DOM nodes with `textContent` instead of HTML parsing. The worker reduces duplicate local connections but grants no new network or data access. Avatar and badge resources must use HTTPS; name colors must be validated six-digit hex values.

Before committing, inspect `git diff --cached` and run a credential scanner suitable for your environment.
