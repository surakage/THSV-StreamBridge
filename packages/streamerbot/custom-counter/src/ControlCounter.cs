// Purpose: Relays one creator-approved Custom Counter operation to the local StreamBridge.
// Editable Set Argument values above this block select the counter, amount, name, or preset.
// References: mscorlib.dll, System.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.custom-counter";

    public bool Execute()
    {
        string operation = Read("counterOperation").ToLowerInvariant();
        if (!Allowed(operation)) return Fail("counterOperation was missing or unsupported.");
        string counterId = Slug(Read("counterId"));
        if (counterId.Length == 0) counterId = "main";
        long amount = 0;
        if ((operation == "add" || operation == "subtract" || operation == "set") && !Int64.TryParse(Read("counterAmount"), NumberStyles.Integer, CultureInfo.InvariantCulture, out amount)) return Fail("counterAmount must be a whole number.");
        if (amount < -1000000000L || amount > 1000000000L) return Fail("counterAmount must be between -1000000000 and 1000000000.");
        string name = Clean(Read("counterName"), 80);
        if (operation == "rename" && name.Length == 0) return Fail("counterName is required for Rename.");
        string preset = Slug(Read("counterPreset")); if (preset.Length == 0) preset = "default";
        string relayId = Guid.NewGuid().ToString("N");
        var payload = new JObject { ["operation"] = operation, ["counterId"] = counterId, ["amount"] = amount, ["name"] = name, ["preset"] = preset };
        var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId, ["eventType"] = "addon.thsv.custom-counter.control", ["sourceEventType"] = "THSV Addon - Custom Counter - " + operation, ["relayId"] = relayId, ["relayToken"] = "", ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = payload };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { return Fail("the local counter control could not be relayed (" + error.GetType().Name + ")."); }
        CPH.SetArgument("customCounterControlValid", true); CPH.SetArgument("customCounterControlError", ""); CPH.SetArgument("customCounterRelayId", relayId);
        CPH.LogInfo("THSV Custom Counter control relayed: " + operation + " -> " + counterId + "."); return true;
    }

    private bool Allowed(string value) { return value == "increment" || value == "decrement" || value == "add" || value == "subtract" || value == "set" || value == "reset" || value == "show" || value == "hide" || value == "rename" || value == "save" || value == "load"; }
    private string Read(string name) { object value; return CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture).Trim() : ""; }
    private string Clean(string value, int maximum) { if (String.IsNullOrEmpty(value)) return ""; var result = new System.Text.StringBuilder(); foreach (char character in value) { if (!Char.IsControl(character)) result.Append(Char.IsWhiteSpace(character) ? ' ' : character); if (result.Length >= maximum) break; } return result.ToString().Trim(); }
    private string Slug(string value) { value = Clean(value, 40).ToLowerInvariant(); var result = new System.Text.StringBuilder(); bool dash = false; foreach (char character in value) { if ((character >= 'a' && character <= 'z') || (character >= '0' && character <= '9')) { result.Append(character); dash = false; } else if (!dash && result.Length > 0) { result.Append('-'); dash = true; } } return result.ToString().Trim('-'); }
    private bool Fail(string reason) { CPH.SetArgument("customCounterControlValid", false); CPH.SetArgument("customCounterControlError", reason); CPH.LogError("THSV Custom Counter control failed: " + reason); return false; }
}
