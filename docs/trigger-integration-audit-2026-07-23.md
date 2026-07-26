# Native Streamer.bot Trigger Audit (Updated)

This doc captures the newly added native Streamer.bot triggers and where they land in THSV StreamBridge.

## What changed in this update

- Added Streamlabs and Kofi intake actions to Native Platform Intake.
- Expanded trigger allowlists in `packages/streamerbot/native-platform-intake/manifest.json` and `src/RelayPlatform.cs`.
- Extended `bridge/adapters/streamerbot-native-adapter.ts` schema and normalization mappings for new platforms and event families.
- Added tests for mapping + manifest coverage.

## Mapping matrix (source trigger → normalized event)

| Source trigger | Platform | Normalized event type | Current landing area | Notes |
|---|---|---|---|---|
| `TwitchPowerUpRedemption` | Twitch | `engagement.cheer` | **Main bridge** → `multi-alerts` (Power-Up card) | Tracks Bits, Power-Up type, global/user counters, temporary counters, and timestamp when supplied. Missing provider IDs remain visibly unverified. |
| `TwitchGiftPaidUpgrade` | Twitch | `channel.subscription` | **Main bridge** → `multi-alerts` (upgrade display) | Sets `subscriptionKind: upgrade`; tier remains optional because the captured trigger did not always supply it. |
| `TwitchPayItForward` | Twitch | `channel.gift-subscription` | **Main bridge** → `multi-alerts` (single gift-sub display) | Correctly represents one paid-forward gift rather than a new subscription for the actor. |
| `TwitchPrimePaidUpgrade` | Twitch | `channel.subscription` | **Main bridge** → `multi-alerts` (upgrade display) | Sets `subscriptionKind: upgrade`; tier remains optional. |
| `TwitchModiversary` | Twitch | `engagement.milestone` | **Main bridge** → `multi-alerts` (Modiversary card) | Tracks the month count and shared-chat origin without mislabeling the event as a paid subscription. |
| `TwitchWatchStreak` | Twitch | `engagement.milestone` | **Main bridge** → `multi-alerts` milestone | Maps to `metric: "watch-streak"`, `value` from streak count. |
| `TwitchHypeTrainStart` | Twitch | `engagement.milestone` | **Main bridge** → `multi-alerts` milestone | Preserves hype-train metadata in payload (`hypeTrain*` fields). |
| `TwitchHypeTrainLevelUp` | Twitch | `engagement.milestone` | **Main bridge** → `multi-alerts` milestone | Preserves hype-train metadata in payload (`hypeTrain*` fields). |
| `TwitchHypeTrainUpdate` | Twitch | `engagement.milestone` | **Main bridge** → `multi-alerts` milestone | Preserves hype-train metadata in payload (`hypeTrain*` fields). |
| `TwitchHypeTrainEnd` | Twitch | `engagement.milestone` | **Main bridge** → `multi-alerts` milestone | Preserves hype-train metadata in payload (`hypeTrain*` fields). |
| `TwitchAdRun` | Twitch | `system.custom` | **Addon/custom action** (not built-in overlays) | Routed with `adLengthMs`/`adScheduled`; best for ad-status alerts or scene automations. |
| `TwitchUpcomingAd` | Twitch | `system.custom` | **Addon/custom action** (not built-in overlays) | Routed with `minutes`/`nextAdAt`/`snoozesLeft`/`adLength`. |
| `YouTubeJewelsGifted` | YouTube | `engagement.gift` | **Main bridge** → `multi-alerts` (Jewels card) | Reads the captured dotted variables exactly: `gift.jewelsAmount`, `gift.name`, `gift.url`, duration, alt text, visual-effect and combo fields. |
| `StreamlabsDonation` | Streamlabs | `engagement.donation` | **Main bridge** → `multi-alerts` (donation display) | Standard donation mapping. |
| `StreamlabsMerchandise` | Streamlabs | `engagement.purchase` | **Main bridge** → `multi-alerts` (purchase card) | Tracks buyer, product, message, image URL and quantity without pretending the purchase was a donation. |
| `StreamlabsCharityDonation` | Streamlabs | `engagement.donation` | **Main bridge** → `multi-alerts` (donation display) | Uses `charityDonationAmount`, `charityDonationCurrency`, `charityDonationMessage`. |
| `KofiDonation` | Kofi | `engagement.donation` | **Main bridge** → `multi-alerts` (donation display) | Includes standard amount/currency/message handling. |
| `KofiCommission` | Kofi | `engagement.donation` | **Main bridge** → `multi-alerts` (donation display) | Uses donation pipeline. |
| `KofiResubscription` | Kofi | `channel.subscription` | **Main bridge** → `multi-alerts` (renewal display) | Retains tier, amount, currency, message, timestamp, public flag, and `subscriptionKind: renewal`. |
| `KofiSubscription` | Kofi | `channel.subscription` | **Main bridge** → `multi-alerts` (new subscription display) | Retains tier, amount, currency, message, timestamp, public flag, and `subscriptionKind: new`. |
| `KofiShopOrder` | Kofi | `engagement.purchase` | **Main bridge** → `multi-alerts` (purchase card) | Tracks amount, currency, message, item count, and every available `itemN` value (bounded to 100). |

## Files updated

