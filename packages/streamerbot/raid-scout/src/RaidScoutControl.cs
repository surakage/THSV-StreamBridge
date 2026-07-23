// Purpose: Sends one exact creator control (Suggest, Confirm, or Cancel) to the Raid Scout add-on.
// Attach this imported action only to a creator-controlled hotkey, deck button, or operator command.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.raid-scout";
    private const string EventType = "addon.thsv.raid-scout.control";

    public bool Execute()
    {
        string action = Read("raidScoutControlAction").ToLowerInvariant();
        string label;
        if (action == "suggest") label = "Suggest";
        else if (action == "confirm") label = "Confirm";
        else if (action == "cancel") label = "Cancel";
        else
        {
            CPH.LogWarn("THSV Raid Scout rejected an unsupported creator control.");
            return false;
        }
        var envelope = new JObject
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = EventType,
            ["sourceEventType"] = "THSV Addon - Raid Scout - " + label,
            ["relayId"] = "raid-scout-control-" + Guid.NewGuid().ToString("N"),
            ["relayToken"] = "",
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false,
            ["payload"] = new JObject { ["action"] = action }
        };
        CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None));
        CPH.SetArgument("raidScoutControlAccepted", true);
        CPH.SetArgument("raidScoutControl", action);
        return true;
    }

    private string Read(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? value.ToString().Trim() : "";
    }
}
