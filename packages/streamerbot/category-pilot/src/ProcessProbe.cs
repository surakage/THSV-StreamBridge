// Purpose: Reports which exact creator-allowlisted process names are running. It never returns
// paths, command lines, window titles, process IDs, or an unrestricted process inventory.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken"); if (token.Length < 20) return Fail("the broker authorization token was missing.");
        var allowed = new HashSet<string>(Read("categoryPilotAllowedProcesses").Split(',').Select(Normalize).Where(value => value.Length > 0).Take(20), StringComparer.OrdinalIgnoreCase);
        if (allowed.Count == 0) return Fail("no allowed process names were supplied.");
        var running = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            foreach (Process process in Process.GetProcesses())
            {
                try { string name = Normalize(process.ProcessName); if (allowed.Contains(name)) running.Add(name); }
                catch { }
                finally { process.Dispose(); }
            }
        }
        catch (Exception error) { return Fail("the process snapshot failed (" + error.GetType().Name + ")."); }
        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.category-pilot", ["eventType"] = "addon.thsv.category-pilot.processes-received",
            ["sourceEventType"] = "THSV Addon - Category Pilot - Process Probe", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false,
            ["payload"] = new JObject { ["runningProcesses"] = new JArray(running.OrderBy(value => value).Take(5)), ["matchCount"] = Math.Min(5, running.Count) }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { return Fail("the bounded process result could not be relayed (" + error.GetType().Name + ")."); }
        CPH.SetArgument("categoryPilotProbeValid", true); CPH.SetArgument("categoryPilotMatchCount", Math.Min(5, running.Count)); CPH.SetArgument("categoryPilotProbeError", ""); return true;
    }
    private string Normalize(string value) { value = (value ?? "").Trim().ToLowerInvariant(); return value.EndsWith(".exe") ? value.Substring(0, value.Length - 4) : value; }
    private string Read(string name) { object value; return CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture).Trim() : ""; }
    private bool Fail(string reason) { CPH.SetArgument("categoryPilotProbeValid", false); CPH.SetArgument("categoryPilotProbeError", reason); CPH.LogError("THSV Category Pilot probe failed: " + reason); return false; }
}
