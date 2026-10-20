// Purpose: Turns one OBS source filter on or off for a broker-authorized Streamer Punishments
// screen effect. StreamBridge owns the timing and runs this again to turn the filter off.
// Keep this action triggerless.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 200);
        string source = Read("punishmentSourceName", 256);
        string filter = Read("punishmentFilterName", 256);
        string enabled = Read("punishmentFilterEnabled", 5);
        int connection;
        if (!int.TryParse(Read("punishmentConnectionIndex", 2), out connection) || connection < 0 || connection > 23) connection = 0;
        if (token.Length < 20) return Fail("The StreamBridge broker token was missing; run this action from StreamBridge only.");
        if (source.Length == 0 || filter.Length == 0) return Fail("No OBS source or filter name was supplied.");
        if (enabled != "true" && enabled != "false") return Fail("The filter state must be true or false.");
        if (!CPH.ObsIsConnected(connection)) return Fail("OBS is not connected.");
        var request = new JObject { ["sourceName"] = source, ["filterName"] = filter, ["filterEnabled"] = enabled == "true" };
        CPH.ObsSendRaw("SetSourceFilterEnabled", request.ToString(Formatting.None), connection);
        return true;
    }

    private string Read(string name, int maximum)
    {
        object value;
        string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value).Trim() : "";
        text = text.Replace("\r", " ").Replace("\n", " ");
        return text.Length <= maximum ? text : text.Substring(0, maximum);
    }

    private bool Fail(string reason)
    {
        CPH.LogWarn("THSV Streamer Punishments: " + reason);
        return false;
    }
}
