# Security

- Services bind to `127.0.0.1` by default.
- JSON input is size-limited and schema-validated.
- Unknown event and configuration fields are rejected.
- Raw payload retention is disabled by default.
- Logs redact likely credentials, authorization data, cookies, and raw payload fields.
- State files use atomic replacement and restrictive file modes where supported.
- No event data is passed to a shell.
- HTTP routes are fixed and do not accept file paths.
- Credentials and runtime data are ignored by Git.

The `/simulate` route is a local development interface without authentication. Do not expose the bridge to a network without adding appropriate authentication and authorization.

Before committing, inspect `git diff --cached` and run a credential scanner suitable for your environment.
