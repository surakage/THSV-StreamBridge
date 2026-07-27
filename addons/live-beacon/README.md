# Live Beacon

Live Beacon sends one coalesced Discord notification when selected platforms go live. Webhook secrets stay in the imported Streamer.bot Deliver action. StreamBridge stores only bounded delivery identities and results.

Both modes use Discord's documented confirmed Execute Webhook contract. Normal-channel mode sends one message; forum mode creates one thread with `thread_name`. Automatic mention parsing is disabled, only the configured role ID may be mentioned, and bounded rate-limit retry never exposes the webhook or response body. TikTok remains an explicit manual/fallback path because TikFinity does not document a dependable native Stream Online event.
