# THSV StreamBridge Scene Catalog

Import `THSV-StreamBridge-Scene-Catalog-4.0.6.sb` with the universal importer. The wizard invokes this exact action ID through Streamer.bot's already-authenticated local WebSocket connection.

For OBS Studio, the action sends the read-only `GetSceneList` request and broadcasts the names back to StreamBridge. It never changes preview, program, or studio-mode scenes. Streamlabs Desktop and Meld Studio retain exact scene names observed by the existing Scene Actions intake; manual wizard entry remains available for scenes not yet observed.
