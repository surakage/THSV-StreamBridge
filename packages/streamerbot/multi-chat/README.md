# THSV StreamBridge Multi-Chat

This package turns a receiver-validated `chat.message` event into one stable set of `multiChat*` arguments. It is platform-neutral: later actions consume the same values for Twitch, YouTube, Kick, TikTok, Facebook, or another registered platform.

## Install

1. Import core receiver `1.0.2` and then `THSV-StreamBridge-Multi-Chat-1.1.0.sb` into Streamer.bot.
2. Open `THSV StreamBridge - Receive Event`.
3. Add **Core > Actions > Run Action** after its enabled C# receiver sub-action.
4. Select `THSV StreamBridge - Multi-Chat` and keep **Run Action Immediately** enabled.
5. Run each offline chat fixture through the bridge and inspect Action History.

Upgrading the core receiver overwrites that action and removes manually-added sub-actions. Re-add the immediate Multi-Chat action after every receiver package upgrade, then save Streamer.bot before testing.

Running inline is required because Streamer.bot passes the caller's populated argument stack to the downstream action. Do not add a direct trigger to Multi-Chat and do not send flattened `streamBridge*` values over WebSocket.

## Behavior

- Non-chat events are left unhandled and return successfully.
- `chat.private-message`, `chat.system-message`, and `operator.message` never enter the public Multi-Chat path.
- Chat events require a successful core receiver result, platform, channel, user, and string `payload.message`.
- Each output includes the event ID, validated receive timestamp, process-local arrival sequence, and explicit `public` visibility.
- Actor type distinguishes human, bot, and system identities. Bot messages remain visible with `multiChatIsBot=True`; system actors are rejected on `chat.message` and must use `chat.system-message`.
- Control characters and runs of whitespace become a single normal space.
- Empty normalized messages and messages over 2,000 characters are rejected with a readable error.
- The message remains plain text. Any HTML or overlay consumer must contextually escape it before rendering.
- Role flags are derived from the normalized role array, not platform-specific badges.
- The action stores no globals, files, history, or user profiles and never sends chat back to a platform.

## Manual QA

- A valid chat message sets `multiChatHandled=True`, `multiChatValid=True`, and the expected platform/user/message values.
- A non-chat event sets `multiChatHandled=False` without failing the receiver action.
- Missing or non-string `payload.message` sets `multiChatValid=False` with a readable error.
- Newlines, tabs, and control characters are normalized without damaging Unicode text or emoji.
- A message longer than 2,000 characters is rejected.
- Twitch, YouTube, Kick, TikTok, and Facebook fixtures produce the same output contract.
- A burst test proves 100 deliveries start FIFO with the configured concurrency bound; consumers must sort by `multiChatSequence` when completion order matters.

## Uninstall

Remove the inline **Run Action** sub-action from the receiver, then delete `THSV StreamBridge - Multi-Chat`. No global variables or external resources require cleanup.
