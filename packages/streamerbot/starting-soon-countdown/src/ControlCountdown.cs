// Purpose: Relays one approved Starting Soon Countdown control to the local StreamBridge process.
// Each imported action sets countdownAction above this C# block. Set & Start also exposes
// countdownSeconds, so creators can change a one-off duration without editing source code.
// References: mscorlib.dll, System.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.starting-soon-countdown";
    private const int MaximumSeconds = 86400;

    public bool Execute()
    {
        string action = Read("countdownAction").ToLowerInvariant();
        if (!IsAllowedAction(action))
            return Fail("the countdownAction argument was missing or unsupported.");

        int seconds = 0;
        if (action == "set-and-start" && !TryReadBoundedSeconds(out seconds))
            return Fail("countdownSeconds must be a whole number from 1 through 86400.");

        string relayId = Guid.NewGuid().ToString("N");
        var payload = new JObject { ["action"] = action };
        if (action == "set-and-start") payload["seconds"] = seconds;
        var envelope = new JObject
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.starting-soon-countdown.control",
            ["sourceEventType"] = "THSV Addon - Starting Soon Countdown - " + DisplayAction(action),
            ["relayId"] = relayId,
            ["relayToken"] = "",
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false,
            ["payload"] = payload,
        };

        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { return Fail("the local countdown control could not be relayed (" + error.GetType().Name + ")."); }

        CPH.SetArgument("countdownControlValid", true);
        CPH.SetArgument("countdownControlError", "");
        CPH.SetArgument("countdownControlAction", action);
        CPH.SetArgument("countdownControlSeconds", seconds);
        CPH.SetArgument("countdownRelayId", relayId);
        CPH.LogInfo("THSV Starting Soon Countdown control relayed: " + action + (seconds > 0 ? " (" + seconds.ToString(CultureInfo.InvariantCulture) + " seconds)." : "."));
        return true;
    }

    private bool IsAllowedAction(string action)
    {
        return action == "start" || action == "stop" || action == "pause" || action == "resume" || action == "reset"
            || action == "complete" || action == "set-and-start";
    }

    private string Read(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture).Trim() : "";
    }

    private bool TryReadBoundedSeconds(out int seconds)
    {
        return Int32.TryParse(Read("countdownSeconds"), NumberStyles.Integer, CultureInfo.InvariantCulture, out seconds)
            && seconds >= 1 && seconds <= MaximumSeconds;
    }

    private string DisplayAction(string action)
    {
        if (action == "set-and-start") return "Set & Start";
        if (action == "complete") return "Complete Now";
        return Char.ToUpperInvariant(action[0]) + action.Substring(1);
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("countdownControlValid", false);
        CPH.SetArgument("countdownControlError", reason);
        CPH.LogError("THSV Starting Soon Countdown control failed: " + reason);
        return false;
    }
}
