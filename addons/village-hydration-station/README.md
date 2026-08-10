# Village Hydration Station

Village Hydration Station provides live-only hydration reminders, creator-authorized ounce tracking, viewer reminder requests, optional Speaker.bot confirmations, and a persistent animated fill overlay.

Water tracking resets at the computer's local midnight by default, including during a stream that crosses into a new calendar day. Per-stream and manual reset modes remain available in the wizard.

Viewer activity never adds water. Twitch and Kick use stable native reward IDs; YouTube and TikTok use the automatically registered `!hydrate` command. Shared global and per-viewer cooldowns prevent cross-platform reminder spam.

Creators can use `!water 8`, `!water undo`, `!water snooze`, `!water reset`, and `!water status`. The included Streamer.bot controls also support Stream Deck and creator hotkeys. Hydration does not subscribe to microphone dictation or use a Voice Control command.

Speaker.bot is optional and only speaks the creator-authored reminder and confirmation text. Approve only the included triggerless **Speak** action when spoken announcements are enabled.

Add `/overlay/addons/thsv.village-hydration-station` as a compact `520 x 620` browser source or position it inside a `1920 x 1080` source. The fill level is the bounded recorded total divided by the creator-configured goal. The wizard preview uses the same production template.

The goal is a personal stream display target and is not medical advice.
