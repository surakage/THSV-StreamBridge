// Purpose: Relays an exact creator Apply or Dismiss decision to Category Pilot.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string action = Read("categoryPilotControlAction").ToLowerInvariant(); if (action != "apply" && action != "dismiss") return Fail("categoryPilotControlAction must be apply or dismiss.");
        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.category-pilot", ["eventType"] = "addon.thsv.category-pilot.control",
            ["sourceEventType"] = "THSV Addon - Category Pilot - " + (action == "apply" ? "Apply Suggestion" : "Dismiss Suggestion"), ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = "",
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = ReadBool("isTest"), ["payload"] = new JObject { ["action"] = action }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { return Fail("the suggestion control could not be relayed (" + error.GetType().Name + ")."); }
        CPH.SetArgument("categoryPilotControlValid", true); CPH.SetArgument("categoryPilotControlError", ""); return true;
    }
    private string Read(string name) { object value; return CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture).Trim() : ""; }
    private bool ReadBool(string name) { bool value; return Boolean.TryParse(Read(name), out value) && value; }
    private bool Fail(string reason) { CPH.SetArgument("categoryPilotControlValid", false); CPH.SetArgument("categoryPilotControlError", reason); CPH.LogError("THSV Category Pilot control failed: " + reason); return false; }
}
