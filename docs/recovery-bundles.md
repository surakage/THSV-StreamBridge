# Encrypted recovery bundles

An encrypted recovery bundle is the portable disaster-recovery copy of creator-owned StreamBridge data. It includes configuration, persistent state, private control data, installed add-on packages, and add-on state. It intentionally excludes logs, caches, downloaded release files, and application/runtime files that should come from a verified GitHub release.

Use `Create THSV Recovery Bundle.cmd` in the installed StreamBridge folder. StreamBridge stops briefly for a consistent snapshot, prompts twice for a passphrase of at least 12 characters, writes a timestamped `.thsv-recovery` file to Downloads, and restarts. The passphrase is accepted only through a temporary process environment variable; it is not accepted on the command line or stored in the bundle.

The bundle uses scrypt key derivation and AES-256-GCM authenticated encryption. File paths, sizes, hashes, and content remain inside the encrypted payload. The visible envelope contains only the format identity, encryption parameters, creation time, aggregate counts, and a plaintext integrity digest that is itself protected by the GCM authentication tag.

To recover onto a verified installation:

1. Install the same or newer verified StreamBridge release.
2. Run `Restore THSV Recovery Bundle.cmd` from its installed folder.
3. Enter the bundle passphrase and full bundle path.
4. Type the exact `RESTORE` confirmation.
5. Let the launcher stop StreamBridge, authenticate and verify every bundled file, transactionally replace only the persistent recovery roots, refresh the local recovery-key file, and restart the Wizard.

Restore never follows symbolic links, rejects absolute and parent-traversal paths, caps file count and size, verifies every plaintext SHA-256 before replacement, and rolls back replaced roots if activation fails. A successful restore records `data/backups/recovery-restore-latest.json` without storing the passphrase.

Losing the passphrase makes the encrypted bundle unrecoverable. Store the bundle and passphrase separately, and never display either on stream.
