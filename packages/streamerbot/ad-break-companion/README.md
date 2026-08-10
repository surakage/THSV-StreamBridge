# THSV StreamBridge - Ad Break Companion

Import the included `.sb` file, then add two triggers:

- **Twitch > Ads > Upcoming Ad** → **Upcoming Ad Intake**
- **Twitch > Ads > Ad Run** → **Ad Run Intake**

Leave **Preview Upcoming**, **Preview Active**, and **Clear Display** without triggers. Run both previews manually to size each countdown state while offline; Clear Display immediately hides either preview.

The actions only relay bounded timing fields to the local bridge. They cannot control Twitch ads.
