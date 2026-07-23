// Purpose: Relays one creator-triggered Fan Crown maintenance request to the installed add-on.
// The action argument selects reset-crown or reset-month. This code never edits rewards or files.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using Newtonsoft.Json;

public class CPHInline
{
    public bool Execute()
    {
        string action;
        if (!CPH.TryGetArg("fanCrownControlAction", out action) || action == null) return false;
        action = action.Trim().ToLowerInvariant();
        if (action != "reset-crown" && action != "reset-month") return false;
        string source = action == "reset-month"
            ? "THSV Addon - Fan Crown - Reset Month"
            : "THSV Addon - Fan Crown - Reset Crown";
        var envelope = new Dictionary<string, object>
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = "thsv.fan-crown",
            ["eventType"] = "addon.thsv.fan-crown.control",
            ["sourceEventType"] = source,
            ["relayId"] = "fan-crown-control-" + Guid.NewGuid().ToString("N"),
            ["relayToken"] = "",
            ["receivedAt"] = DateTime.UtcNow.ToString("o"),
            ["simulated"] = false,
            ["payload"] = new Dictionary<string, object> { ["action"] = action }
        };
        CPH.WebsocketBroadcastJson(JsonConvert.SerializeObject(envelope));
        CPH.SetArgument("fanCrownControlRequested", true);
        CPH.SetArgument("fanCrownControlOperation", action);
        CPH.LogInfo("THSV Fan Crown " + action + " request relayed.");
        return true;
    }
}
