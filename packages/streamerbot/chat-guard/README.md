# THSV StreamBridge — Chat Guard

Import the `.sb`, leave **THSV Addon - Chat Guard - Moderate** triggerless, and approve only that stable action in the Chat Guard wizard card.

Start in Observe mode. Enforcement needs both wizard switches, a non-observe mode, and the approved action. YouTube delete and TikTok timeout/ban/delete are intentionally unsupported and fail closed.

The action returns only a request/incident correlation and success result to StreamBridge. It never relays chat text.
