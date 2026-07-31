# Village Roll Call

**Module:** `thsv.village-roll-call`
**Version:** `2.5.2`
**Direct Streamer.bot trigger:** None

Village Roll Call turns one Streamer.bot-owned Twitch Channel Points reward into one daily check-in per viewer and a private monthly leaderboard.

## Install

1. Download the Village Roll Call package from the same release as StreamBridge.
2. Install `thsv.village-roll-call-2.5.2.thsv-addon` in the Add-ons page.
3. Review its four permissions and keep it disabled until the reward ID is configured.
4. Restart StreamBridge when prompted.

### Add-on-specific steps

1. Create a Twitch reward inside Streamer.bot.
2. Enable **Skip Reward Queue**.
3. Paste its stable Reward ID into the add-on settings.
4. Choose an IANA calendar time zone, save, and enable the add-on.

## Streamer.bot

No separate import or direct add-on trigger is required. Keep **Twitch Reward Redemption (Any Reward)** attached to `THSV Twitch - Intake`; the existing normalized reward path routes only the configured reward to Village Roll Call.

## OBS source

Use:

`http://127.0.0.1:8787/overlay/addons/thsv.village-roll-call`

Press **Send preview card** in the wizard before going live. Successful check-ins show a bounded top-viewer card for the configured duration. The source uses the existing StreamBridge overlay WebSocket and does not create another Streamer.bot connection.

## Offline test

1. Open the OBS source URL and wait for the LIVE badge.
2. Press **Send preview card** and confirm three sample leaders appear without clipping.
3. Use a Streamer.bot test redemption for the configured reward.
4. Confirm the simulated event shows a preview but does not change the saved leaderboard.
5. Use a genuine redemption only when ready to verify the once-per-day rule.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, and `overlay.publish`.

Private storage: `data/addons/thsv.village-roll-call/` and `data/addons/.state/thsv.village-roll-call/`.

Dependencies: none.

### Rules

- One score per stable Twitch user ID per calendar day.
- Ranking is check-in count, then earliest first check-in.
- The previous winner is announced on the first Twitch stream-online or valid check-in event in the new month.
- Simulated redemptions preview the OBS card but never write leaderboard state.
- State is capped at 500 monthly viewers and 1,000 replay IDs.

## Remove or repair

Uninstalling removes the executable package while preserving its bounded private leaderboard for a later reinstall. Reinstall the matching release if integrity or compatibility is rejected.
