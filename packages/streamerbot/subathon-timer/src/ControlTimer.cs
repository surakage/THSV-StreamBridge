// Purpose: Relays one creator-selected Subathon Timer control to the local StreamBridge process.
// Each imported action includes a Set Argument sub-action that selects start, pause, resume, reset,
// or add-time. Edit subathonSeconds on the Add Time action; no source-code change is required.
// References: mscorlib.dll, System.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.subathon-timer";
    private const int MaximumAddSeconds = 86400;

    public bool Execute()
    {
        string action = Read("subathonAction").ToLowerInvariant();
        if (action != "start" && action != "pause" && action != "resume" && action != "reset" && action != "add-time")
            return Fail("the subathonAction argument was missing or unsupported.");

        int seconds = 0;
        if (action == "add-time" && !TryReadBoundedSeconds(out seconds))
            return Fail("subathonSeconds must be a whole number from 1 through 86400.");

        string sourceEventType = "THSV Addon - Subathon Timer - " + DisplayAction(action);
        string relayId = Guid.NewGuid().ToString("N");
        var payload = new JObject { ["action"] = action };
        if (action == "add-time") payload["seconds"] = seconds;
        var envelope = new JObject
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.subathon-timer.control",
            ["sourceEventType"] = sourceEventType,
            ["relayId"] = relayId,
            ["relayToken"] = "",
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false,
            ["payload"] = payload,
        };

        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { return Fail("the local timer control could not be relayed (" + error.GetType().Name + ")."); }

        CPH.SetArgument("subathonControlValid", true);
        CPH.SetArgument("subathonControlError", "");
        CPH.SetArgument("subathonControlAction", action);
        CPH.SetArgument("subathonControlSeconds", seconds);
        CPH.SetArgument("subathonRelayId", relayId);
        CPH.LogInfo("THSV Subathon Timer control relayed: " + action + (seconds > 0 ? " (" + seconds.ToString(CultureInfo.InvariantCulture) + " seconds)." : "."));
        return true;
    }

    private string Read(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture).Trim() : "";
    }

    private bool TryReadBoundedSeconds(out int seconds)
    {
        return Int32.TryParse(Read("subathonSeconds"), NumberStyles.Integer, CultureInfo.InvariantCulture, out seconds)
            && seconds >= 1 && seconds <= MaximumAddSeconds;
    }

    private string DisplayAction(string action)
    {
        if (action == "add-time") return "Add Time";
        return Char.ToUpperInvariant(action[0]) + action.Substring(1);
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("subathonControlValid", false);
        CPH.SetArgument("subathonControlError", reason);
        CPH.LogError("THSV Subathon Timer control failed: " + reason);
        return false;
    }
}
