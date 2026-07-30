# THSV StreamBridge — Chat Guard

Import the `.sb`. It installs two actions in **THSV Addon - Chat Guard**:

- Leave **Moderate** triggerless and approve only that stable action in the wizard if you enable enforcement.
- **Trust Viewer** is bound to an imported `!guardtrust` command that starts disabled. After review, enable the command. A broadcaster or moderator can reply to a viewer's message with `!guardtrust`; Streamer.bot sends the replied-to viewer's stable provider ID to Chat Guard. Without a reply, the command user is selected.

The command supports Streamer.bot's native Twitch, YouTube, and Kick command sources. TikTok remains available through the wizard's manual stable-ID fallback until TikFinity exposes a verified equivalent reply identity flow.

Start in Observe mode. Enforcement needs both wizard switches, a non-observe mode, and the approved action. YouTube delete and TikTok timeout/ban/delete are intentionally unsupported and fail closed.

The action returns only a request/incident correlation and success result to StreamBridge. It never relays chat text.
