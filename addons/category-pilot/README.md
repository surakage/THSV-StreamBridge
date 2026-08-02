# Category Pilot

Category Pilot is a Windows-only, privacy-bounded game/process helper. It asks one approved Streamer.bot action whether the exact process names configured in the wizard are running. It never returns the complete process list, executable paths, command lines, or window titles.

Install Creator Controls first. Import the Category Pilot package, approve Process Probe plus only the Creator Controls profile actions used by mappings, and begin in Suggest only mode. Apply and Dismiss may be attached to creator-controlled hotkeys or deck buttons. Automatic mode is opt-in.

Each probe carries a one-use correlation ID. Missing responses time out after 30 seconds and polling resumes automatically; stale or simulated responses cannot create or apply a suggestion. A later complete probe with no configured process match clears any pending suggestion.
