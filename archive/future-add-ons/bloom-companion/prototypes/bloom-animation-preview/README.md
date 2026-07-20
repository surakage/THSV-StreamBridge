# Bloom animation preview

This approval-first prototype proves Bloom's animation timing and queue behavior before companion progression is wired into StreamBridge.

## Run

From the repository root:

```powershell
npx http-server prototypes/bloom-animation-preview -p 8790 -c-1
```

Open `http://127.0.0.1:8790/`.

## Behavior

- Idle breathing continues between action clips.
- Blink, wave, eat, sleep, and celebrate are one-shot animations.
- Requests made during an animation wait in order.
- Natural ambient mode waits 8–14 seconds between actions.
- The ambient shuffle bag uses every action once before any action can repeat.
- No reward, viewer, or progression state is changed by this prototype.

The existing Bloom art from SlothBloom Sprouts is copied into this prototype so the character remains consistent with the source project. The AI-generated concept sheet is included only as visual direction; it is not rendered by the animation runtime.
