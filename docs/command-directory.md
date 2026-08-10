# Viewer command directory

StreamBridge builds one effective command directory from enabled, healthy first-party add-ons and any compatible legacy creator definitions already present in configuration. Add-on commands register automatically through the existing platform chat intakes after the required StreamBridge restart.

Creator-authored definitions take precedence. If an add-on requests the same command name or alias, that conflicting add-on command is skipped and reported in bridge diagnostics instead of silently overriding the creator's command.

## What viewers can see

The directory includes only:

- the command and any public aliases;
- a short usage example and description;
- its category and supported platforms;
- viewer or subscriber access declared by the owning add-on.

Moderator, broadcaster, reset, approval, deletion, and other creator-control commands are hidden. The directory never serializes add-on settings, viewer identities, chat history, points, webhooks, API credentials, control tokens, connection URLs, or runtime state.

## Preview and publish

1. Open the authenticated wizard and select **Commands**.
2. Expand **Available viewer commands**.
3. Select **Open local preview** to inspect the current page at `http://127.0.0.1:8787/commands`.
4. If hosted publishing is configured, select **Publish now**, then copy the public viewer URL.
5. Otherwise, use **Manual local export** to download a standalone HTML file for a host you control.
6. Use the public HTTPS URL in the `!commands` response and in stream panels.

The localhost address works only on the creator's computer. It must not be shared with viewers and StreamBridge does not open an internet-facing port for this feature.

## SlothBloom hosted publishing

Hosted publishing is opt-in and makes one bounded HTTPS request when StreamBridge starts. It does not add another WebSocket connection and viewer page visits never reach the local bridge.

Set these environment variables for the StreamBridge process:

- `THSV_COMMAND_DIRECTORY_PUBLISH_URL`: the assigned API URL, such as `https://www.slothbloom.com/api/commands/creator-name`;
- `THSV_COMMAND_DIRECTORY_PUBLISH_TOKEN_FILE`: a local file containing the creator-specific raw publish token.

The raw token must be 32-256 characters and must stay in creator-private storage. The website stores only its SHA-256 hash. StreamBridge refuses non-HTTPS endpoints except loopback development URLs, rejects redirects, times out after ten seconds, and never includes the token in catalogue data or status responses.

The wizard can publish again or explicitly remove the hosted page. Removing it does not change local commands.

## Hosting integration contract

`GET /commands/catalog.json` returns the same privacy-safe catalogue as JSON. It includes a SHA-256 `catalogHash`; the hosted publisher skips rewriting unchanged catalogues. The route contains no secret and is reachable only where the creator has deliberately made the bridge available. SlothBloom publishing is outbound from the creator's bridge; it never opens inbound internet access to the local bridge.

Each creator's hosted page should use a unique non-secret slug. The catalogue content remains isolated per creator and depends only on that creator's installed/enabled modules and committed command configuration.
