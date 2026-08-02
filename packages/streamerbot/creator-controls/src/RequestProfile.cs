// Purpose: Requests one saved Creator Controls profile through the local StreamBridge relay.
// Attach only to creator-controlled triggers. This action never mutates a platform directly.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string profileId = Read("creatorControlProfileId").ToLowerInvariant();
        string categoryPilotRequestId = Read("categoryPilotApplyRequestId");
        if (profileId != "profile-1" && profileId != "profile-2" && profileId != "profile-3") return Fail("creatorControlProfileId must be profile-1, profile-2, or profile-3.");
        string relayId = Guid.NewGuid().ToString("N");
        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.creator-controls",
            ["eventType"] = "addon.thsv.creator-controls.control", ["sourceEventType"] = "THSV Addon - Creator Controls - Apply Profile " + profileId.Substring(profileId.Length - 1),
            ["relayId"] = relayId, ["relayToken"] = "", ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = ReadBool("isTest"),
            ["payload"] = new JObject { ["profileId"] = profileId, ["categoryPilotRequestId"] = categoryPilotRequestId }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { return Fail("the local profile request could not be relayed (" + error.GetType().Name + ")."); }
        CPH.SetArgument("creatorControlValid", true); CPH.SetArgument("creatorControlError", ""); CPH.SetArgument("creatorControlProfileId", profileId); CPH.SetArgument("creatorControlRelayId", relayId);
        return true;
    }
    private string Read(string name) { object value; return CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture).Trim() : ""; }
    private bool ReadBool(string name) { bool value; return Boolean.TryParse(Read(name), out value) && value; }
    private bool Fail(string reason) { CPH.SetArgument("creatorControlValid", false); CPH.SetArgument("creatorControlError", reason); CPH.LogError("THSV Creator Controls request failed: " + reason); return false; }
}
