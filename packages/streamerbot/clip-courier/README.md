# THSV StreamBridge — Clip Courier

Import the package, set `clipCourierWebhookUrl` only in **Deliver**, Save and Compile, and approve both triggerless actions for Clip Courier in the wizard. Choose either the normal-channel or forum mode that matches that webhook; one webhook is never used for both. The first discovery scan creates a silent baseline by default. Deliver uses confirmed responses, disables mentions, applies bounded HTTP 429 retries, and returns only bounded message/thread IDs.
