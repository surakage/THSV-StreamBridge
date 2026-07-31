# Village Voice

Village Voice is the bounded Speaker.bot and viewer-TTS add-on. It speaks creator-authored alert acknowledgements and can optionally accept viewer messages through a Twitch Channel Points reward, a Kick channel reward, or a Viewer Foundation points command on YouTube and TikTok.

Before enabling it, create a Voice Alias in Speaker.bot and enter that exact, case-sensitive alias in the wizard. Import the separate Voice Relay Streamer.bot package, keep its Speak action triggerless, and approve only that stable action ID. Add `/overlay/addons/thsv.voice-relay` to OBS, Meld, or Streamlabs to show the viewer avatar, platform, and progressively revealed validated message.

Kick reward requests are processed natively, but Streamer.bot currently exposes no documented Kick refund method. YouTube and TikTok requests spend Viewer Foundation points and roll them back if queueing or dispatch fails. Links and controls are stripped, blocked terms and per-platform length caps apply, rapid alert events are aggregated, and spoken text is never retained.
