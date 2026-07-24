# Native Streamer.bot Trigger Audit (Updated)

This doc captures the newly added native Streamer.bot triggers and where they land in THSV StreamBridge.

## What changed in this update

- Added Streamlabs and Kofi intake actions to Native Platform Intake.
- Expanded trigger allowlists in `packages/streamerbot/native-platform-intake/manifest.json` and `src/RelayPlatform.cs`.
- Extended `bridge/adapters/streamerbot-native-adapter.ts` schema and normalization mappings for new platforms and event families.
- Added tests for mapping + manifest coverage.

## Mapping matrix (source trigger ? normalized event)

| Source trigger | Platform | Normalized event type | Current landing area | Notes |
|---|---|---|---|---|
| `TwitchPowerUpRedemption` | Twitch | `engagement.cheer` | **Main bridge** ? `multi-alerts` (cheer display) | Routed as cheer-like engagement with `quantity` and optional message (`message_effect`). |
| `TwitchGiftPaidUpgrade` | Twitch | `channel.subscription` | **Main bridge** ? `multi-alerts` (subscription display) | Includes `tier` from source trigger. |
| `TwitchPayItForward` | Twitch | `channel.subscription` | **Main bridge** ? `multi-alerts` (subscription display) | Includes `tier`. |
| `TwitchPrimePaidUpgrade` | Twitch | `channel.subscription` | **Main bridge** ? `multi-alerts` (subscription display) | Includes `tier`. |
| `TwitchModiversary` | Twitch | `channel.subscription` | **Main bridge** ? `multi-alerts` (subscription display) | Adds optional `months` + `fromSharedChat` payload fields. |
| `TwitchWatchStreak` | Twitch | `engagement.milestone` | **Main bridge** ? `multi-alerts` milestone | Maps to `metric: "watch-streak"`, `value` from streak count. |
| `TwitchHypeTrainStart` | Twitch | `engagement.milestone` | **Main bridge** ? `multi-alerts` milestone | Preserves hype-train metadata in payload (`hypeTrain*` fields). |
| `TwitchHypeTrainLevelUp` | Twitch | `engagement.milestone` | **Main bridge** ? `multi-alerts` milestone | Preserves hype-train metadata in payload (`hypeTrain*` fields). |
| `TwitchHypeTrainUpdate` | Twitch | `engagement.milestone` | **Main bridge** ? `multi-alerts` milestone | Preserves hype-train metadata in payload (`hypeTrain*` fields). |
| `TwitchHypeTrainEnd` | Twitch | `engagement.milestone` | **Main bridge** ? `multi-alerts` milestone | Preserves hype-train metadata in payload (`hypeTrain*` fields). |
| `TwitchAdRun` | Twitch | `system.custom` | **Not currently mapped** to built-in overlay actions | Available for add-ons/custom scripts (custom action argument stream). |
| `TwitchUpcomingAd` | Twitch | `system.custom` | **Not currently mapped** to built-in overlay actions | Available for add-ons/custom scripts. |
| `YouTubeJewelsGifted` | YouTube | `engagement.gift` | **Main bridge** ? `multi-alerts` (gift display) | Supports gift metadata (`giftUrl`, `altText*`, combo fields, etc). |
| `StreamlabsDonation` | Streamlabs | `engagement.donation` | **Main bridge** ? `multi-alerts` (donation display) | Standard donation mapping. |
| `StreamlabsCharityDonation` | Streamlabs | `engagement.donation` | **Main bridge** ? `multi-alerts` (donation display) | New in this patch. Uses `charityDonationAmount`, `charityDonationCurrency`, `charityDonationMessage`. |
| `StreamlabsMerchandise` | Streamlabs | `system.custom` | **Not currently mapped** to built-in overlay actions | Routed for add-ons/custom scripts. |
| `KofiDonation` | Kofi | `engagement.donation` | **Main bridge** ? `multi-alerts` (donation display) | Includes standard amount/currency/message handling. |
| `KofiCommission` | Kofi | `engagement.donation` | **Main bridge** ? `multi-alerts` (donation display) | Uses donation pipeline. |
| `KofiResubscription` | Kofi | `channel.subscription` | **Main bridge** ? `multi-alerts` (subscription display) | Maps `tier` if provided. |
| `KofiSubscription` | Kofi | `channel.subscription` | **Main bridge** ? `multi-alerts` (subscription display) | Maps `tier` if provided. |
| `KofiShopOrder` | Kofi | `engagement.donation` | **Main bridge** ? `multi-alerts` (donation display) | Supports `itemCount`/`item0` in payload. |

## Files updated

- `bridge/adapters/streamerbot-native-adapter.ts`
- `packages/streamerbot/native-platform-intake/src/RelayPlatform.cs`
- `packages/streamerbot/native-platform-intake/manifest.json`
- `packages/streamerbot/native-platform-intake/README.md`
- `packages/streamerbot/native-platform-intake/THSV-StreamBridge-Native-Platform-Intake-1.0.0.sb`
- `tests/unit/streamerbot-native-adapter.test.ts`
- `tests/unit/native-platform-package-files.test.ts`

## Verification checklist (important)

1. **Manifest + packaging sanity**
   - Inspect `packages/streamerbot/native-platform-intake/manifest.json` trigger contracts include Streamlabs/Kofi entries.
   - Repackage SB if any manifest/c# changes were modified after export:
     - `npm run package:streamerbot -- packages/streamerbot/native-platform-intake`

2. **Automated tests**
   - `npm test -- tests/unit/streamerbot-native-adapter.test.ts tests/unit/native-platform-package-files.test.ts`

3. **Streamer.bot intake wiring check**
   - Import updated `THSV-StreamBridge-Native-Platform-Intake-1.0.0.sb`.
   - Confirm actions exist for:
     - `THSV Streamlabs - Intake`
     - `THSV Kofi - Intake`
     - Existing Twitch/YouTube/Kick actions unchanged.

4. **Runtime sanity checks in Streamer.bot logs**
   - For each tested trigger, you should see successful relay args:
     - `platformRelayValid = True`
     - `platformRelayError` should be empty.

5. **Bridge validation**
   - Confirm event reaches receiver and passes through accepted path with the expected normalized type and payload. If not, trace:
     - `platformRelayError` (intake filter)
     - `streamBridgeEventType` argument on downstream actions

## Cleanup note for future iteration

- `system.custom` payloads are intentionally not shown by built-in overlay modules yet.
- Track any add-ons that should consume these custom streams in the add-on roadmap before enabling production automation for:
  - ad lifecycle (`TwitchAdRun`, `TwitchUpcomingAd`)
  - Streamlabs merchandise
  - any future donation UI customizations for Streamlabs/Kofi-specific merchandising flows
