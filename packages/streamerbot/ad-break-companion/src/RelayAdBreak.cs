// Purpose: Relays only documented Twitch Upcoming Ad and Ad Run timing into Ad Break Companion.
// Preview Upcoming, Preview Active, and Clear Display are triggerless creator controls for offline sizing.
// References: mscorlib.dll, System.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.ad-break-companion";

    public bool Execute()
    {
        string mode = Read("adBreakMode").ToLowerInvariant();
        if (mode != "upcoming" && mode != "started" && mode != "preview-upcoming" && mode != "preview-active" && mode != "hide")
            return Fail("adBreakMode must be upcoming, started, preview-upcoming, preview-active, or hide.");

        string eventType = mode == "upcoming" ? "addon.thsv.ad-break-companion.upcoming"
            : mode == "started" ? "addon.thsv.ad-break-companion.started"
            : "addon.thsv.ad-break-companion.control";
        string sourceEventType = mode == "upcoming" ? "TwitchUpcomingAd"
            : mode == "started" ? "TwitchAdRun"
            : mode == "preview-upcoming" ? "THSV Addon - Ad Break Companion - Preview Upcoming"
            : mode == "preview-active" ? "THSV Addon - Ad Break Companion - Preview Active"
            : "THSV Addon - Ad Break Companion - Clear Display";
        var payload = new JObject();

        if (mode == "upcoming")
        {
            int minutes = ReadInt("minutes", 1, 60, 1);
            int adLength = ReadInt("adLength", 1, 18000, 30);
            int snoozesLeft = ReadInt("snoozesLeft", 0, 100, 0);
            payload["minutes"] = minutes;
            payload["nextAdAt"] = ReadUtcDate("nextAdAt", DateTimeOffset.UtcNow.AddMinutes(minutes));
            payload["adLength"] = adLength;
            payload["snoozesLeft"] = snoozesLeft;
        }
        else if (mode == "started")
        {
            int adLength = ReadInt("adLength", 1, 18000, 30);
            payload["adLength"] = adLength;
            payload["adLengthMs"] = ReadInt("adLengthMs", 1000, 18000000, adLength * 1000);
            payload["adScheduled"] = ReadBool("adScheduled");
        }
        else
        {
            payload["action"] = mode;
            if (mode == "preview-upcoming") payload["seconds"] = 60;
            if (mode == "preview-active") payload["seconds"] = 90;
        }

        string relayId = Guid.NewGuid().ToString("N");
        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId,
            ["eventType"] = eventType, ["sourceEventType"] = sourceEventType,
            ["relayId"] = relayId, ["relayToken"] = "", ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = mode == "preview-upcoming" || mode == "preview-active" || mode == "hide" || ReadBool("isTest"), ["payload"] = payload
        };

        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { return Fail("the local ad timing event could not be relayed (" + error.GetType().Name + ")."); }

        CPH.SetArgument("adBreakRelayValid", true);
        CPH.SetArgument("adBreakRelayError", "");
        CPH.SetArgument("adBreakRelayMode", mode);
        CPH.SetArgument("adBreakRelayId", relayId);
        CPH.LogInfo("THSV Ad Break Companion relayed: " + mode + ".");
        return true;
    }

    private string Read(string name)
    {
        object value;
        string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture) : "";
        text = (text ?? "").Trim();
        return text.Length <= 200 ? text : text.Substring(0, 200);
    }

    private int ReadInt(string name, int minimum, int maximum, int fallback)
    {
        int value;
        return Int32.TryParse(Read(name), NumberStyles.Integer, CultureInfo.InvariantCulture, out value) && value >= minimum && value <= maximum ? value : fallback;
    }

    private bool ReadBool(string name)
    {
        object value;
        if (!CPH.TryGetArg(name, out value) || value == null) return false;
        if (value is bool) return (bool)value;
        bool parsed;
        return Boolean.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out parsed) && parsed;
    }

    private string ReadUtcDate(string name, DateTimeOffset fallback)
    {
        object value;
        if (CPH.TryGetArg(name, out value) && value != null)
        {
            if (value is DateTimeOffset) return ((DateTimeOffset)value).ToUniversalTime().ToString("O");
            if (value is DateTime) return new DateTimeOffset(((DateTime)value).ToUniversalTime()).ToString("O");
            DateTimeOffset parsed;
            if (DateTimeOffset.TryParse(Convert.ToString(value, CultureInfo.CurrentCulture), CultureInfo.CurrentCulture, DateTimeStyles.AssumeLocal, out parsed))
                return parsed.ToUniversalTime().ToString("O");
        }
        return fallback.ToUniversalTime().ToString("O");
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("adBreakRelayValid", false);
        CPH.SetArgument("adBreakRelayError", reason);
        CPH.LogError("THSV Ad Break Companion failed: " + reason);
        return false;
    }
}
