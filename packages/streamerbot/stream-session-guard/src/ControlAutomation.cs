// Purpose: Relays one pause, resume, or toggle request to the Stream Break & End Guard
// automation. It never changes scenes or starts or stops the stream itself.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string action;
        if (!CPH.TryGetArg("sessionGuardAction", out action) || (action != "pause" && action != "resume" && action != "toggle")) return false;
        var envelope = new JObject {
            ["type"] = "thsv.addon", ["version"] = "1.0.0",
            ["moduleId"] = "thsv.stream-session-guard",
            ["eventType"] = "addon.thsv.stream-session-guard.control",
            ["sourceEventType"] = "THSV Stream Break & End Guard - " + action,
            ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = "",
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false,
            ["payload"] = new JObject { ["action"] = action }
        };
        CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None));
        CPH.LogInfo("THSV Stream Break & End Guard control relayed: " + action);
        return true;
    }
}
