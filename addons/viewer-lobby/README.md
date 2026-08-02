# Viewer Lobby

Viewer Lobby provides source-routed `!join`, `!leave`, `!position`, and `!queue` commands plus creator-only Open, Close, Pause, Resume, Next, Random, and Clear controls. Queue state is bounded and restart-safe. Public overlay data excludes platform user IDs and hidden gamertags.

Disabled and simulated controls never mutate the live queue. Departed viewers are removed from active storage, serialized processing recovers after an isolated failure, and selected viewers receive a status response rather than a misleading position zero.
