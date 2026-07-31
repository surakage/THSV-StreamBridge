# Live Beacon

Live Beacon sends one linked Discord embed for each selected platform when it goes live. Nearby platform starts share one short collection window but are delivered separately. Webhook secrets stay in the imported Streamer.bot Deliver action. StreamBridge stores only bounded delivery identities and results.

Discord ties every incoming webhook to one parent channel or forum. The recommended setup is one **Live Notifications** forum with one shared `liveBeaconWebhookUrl`; leave every platform on **Use shared webhook** and Live Beacon creates or reuses one forum post per platform. The standard Streamer.bot import asks for only that shared URL. Advanced creators placing platforms in separate parent destinations may manually add only the needed platform-specific webhook arguments.

The wizard offers two setup paths:

- **Create and manage the platform posts for me:** leave the IDs blank. On each platform's first genuine live event, Live Beacon creates one permanent post using the editable welcome message, records Discord's confirmed thread ID privately, and reuses it afterward.
- **Use platform posts I already created:** enable Discord Developer Mode, copy each post's **Channel ID**, and save it in the matching wizard field. Live Beacon sends every future notification into that post and leaves its welcome message untouched.

Both modes use Discord's documented confirmed Execute Webhook contract. Normal-channel mode sends one message; forum mode creates one post with `thread_name` using a webhook created inside that forum. Automatic mention parsing is disabled, only the configured role ID may be mentioned, and bounded rate-limit retry never exposes the webhook or response body. TikTok remains an explicit manual/fallback path because TikFinity does not document a dependable native Stream Online event.

Every provider-backed embed includes the stream title and game/category when the trigger supplies them, a validated direct live link, and a Discord-localized start timestamp. Missing provider metadata is omitted rather than guessed. Broadcast-app fallback events can supply the start time and configured direct link, but not a TikTok title or category.

For TikTok, attach the imported **Broadcast Started** action to exactly one active Streamer.bot broadcast-app trigger: OBS Studio, Meld Studio, or Streamlabs Desktop **Streaming Started**. The wizard's fallback-platform selection decides which platform embeds that signal creates; TikTok is the recommended default. Repeated signals within the same five-minute window share one deduplication identity.

Enter either a plain login or the full Twitch, Kick, or TikTok profile URL. Live Beacon normalizes it before creating the viewer link. A real YouTube **Broadcast Started** event supplies `%broadcast.id%`, which becomes the exact `https://www.youtube.com/watch?v=...` URL. The saved YouTube channel URL is used only when that ID is unavailable and is converted to the channel's `/live` endpoint.

Streamer.bot's trigger **Test** button sets the event's test flag. Live Beacon deliberately ignores those simulated provider events so a routine trigger test cannot ping a real Discord role. The triggerless Deliver action also intentionally rejects a manual run without StreamBridge's one-use broker token. Use a genuine provider start for live acceptance.
