// Purpose: Relays one creator-selected Viewer Lobby operation to StreamBridge.
// References: mscorlib.dll, System.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json.Linq;
public class CPHInline
{
    public bool Execute()
    {
        object raw; string action = CPH.TryGetArg("viewerLobbyAction", out raw) && raw != null ? raw.ToString().Trim().ToLowerInvariant() : "";
        string[] allowed = { "open", "close", "pause", "resume", "next", "random", "clear" }; if (Array.IndexOf(allowed, action) < 0) return false;
        var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.viewer-lobby", ["eventType"] = "addon.thsv.viewer-lobby.control", ["sourceEventType"] = "THSV Addon - Viewer Lobby - " + Label(action), ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = "", ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = new JObject { ["action"] = action } };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Newtonsoft.Json.Formatting.None)); CPH.SetArgument("viewerLobbyControlValid", true); return true; } catch (Exception error) { CPH.SetArgument("viewerLobbyControlValid", false); CPH.SetArgument("viewerLobbyControlError", error.GetType().Name); return false; }
    }
    private string Label(string action) { return Char.ToUpperInvariant(action[0]) + action.Substring(1); }
}
