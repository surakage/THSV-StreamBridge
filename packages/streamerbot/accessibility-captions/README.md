# Accessibility Captions native compatibility relay

This optional Streamer.bot package belongs to the Accessibility Captions add-on and is only offered in the universal import once that add-on is installed.

`src/Relay.cs` forwards recognized speech from native Voice Control Dictation (301) and Log (303) triggers through the existing authenticated Streamer.bot connection. This is a compatibility path for installations whose speech WebSocket notifications are absent despite recognized phrases appearing in Voice Control Log.

Installed action: `THSV Closed Captions - Relay Dictation` (`e2da11a3-1978-4d02-85de-4d234151c6f5`). It runs outside the speech playback queue and excludes pending/history entries. The relay writes neither audio nor transcript files. Native Streamer.bot logging is controlled separately.

The bridge accepts versioned `thsv.caption` envelopes only through its existing native custom-event relay and converts them to ephemeral live-caption input. Native speech notifications remain supported. Repeat suppression prevents duplicate captions when both routes emit the same phrase.

The local repair installer and pre-install backup are under `output/streaming-repair-20261001/`. Stop Streamer.bot before editing its saved action store. Keep the source action enabled while microphone captions are wanted; disable live captions in the bridge to hide them.
