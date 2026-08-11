// Purpose: Starts one creator-approved Twitch ending ad for Raid Scout and reports whether
// Twitch accepted the request. A successful request is not timer authority: Raid Scout still
// waits for the genuine Twitch Ads > Ad Run trigger before ending any broadcast.
// Keep this action triggerless.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.raid-scout";
    private const string ResultEvent = "addon.thsv.raid-scout.controller-result";
    private const string SourceName = "THSV Addon - Raid Scout - Run Ending Ad";

    public bool Execute()
    {
        string requestId = Bounded(Read("raidScoutRequestId"), 100);
        string relayToken = Bounded(Read("thsvAddonRelayToken"), 100);
        object rawDuration;
        int requested = 180;
        if (CPH.TryGetArg("raidScoutAdDurationSeconds", out rawDuration) && rawDuration != null)
            Int32.TryParse(rawDuration.ToString(), out requested);

        int duration = IsAllowedDuration(requested) ? requested : 180;
        bool started = false;
        string error = "";
        try { started = CPH.TwitchRunCommercial(duration); }
        catch (Exception exception)
        {
            error = "Twitch could not start the ending ad (" + exception.GetType().Name + ").";
            CPH.LogError("THSV Raid Scout could not request the ending Twitch ad (" + exception.GetType().Name + ").");
        }

        if (!started && error.Length == 0)
        {
            error = "Twitch did not accept the ending ad request.";
            CPH.LogWarn("THSV Raid Scout requested the ending Twitch ad, but Twitch did not accept it. The broadcast will remain live unless a genuine Ad Run event arrives.");
        }
        if (started) CPH.LogInfo("THSV Raid Scout requested one " + duration.ToString() + " second ending Twitch ad. Waiting for Twitch Ads > Ad Run confirmation.");

        if (requestId.Length > 0 && relayToken.Length >= 20) Emit(requestId, relayToken, started, error, duration);
        CPH.SetArgument("raidScoutEndingAdAccepted", started);
        CPH.SetArgument("raidScoutEndingAdError", error);
        return started;
    }

    private void Emit(string requestId, string relayToken, bool success, string error, int duration)
    {
        var envelope = new JObject
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = ResultEvent,
            ["sourceEventType"] = SourceName,
            ["relayId"] = "raid-scout-ending-ad-" + Guid.NewGuid().ToString("N"),
            ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false,
            ["payload"] = new JObject
            {
                ["operation"] = "ending-ad-request",
                ["requestId"] = requestId,
                ["success"] = success,
                ["error"] = error,
                ["durationSeconds"] = duration
            }
        };
        CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None));
    }

    private string Read(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? value.ToString().Trim() : "";
    }

    private string Bounded(string value, int maximum)
    {
        if (String.IsNullOrEmpty(value)) return "";
        return value.Length <= maximum ? value : value.Substring(0, maximum);
    }

    private bool IsAllowedDuration(int value)
    {
        return value == 30 || value == 60 || value == 90 || value == 120 || value == 150 || value == 180;
    }
}
