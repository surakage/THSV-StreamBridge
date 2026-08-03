# Viewer Lobby

Viewer Lobby provides source-routed `!join`, `!leave`, `!position`, and `!queue` commands plus creator-only Open, Close, Pause, Resume, Next, Random, Complete, and Clear controls. Queue state is bounded and restart-safe. Public overlay data excludes platform user IDs and hidden gamertags.

Disabled and simulated controls never mutate the live queue. Complete removes the current viewer, while Next and Random finish the current selection before choosing another. Unobserved offline signals cannot close the lobby, serialized processing recovers after an isolated failure, and the public overlay can be limited independently from the private queue.
