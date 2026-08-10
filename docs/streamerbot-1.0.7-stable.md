# Streamer.bot 1.0.7 stable adoption

Streamer.bot 1.0.7 is the supported baseline for THSV StreamBridge packages. It follows the 1.0.6 Custom Channel Rewards crash fix and restores the expected website-authentication and anonymous update-check behavior. THSV packages do not require a relay or event-contract compatibility shim for this hotfix, but using the fixed stable host avoids failed or misleading update checks during setup.

The upstream release record is available from the [Streamer.bot changelog](https://docs.streamer.bot/changelogs/v1.0.7).

## Upgrade checklist

1. Back up the complete Streamer.bot folder, including actions, commands, settings, and data.
2. Install Streamer.bot 1.0.7 stable or later. If automatic update is unavailable, sign in to the Streamer.bot website or use its official manual download.
3. Start Streamer.bot and confirm **Help > About** reports 1.0.7 or later.
4. Recompile every installed THSV C# action and resolve any compiler error before going live.
5. Re-import the regenerated THSV packages where the wizard reports an older package baseline.
6. Confirm Twitch EventSub chat, Custom Channel Rewards, YouTube, Kick, and TikFinity relay test events reach StreamBridge.
7. Run the wizard connection tests and one simulated alert, chat event, clip request, reward, and timed action.
8. Verify the Streamer.bot update check completes while signed in. If you rely on anonymous checking, verify that path separately.

Automated package, import-cohesion, EventSub-contract, and bridge tests cover the project-side baseline update. A genuine provider event and the installed 1.0.7 host must still be tested locally before recording live-provider acceptance.
