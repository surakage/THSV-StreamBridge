# Viewer command directory

StreamBridge builds viewer and moderator command directories from enabled, healthy first-party add-ons, compatible creator definitions, and enabled command objects inspected from Streamer.bot. Add-on commands register automatically through the existing platform chat intakes after the required StreamBridge restart. Streamer.bot command inventory refreshes at startup, every five minutes, and whenever the Wizard command list is refreshed.

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
6. Share the public HTTPS URL in stream panels. StreamBridge automatically answers both `!commands` and `!command` with this URL on the platform where the viewer invoked it; no Streamer.bot command or trigger is required.

The localhost address works only on the creator's computer. It must not be shared with viewers and StreamBridge does not open an internet-facing port for this feature.

## Moderator access

The public directory deliberately cannot reveal moderator or broadcaster controls. A browser click does not carry the viewer's chat identity or platform role, so a client-side "show moderator commands" button would let every viewer expose those commands.

A remote moderator page therefore requires provider sign-in and a server-side role check for that channel before any moderator catalogue is returned. Until that authenticated handoff is configured, moderator commands remain available only through the authenticated local wizard and are never embedded in the public HTML or JSON.

Streamer.bot's documented `GetCommands` WebSocket response does not include command permission rules. To classify its commands without guessing, place restricted command objects in a group named **Moderator**, **Mods**, **Admin**, **Staff**, **Creator**, or **Broadcaster**. Those commands appear only in the Wizard's protected moderator list. Other enabled Streamer.bot commands appear on the public viewer page. Streamer.bot commands support Twitch, YouTube, and Kick; TikTok commands continue to come from Bridge add-ons and TikFinity intake.

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
