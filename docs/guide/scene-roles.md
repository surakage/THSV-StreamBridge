# Scene roles

## What it is

Many features need to know what kind of scene you are on. A break timer needs your break scene. Auto-raid needs your ending scene. Instead of typing scene names into every feature, you tell StreamBridge once which of your scenes plays each **role**:

| Role | Wizard label | Typical scene |
| --- | --- | --- |
| `starting` | Starting scene | Your Starting Soon scene |
| `live` | Main live scene | Your usual gameplay scene |
| `chatting` | Just Chatting scene | Your talking or camera scene, if separate |
| `break` | Break scene | Your Be Right Back scene. Break timers switch here and clips play here |
| `ending` | Ending scene | Your end-of-stream scene. Stream limits, clips and auto-raid use it |

Feature settings can then say `role:break` (or another role) instead of a scene name. Many features ship with these role settings as their defaults. For example, Streamer Punishments uses `role:chatting` as its exercise scene. Rename a scene later, and you only update it here.

## What you need

- A scene connection to OBS, Meld or Streamlabs, so the wizard can list your scenes ([OBS and overlays](obs-and-overlays.md)). You can also type names by hand.

## Set it up

1. In the wizard, open **Features > Scene roles**.
2. Select **Refresh scenes** to load your current scene list.
3. For each role, pick a scene from the list, or type its exact name. Leave a role blank if you do not use it.
4. Optional: fill in **Nested scene (ignored)** for a role (see below).
5. Optional: fill in **Also ignore any scene that starts with** (see below).
6. Select **Save scene roles to pending changes**.
7. Select **Save with backup** in the bar at the top, then **Restart safely**. Scene roles apply after the restart.

### How names are matched

- Matching ignores upper and lower case and extra spaces.
- If the name you saved has **no** emoji at the start, it also matches the same name with an emoji in front. `Ending Soon` matches `⭐ Ending Soon`.
- If the name you saved **starts with** an emoji, only that exact emoji matches. `⭐ Ending Soon` does not match `🌙 Ending Soon`. Pick from the list to be safe.

### Nested scenes (ignored)

Some streamers build one scene of sources and nest it inside the scene they go live on. For example, a "sources" version of a gameplay scene sits inside the real gameplay scene. If you click on that sources scene by accident while live, features should not react.

Each role has a **Nested scene (ignored)** picker. Choose the scene that this role's scene nests from. Nested scene names must match exactly (case does not matter, but the emoji does).

**Also ignore any scene that starts with** handles many nested scenes at once. Type only the start of their names, such as one emoji, not whole names. Separate several with spaces. Use it only for nested scenes you did not pick above.

What "ignored" means:

- Switching **to** an ignored scene does not count as a scene change. Nothing starts or stops, and StreamBridge acts as if your last real scene is still live.
- Switching **back** to the same real scene is not counted as a switch either.
- The next real switch reports your last real scene as the one you came from.
- Ignored scenes still appear in scene lists, so you can still pick them.

## Check it works

1. After the restart, open a feature that uses roles. Its scene list shows **Scene role: break (your scene name)** and so on. "not set yet" means the role is blank.
2. Switch to your break scene in OBS. Features set to `role:break` should react.
3. Switch to a nested scene. Nothing should start or stop.

## Common problems

- **A feature does not react to my scene.** Check the role name and the emoji. Pick the scene from the list instead of typing it.
- **The scene list is empty.** Save a direct scene connection first, then select **Refresh scenes**. Or type the exact name.
- **Changes did nothing.** Scene roles need **Save with backup** and a restart.
- **Too many scenes are ignored.** Your prefix is too short or too common. Use a unique emoji or symbol for nested scenes.

For depth, read [Scene Actions](../addons/scene-actions.md) and [Stream Break & End Guard](../addons/stream-session-guard.md).
