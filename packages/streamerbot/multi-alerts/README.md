# THSV StreamBridge Multi-Alerts

This package projects receiver-validated public engagement events into stable `multiAlert*` arguments. It does not render graphics, play sounds, speak text, or send platform messages. Creator actions decide presentation; Milestone 8 will provide the overlay sink.

## Install

1. Import core receiver `1.0.2` or later and `THSV-StreamBridge-Multi-Alerts-1.0.0.sb`.
2. Open `THSV StreamBridge - Receive Event`.
3. Add **Core > Actions > Run Action** after the existing inline packages.
4. Select `THSV StreamBridge - Multi-Alerts` and enable **Run Action Immediately**.

Core receiver upgrades overwrite manually-added child actions. Re-add Multi-Chat, Multi-Commands, and Multi-Alerts after upgrading it.

## Behavior

- Supports follows, subscriptions, memberships, gifted subscriptions, gifts, donations, cheers, Super Chats, raids, and engagement milestones.
- Monetary amounts are bounded decimal strings and currencies are uppercase three-letter ISO codes. The package never converts money through floating point.
- Quantity and milestone values are bounded safe integers.
- Optional actor identity is normalized; only actor-free milestones are valid.
- Text is inert plain text with controls/whitespace normalized and Unicode preserved. Browser consumers must contextually escape it.
- `multiAlertVerifiedTransport=False` and `multiAlertUnverifiedFields` preserve fixture/adapter uncertainty instead of presenting unverified TikFinity fields as production facts.
- Unsupported, chat, command, private, and operator events are successful no-ops.
- The action creates no globals, files, triggers, response messages, sounds, or platform output.

## Manual QA

Run the alert fixture matrix in `docs/testing.md`. Each valid alert sets `multiAlertHandled=True` and `multiAlertValid=True`. Verify the event-specific fields and confirm command/chat packages remain unhandled for alert-only events.
