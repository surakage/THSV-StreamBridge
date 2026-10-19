# THSV StreamBridge - Face Filters

Import the `.sb` file, Save and Compile **Activate Lens**, approve it for Face Filters in the wizard, and leave it triggerless.

The action has two steps. A short C# guard checks the one-use StreamBridge broker token, the lens name, and a 5-600 second duration. Then Streamfog's own **Activate Lens by Name** sub-action turns that lens on. Streamfog must be connected under **Integrations > StreamFog**.
