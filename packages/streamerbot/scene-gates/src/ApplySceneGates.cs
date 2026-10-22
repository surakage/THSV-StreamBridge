// Purpose: Applies the Scene Gates changes StreamBridge sends on a scene switch or when the stream
// ends: turns Streamer.bot commands on or off, shows or hides (disables, never pauses) Twitch
// rewards, and records each gate in a temporary global variable for THSV Scene Gate - Check.
// Keep this action triggerless. StreamBridge sends only changes, never the full list.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll and Newtonsoft.Json.dll.
using System;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const int MaximumChanges = 80;
    private const int MaximumPayloadLength = 60000;
    private static readonly Regex GateId = new Regex("^[a-z0-9][a-z0-9-]{0,39}$");

    public bool Execute()
    {
        CPH.SetArgument("sceneGateApplied", 0);
        CPH.SetArgument("sceneGateFailed", 0);
        string token = Read("thsvAddonRelayToken", 200);
        if (token.Length < 20) return Fail("The StreamBridge broker token was missing; run this action from StreamBridge only.");
        string payload = Read("sceneGateChanges", MaximumPayloadLength + 1);
        if (payload.Length == 0 || payload.Length > MaximumPayloadLength) return Fail("No bounded list of gate changes was supplied.");

        JArray changes;
        try { changes = JArray.Parse(payload); }
        catch (Exception error) { return Fail("The gate changes could not be read (" + error.GetType().Name + ")."); }
        if (changes.Count > MaximumChanges) return Fail("Too many gate changes were supplied at once.");

        int applied = 0;
        int failed = 0;
        foreach (JToken item in changes)
        {
            JObject change = item as JObject;
            if (change == null) { failed++; continue; }
            string gate = Text(change, "gate", 40);
            string kind = Text(change, "kind", 20);
            string target = Text(change, "target", 256);
            string message = Text(change, "message", 300);
            JToken allowedToken = change["allowed"];
            if (!GateId.IsMatch(gate) || allowedToken == null || allowedToken.Type != JTokenType.Boolean) { failed++; continue; }
            bool allowed = allowedToken.Value<bool>();
            try
            {
                if (kind == "command")
                {
                    Guid commandId;
                    if (!Guid.TryParse(target, out commandId)) { failed++; continue; }
                    // Streamer.bot's documented command methods take the command ID.
                    if (allowed) CPH.EnableCommand(target); else CPH.DisableCommand(target);
                }
                else if (kind == "twitch-reward")
                {
                    if (target.Length == 0) { failed++; continue; }
                    // Disable hides the reward from viewers; it is not the same as pausing it.
                    if (allowed) CPH.EnableReward(target); else CPH.DisableReward(target);
                }
                else if (kind != "check-only") { failed++; continue; }

                // Not persisted: after Streamer.bot restarts, Check treats every gate as open.
                CPH.SetGlobalVar("thsvGate." + gate, allowed, false);
                CPH.SetGlobalVar("thsvGateMessage." + gate, message, false);
                applied++;
            }
            catch (Exception error)
            {
                failed++;
                CPH.LogWarn("THSV Scene Gates: gate " + gate + " could not be changed (" + error.GetType().Name + ").");
            }
        }

        CPH.SetArgument("sceneGateApplied", applied);
        CPH.SetArgument("sceneGateFailed", failed);
        if (failed > 0) CPH.LogWarn("THSV Scene Gates: " + failed + " gate change(s) were skipped. Check the command and reward IDs in the wizard.");
        return failed == 0;
    }

    private string Text(JObject value, string name, int maximum)
    {
        JToken token = value[name];
        string text = token == null || token.Type == JTokenType.Null ? "" : token.ToString().Trim();
        text = text.Replace("\r", " ").Replace("\n", " ");
        return text.Length <= maximum ? text : text.Substring(0, maximum);
    }

    private string Read(string name, int maximum)
    {
        object value;
        string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value).Trim() : "";
        return text.Length <= maximum ? text : text.Substring(0, maximum);
    }

    private bool Fail(string reason)
    {
        CPH.LogWarn("THSV Scene Gates: " + reason);
        return false;
    }
}
