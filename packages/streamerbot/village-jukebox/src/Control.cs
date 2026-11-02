// Purpose: One-click Village Jukebox controls for a Stream Deck button, hotkey or any creator-only trigger:
// Play/Pause, Skip, Stop, Approve Next and Approve All. Attach only to creator controls, never to chat.
// References: mscorlib.dll, System.dll, netstandard.dll, Newtonsoft.Json.dll.
using System; using Newtonsoft.Json.Linq;
public class CPHInline
{
    public bool Execute()
    {
        object value; string action = CPH.TryGetArg("villageJukeboxAction", out value) && value != null ? value.ToString().Trim().ToLowerInvariant() : "";
        string label;
        switch (action)
        {
            case "toggle": label = "Play Pause"; break;
            case "skip": label = "Skip"; break;
            case "stop": label = "Stop"; break;
            case "approve-next": label = "Approve Next"; break;
            case "approve-all": label = "Approve All"; break;
            default: CPH.LogError("Village Jukebox control: villageJukeboxAction must be toggle, skip, stop, approve-next or approve-all."); return false;
        }
        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.village-jukebox", ["eventType"] = "addon.thsv.village-jukebox.control",
            ["sourceEventType"] = "THSV Addon - Village Jukebox - " + label, ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = "",
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = new JObject { ["action"] = action }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Newtonsoft.Json.Formatting.None)); return true; }
        catch (Exception error) { CPH.LogError("Village Jukebox control could not reach StreamBridge (" + error.GetType().Name + ")."); return false; }
    }
}
