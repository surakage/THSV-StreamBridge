# Streamer.bot 1.1.0-alpha.14 compatibility evidence

On October 1, 2026, the installed Streamer.bot GetInfo response reported
1.1.0-alpha.14. Automatic backups from September 30 immediately before and
after the alpha.12 -> alpha.14 upgrade retained 129 actions and 42 triggers.
The complete stable-ID-to-trigger-record projection was identical across all
four inspected backups. The current platform, scene, and ad intake actions
retained their enabled trigger types.

The exact alpha.14 embedded registry therefore reuses the alpha.10 contracts.
Future alpha versions remain unsupported until independently inspected. This
evidence covers persisted trigger serialization and local WebSocket requests;
it does not certify genuine provider events, audible playback, or every C#
action. Speaker.bot 1.0.0-alpha.5 and OBS 32.2.2 are the installed companion
targets for the current local repair.
