# Streamer.bot 1.0.5 stable adoption

> Historical baseline: Streamer.bot 1.0.6 supersedes this release with a critical Twitch Custom Channel Rewards crash fix. New THSV installations and regenerated imports require 1.0.6 or later. See the [1.0.6 adoption checklist](streamerbot-1.0.6-stable.md).

Streamer.bot 1.0.5 became stable on August 6, 2026. THSV StreamBridge 3.5.0 now uses `1.0.5` as the minimum for every regenerated Streamer.bot package and for wizard-generated command packages.

The authoritative upstream record is the [Streamer.bot 1.0.5 changelog](https://docs.streamer.bot/changelogs/v1.0.5).

## Compatibility impact

- Twitch chat is fully EventSub. The legacy WebSocket `message` object was removed.
- THSV Native Platform Intake does not read that object. It reads the documented flat action arguments, including `message`, `messageId`, user identity, badges, role flags, reply fields, and Streamer.bot's internally maintained `firstMessage` flag.
- Streamer.bot's HTTP, WebSocket, custom WebSocket, and Stream Deck servers moved to Kestrel. THSV uses the normal local WebSocket contract and does not require `netsh`, a websocket-sharp extension, or a compression-specific workaround.
- YouTube Jewels Gifted is already included in the THSV YouTube intake and normalized alert path.
- The updated save routines are host-internal. THSV keeps its own bounded files and atomic writes; no data migration is required in StreamBridge.

## Upgrade checklist

1. Back up the complete Streamer.bot folder while Streamer.bot is closed.
2. Install Streamer.bot 1.0.5 stable without deleting the previous working backup.
3. Import the regenerated THSV 3.5.0 packages you use.
4. Open every imported Execute C# Code sub-action and select **Save and Compile**.
5. Confirm the Twitch Intake action still has **Twitch > Chat > Message** and the other documented Twitch EventSub triggers, with no legacy IRC trigger.
6. Send one genuine Twitch chat message and verify Action History contains flat `message`, `messageId`, `userId`, `userName`, and broadcaster arguments.
7. Repeat one genuine YouTube, Kick, and TikFinity relay for each connected platform.
8. Verify the Multichat dock, alerts, timed messages, reward settlement, raids, and any state-changing add-on controls you use.
9. Record simulated and genuine-provider results separately in the wizard acceptance ledger.

## Evidence status

Source inspection and automated package tests confirm the THSV contract does not depend on the removed legacy Twitch message object. Historical alpha and beta live results remain recorded in their original documents. Stable 1.0.5 should not be marked fully provider-accepted for a creator installation until the checklist above is completed on that installed host.
