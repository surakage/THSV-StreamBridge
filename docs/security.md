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

Wizard launchers authenticate with the permanent control token only over loopback and request a random 256-bit unlock ticket that expires after 60 seconds. The browser receives that one-use ticket in the URL fragment, removes the fragment before exchange, and cannot reuse it. The permanent token is returned only to the same-origin local wizard tab after a valid exchange; it is never placed in the command line, URL, browser history, logs, configuration exports, or persistent browser storage. Ticket creation requires the permanent bearer token, while ticket exchange requires loopback, the local Host, JSON, and a same-origin browser request when an Origin header is present.

Portable installation also creates `THSV StreamBridge Recovery Key.txt` in the installed folder and applies a current-user-only Windows ACL where supported. The installer reports only that file's path, never its token value. An already-authenticated wizard may download a replacement copy or place the token on the clipboard after an explicit button press; it never stores the token in browser persistent storage. Treat the recovery file and clipboard value like a password and never show either on stream.

Encrypted `.thsv-recovery` bundles use scrypt plus AES-256-GCM and keep configuration, secrets, state, and add-on files inside the authenticated ciphertext. Export briefly stops the Bridge for a consistent snapshot. Restore requires a verified installation, passphrase, exact `RESTORE` confirmation, per-file hash validation, safe relative paths, and transactional rollback. Passphrases are never accepted as command-line arguments or written to disk.

The mock adapter overwrites caller-provided source and simulation metadata, so simulated input cannot masquerade downstream as a genuine platform adapter event. Keep `security.controlTokenFile` in ignored runtime storage and do not share it.

The Browser Overlay Hub WebSocket accepts loopback clients only and broadcasts public projections rather than raw normalized events. Private, system, operator, and command traffic is excluded. Browser assets and the same-origin shared connection worker use a restrictive Content Security Policy, and reviewed JavaScript constructs DOM nodes with `textContent` instead of HTML parsing. The worker reduces duplicate local connections but grants no new network or data access. Avatar and badge resources must use HTTPS; name colors must be validated six-digit hex values.

Viewer identity is opt-in. The bridge strips untrusted viewer IDs and creates them only after validated human identity resolution. Account links are explicit local configuration and are never inferred. Progression state contains pseudonyms, counters, timestamps, and bounded event fingerprints only; it excludes raw account IDs, names, chat text, avatars, and payloads. Simulated events cannot affect production points by default, and money is never converted into points.

Before committing, inspect `git diff --cached` and run a credential scanner suitable for your environment.