- `bridge/adapters/streamerbot-native-adapter.ts`
- `packages/streamerbot/native-platform-intake/src/RelayPlatform.cs`
- `packages/streamerbot/native-platform-intake/manifest.json`
- `packages/streamerbot/native-platform-intake/README.md`
- `packages/streamerbot/native-platform-intake/THSV-StreamBridge-Native-Platform-Intake-1.0.0.sb`
- `packages/streamerbot/core-receiver/src/ReceiveEvent.cs`
- `packages/streamerbot/multi-alerts/src/ProcessAlert.cs`
- `bridge/core/multi-alerts.ts`
- `bridge/core/browser-overlay.ts`
- `overlays/browser/app.js`
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

## Complete trigger families represented in this update

- **Twitch:** subscription + cheer + gifts + milestone + ads + watch streak.
- **YouTube:** gift equivalent (`YouTubeJewelsGifted`) now normalized as `engagement.gift`.
- **Kofi:** donation, commission, subscription, resubscription, shop-order (all normalized as donation/subscription).
- **Streamlabs:** donation, charity donation, merchandise.

## Routing guidance

- **Main bridge / built-in modules**: public viewer events normalized as subscriptions, gifts, donations, purchases, cheers, raids, and milestones flow through Multi-Alerts and the browser overlay. They are not injected into public chat automatically.
- **Addon/custom routes**: `system.custom` events are intentionally kept for add-ons/custom scripts, until we design a first-class overlay card for those event classes.

## Existing add-on routing audit

| Event family | Existing add-on behavior | Decision |
|---|---|---|
| YouTube Jewels (`engagement.gift`) | Subathon Timer already subscribes to normalized gifts. | Eligible for the creator's configured gift-time rule. Combo and Jewel metadata remains available to alerts; the timer should use only its bounded configured award calculation. |
| Twitch/Kofi subscriptions (`channel.subscription`) | Subathon Timer already subscribes to subscriptions. | Eligible for configured subscription time. `subscriptionKind` distinguishes new, renewal, and upgrade for future per-kind controls. |
| Twitch Pay It Forward (`channel.gift-subscription`) | Subathon Timer already subscribes to gifted subscriptions. | Eligible for the existing gifted-sub rule with quantity `1`. |
| Modiversary, watch streak, and Hype Train (`engagement.milestone`) | Subathon Timer subscribes to milestones. | Keep opt-in and metric-specific. A generic milestone must not add time unless its metric is explicitly configured. |
| Streamlabs/Kofi donations (`engagement.donation`) | Subathon Timer 1.2 subscribes to normalized donations. | Creator-controlled and disabled by default. The configured three-letter currency must match, no conversion is inferred, and stable provider IDs are required by default. |
| Streamlabs merchandise and Kofi shop orders (`engagement.purchase`) | Subathon Timer 1.2 subscribes to normalized purchases. | Creator-controlled and disabled by default. Purchases never change the timer implicitly during an upgrade. |
| Twitch cheers and Custom Power-Ups (`engagement.cheer`) | Subathon Timer 1.2 accumulates Bits in bounded session state. | A configurable Bits threshold prevents one award per Bit and records each completed threshold only once. The award defaults to 0 until enabled. |
| Twitch ad lifecycle (`system.custom`) | Subathon Timer currently receives custom events for its controller surface. | Intake code must continue to require a recognized timer-control operation; ad events remain ignored. Best future home is scene automation/operator status. |
| Power-Ups, Jewels, Hype Train, watch streak, and Modiversary | No progression add-on is currently installed in this checkout. | Preserve their verified source metadata now; award points only after a separate creator-configurable progression policy is implemented. |

The repository currently contains one executable add-on under `packages/addons`: Subathon Timer. Its 1.2 rules now cover gifts/Jewels, subscriptions, gifted subscriptions, Bits/Power-Ups, optional verified financial events, and metric-specific milestones. The remaining destinations above are planning decisions, not claims that another installed add-on already consumes the events.

## Cleanup note for future iteration

- `system.custom` payloads are intentionally not shown by built-in overlay modules. Twitch ad lifecycle remains operator automation data so an upcoming ad cannot spam the public alert overlay.
- Track any add-ons that should consume these custom streams in the add-on roadmap before enabling production automation for:
  - ad lifecycle (`TwitchAdRun`, `TwitchUpcomingAd`)
  - any future donation UI customizations for Streamlabs/Kofi-specific merchandising flows

## Streamer.bot 1.0.5 impact and deferred integrations

- **Required now:** reimport Native Platform Intake, Core Receiver, and Multi-Alerts after rebuilding. Core Receiver now exposes the validated source trigger name so alert cards can distinguish Power-Ups, Jewels, Hype Trains, Ko-fi events, and Streamlabs events.
- **Configuration:** existing configurations automatically materialize disabled `streamlabs` and `kofi` platform entries. Enable them in the wizard only after connecting each integration inside Streamer.bot.
- **Twitch EventSub migration:** the existing Twitch intake action remains the correct boundary. Trigger-variable regression tests should be rerun after upgrading because legacy chat payload fields were removed upstream.
- **StreamLoots:** `Pack Purchased`, `Pack Gifted`, and `Card Redeemed` are confirmed 1.0.5 triggers, but they remain deferred until real Streamer.bot argument captures establish stable IDs and exact value fields. Likely destination: a standalone StreamLoots add-on plus optional purchase/gift alerts.
- **StreamFog:** the six new operations are sub-actions, not normalized viewer events. They belong in a future opt-in scene/avatar-effects add-on, not core alerts.
- **Twitch message pinning:** useful for an optional command/action template later; it should remain creator-approved outbound moderation rather than automatic core behavior.
- **Kestrel, data-file saving, and Actions UI changes:** these improve Streamer.bot itself and require no StreamBridge protocol change.

