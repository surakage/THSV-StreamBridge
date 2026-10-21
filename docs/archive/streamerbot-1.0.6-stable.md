# Streamer.bot 1.0.6 stable adoption

Streamer.bot 1.0.6 is a critical hotfix for the Twitch Custom Channel Rewards crash in 1.0.5. THSV StreamBridge 3.5.0 therefore uses `1.0.6` as the minimum for every regenerated Streamer.bot package and wizard-generated command package.

The upstream release record is expected at the [Streamer.bot 1.0.6 changelog](https://docs.streamer.bot/changelogs/v1.0.6). At the time this adoption record was updated, the official changelog index had not yet surfaced the hotfix entry.

## Compatibility impact

- No THSV schema, relay, trigger, or C# API migration is required beyond the 1.0.5 EventSub work.
- The 1.0.6 fix is directly relevant to THSV packages that inspect, enable, disable, create, or settle Twitch Custom Channel Rewards.
- Streamer.bot 1.0.5 remains documented as the release that removed the legacy Twitch WebSocket `message` object. THSV Native Platform Intake continues to use flat EventSub action arguments.
- Existing creator data and THSV add-on settings do not need migration.

## Upgrade checklist

1. Close Streamer.bot and back up its complete application folder.
2. Install Streamer.bot 1.0.6 stable or later without deleting the previous working backup.
3. Start Streamer.bot and confirm **Help > About** reports 1.0.6 or later.
4. Import the regenerated THSV 3.5.0 packages you use.
5. Open every imported Execute C# Code sub-action and select **Save and Compile**.
6. Refresh Twitch broadcaster and bot authentication if Streamer.bot requests updated scopes.
7. Test one real custom reward redemption and verify Streamer.bot remains stable, the THSV intake runs once, and settlement completes exactly once.
8. Repeat the normal Twitch chat, multichat, alert, timed-message, Raid Scout, and add-on control checks.
9. Record simulated and genuine-provider results separately in the wizard acceptance ledger.

## Evidence status

Automated THSV package, import-cohesion, EventSub-contract, and bridge tests cover the project-side update. The actual 1.0.6 host and genuine Twitch Custom Channel Reward flow must still be creator-tested before recording live provider acceptance.
