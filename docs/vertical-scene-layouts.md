# Vertical scene layouts

All layouts use a 1080 × 1920 canvas. Starting Soon, Be Right Back and Stream Ending retain their titles. Decorative scene titles, slogans and debug labels are hidden elsewhere. Functional overlay content remains visible.

Just Chatting: camera 984 × 553.5 at (48,48), captions below, alerts and ad in their own row, chat 550 × 922 at (48,950), compact redemption stack 410 × 700 at (622,950). Chat and redemptions never share a rectangle.

BRB and Ending: identical clip rectangle 984 × 553.5 at (48,290); Raid Scout uses exactly the same rectangle. Redemptions below at native 410 × 700.

In the bridge overlay source checklist, expand **Horizontal / vertical source options** to copy the matching URL and browser dimensions. Redemption sources offer regular and compact sizes for both orientations. Keep the five queued redemption cards in one container; alerts, captions and ads have separate positions.

First Five displays a separate board for Twitch, Kick, YouTube and TikTok. Twitch/Kick claim through configured channel rewards; YouTube/TikTok claim through !firstfive and viewer points. Facebook is not supported by First Five yet.

Verification: five OBS portrait scene captures, eight First Five browser renders (four platforms × two orientations), and 15 First Five module/package tests. All preview traffic was local; no public chat, raid or ad was triggered.
