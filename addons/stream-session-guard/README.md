# Stream Break & End Guard

This bundled StreamBridge extension keeps one persisted schedule for each genuine live session. Automatic mode derives the break cadence from the planned stream length: a one-hour stream breaks at 30 minutes, while streams of two hours or longer break hourly. Breaks last five minutes by default. It warns before each break, switches to a detected break scene, restores the prior scene or a detected return scene, and switches to a detected ending scene when the maximum stream length is reached.

It never starts or stops a broadcast. End-of-stream timing takes priority, breaks that would overlap the ending warning are skipped, simulated events cannot switch scenes, and every scene request is bounded to one exact scene selected from the connected OBS, Meld, or Streamlabs catalogue.

Import the included Streamer.bot package, Save and Compile its Scene Controller, approve that action in the wizard, and leave it triggerless. Add the extension overlay URL to any scene where the creator should see its warning countdown.
