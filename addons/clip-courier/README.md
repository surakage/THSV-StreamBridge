# Clip Courier

Clip Courier is a Twitch clip-to-Discord add-on with two deliberately separate inputs:

- **`!clip` — recommended:** a viewer uses the command through the existing Twitch intake, Streamer.bot creates the previous 30 or 60 seconds, and Clip Courier immediately sends that exact clip to Discord.
- **Other current-stream clips — optional:** Clip Library Cache checks public Twitch metadata, but Clip Courier accepts only clips created between the observed Twitch online and offline timestamps. Older library clips and clips from prior streams do not qualify.

Import Clip Courier's Streamer.bot package. It contains only the triggerless **Create Clip** and **Deliver** helpers. In **Create Clip**, change `clipCourierDurationSeconds` to `30` or `60`. In **Deliver**, put the private Discord webhook only in `clipCourierWebhookUrl`, then Save and Compile. Approve both helpers in the wizard; do not create or enable a separate Streamer.bot `!clip` Command object.

Install and enable Clip Library Cache only if **Also send other clips made during this stream** is enabled or another clip add-on needs it. StreamBridge must observe the Twitch Stream Online event before background discovery can identify the current session; if that boundary is unknown, automatic publication fails closed instead of posting an older clip.

Stable clip IDs prevent repeats. Discord mentions are disabled, rate-limit retries are bounded, and only confirmed message or thread IDs are stored.

Clip Courier has no browser overlay. Discord is its output.
