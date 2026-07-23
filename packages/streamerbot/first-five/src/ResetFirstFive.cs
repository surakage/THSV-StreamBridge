// Purpose: Sends one creator-triggered reset request to the installed First Five add-on.
// Attach this optional action to a hotkey or deck button. It never mutates rewards directly.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using Newtonsoft.Json;

public class CPHInline
{
    public bool Execute()
    {
        string relayId = "first-five-reset-" + Guid.NewGuid().ToString("N");
        var envelope = new Dictionary<string, object>
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = "thsv.first-five",
            ["eventType"] = "addon.thsv.first-five.control",
            ["sourceEventType"] = "THSV Addon - First Five - Reset",
            ["relayId"] = relayId,
            ["relayToken"] = "",
            ["receivedAt"] = DateTime.UtcNow.ToString("o"),
            ["simulated"] = false,
            ["payload"] = new Dictionary<string, object> { ["action"] = "reset" }
        };
        CPH.WebsocketBroadcastJson(JsonConvert.SerializeObject(envelope));
        CPH.SetArgument("firstFiveResetRequested", true);
        CPH.LogInfo("THSV First Five reset request relayed.");
        return true;
    }
}
