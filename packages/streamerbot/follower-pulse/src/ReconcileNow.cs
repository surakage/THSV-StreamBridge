// Purpose: Asks Follower Pulse to start one creator-requested follower reconciliation.
// Attach only to a creator-controlled hotkey, deck button, or operator command.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        var envelope = new JObject {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.follower-pulse",
            ["eventType"] = "addon.thsv.follower-pulse.control", ["sourceEventType"] = "THSV Addon - Follower Pulse - Reconcile Now",
            ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = "", ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = ReadBool("isTest"), ["payload"] = new JObject { ["action"] = "reconcile-now" }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); CPH.SetArgument("followerPulseControlValid", true); return true; }
        catch (Exception error) { CPH.SetArgument("followerPulseControlValid", false); CPH.SetArgument("followerPulseControlError", "Follower Pulse relay failed (" + error.GetType().Name + ")."); return false; }
    }
    private bool ReadBool(string name) { object raw; bool value; return CPH.TryGetArg(name, out raw) && raw != null && Boolean.TryParse(raw.ToString(), out value) && value; }
}
