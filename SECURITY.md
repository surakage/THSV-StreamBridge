# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

1. Open the repository's **Security** tab and select **Report a vulnerability** (GitHub private vulnerability reporting).
2. Describe what you found, the StreamBridge version, and the steps to reproduce it.

Do not include real tokens, recovery keys, webhook links or stream keys in a report. If a report needs a log, use the support bundle from the wizard's **Diagnostics** page: it removes secrets for you.

You should get a first reply within a week. Fixes ship in a normal release, and the advisory is published once creators have had time to update.

## Supported versions

Only the latest release gets security fixes. The wizard checks for updates automatically and installs them with one click.

## How StreamBridge protects you

StreamBridge runs only on your own PC and only listens on `127.0.0.1`. It never asks for platform passwords. The wizard is locked with a private control token, and add-ons can only run Streamer.bot actions you have approved. The full design is in [docs/security.md](docs/security.md).
