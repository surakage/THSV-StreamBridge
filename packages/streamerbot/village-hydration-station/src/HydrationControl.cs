// Purpose: Relays one creator-controlled hydration operation to the local StreamBridge.
// Stream Deck, hotkey, and other creator-only controls use the fixed hydrationControlAction and
// optional hydrationAmount arguments. Viewer commands and rewards stay on the main THSV intakes.
// References: mscorlib.dll, System.dll, and Streamer.bot's bundled Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.village-hydration-station";

    public bool Execute()
    {
        string action = Read("hydrationControlAction", 30).ToLowerInvariant();
        if (!Allowed(action)) return Fail("hydrationControlAction was missing or unsupported.");
        string amountText = Read("hydrationAmount", 100);
        string relayId = Guid.NewGuid().ToString("N");
        var payload = new JObject
        {
            ["action"] = action,
            ["amountText"] = amountText,
            ["source"] = "creator-control"
        };
        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.village-hydration-station.control",
            ["sourceEventType"] = "THSV Addon - Village Hydration Station - " + action,
            ["relayId"] = relayId, ["relayToken"] = "", ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false, ["payload"] = payload
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { return Fail("the local hydration control could not be relayed (" + error.GetType().Name + ")."); }
        CPH.SetArgument("hydrationControlValid", true);
        CPH.SetArgument("hydrationControlError", "");
        CPH.SetArgument("hydrationRelayId", relayId);
        CPH.LogInfo("THSV Village Hydration Station control relayed: " + action + ".");
        return true;
    }

    private bool Allowed(string value)
    {
        return value == "log" || value == "undo" || value == "snooze"
            || value == "reset" || value == "remind" || value == "preview";
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
        CPH.SetArgument("hydrationControlValid", false);
        CPH.SetArgument("hydrationControlError", reason);
        CPH.LogError("THSV Village Hydration Station control failed: " + reason);
        return false;
    }
}
