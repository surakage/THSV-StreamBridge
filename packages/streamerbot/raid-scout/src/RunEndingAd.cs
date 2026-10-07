// Purpose: Starts one creator-approved Twitch ending ad for Raid Scout and reports whether
// Twitch accepted the request. A successful request is not timer authority: Raid Scout still
// waits for the genuine Twitch Ads > Ad Run trigger before ending any broadcast.
// Keep this action triggerless.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.raid-scout";
    private const string ResultEvent = "addon.thsv.raid-scout.controller-result";
    private const string SourceName = "THSV Addon - Raid Scout - Run Ending Ad";

    public bool Execute()
    {
        object dry;
        if (CPH.TryGetArg("raidScoutAdTestDryRun", out dry) && Convert.ToString(dry).Equals("true", StringComparison.OrdinalIgnoreCase))
        {
            CPH.LogInfo("THSV ad controller offline compile check passed; no commercial requested.");
            return true;
        }
        string requestId = Bounded(Read("raidScoutRequestId"), 100);
        string relayToken = Bounded(Read("thsvAddonRelayToken"), 100);
        object rawDuration;
        int requested = 180;
        if (CPH.TryGetArg("raidScoutAdDurationSeconds", out rawDuration) && rawDuration != null)
            Int32.TryParse(rawDuration.ToString(), out requested);

        int duration = IsAllowedDuration(requested) ? requested : 180;
        bool started = false;
        string error = "";
        try { started = RequestCommercial(duration, out error); }
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

    private bool RequestCommercial(int duration, out string error)
    {
        error = "";
        var broadcaster = CPH.TwitchGetBroadcaster();
        if (broadcaster == null) { error = "Twitch broadcaster authentication is unavailable."; return false; }
        using (var client = new HttpClient())
        using (var request = new HttpRequestMessage(HttpMethod.Post, "https://api.twitch.tv/helix/channels/commercial"))
        using (var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10)))
        {
            request.Headers.Add("Client-ID", CPH.TwitchClientId);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", CPH.TwitchOAuthToken);
            request.Content = new StringContent(new JObject { ["broadcaster_id"] = broadcaster.UserId, ["length"] = duration }.ToString(Formatting.None), System.Text.Encoding.UTF8, "application/json");
            using (var response = client.SendAsync(request, cancellation.Token).GetAwaiter().GetResult())
            {
                string body = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (body.Length > 262144) { error = "Twitch returned an oversized commercial response."; return false; }
                JObject result = JObject.Parse(body);
                if (!response.IsSuccessStatusCode)
                {
                    error = "Twitch commercial rejected (HTTP " + ((int)response.StatusCode).ToString() + "): " + Bounded((string)result["message"], 200);
                    CPH.LogWarn("THSV ad controller: " + error + " No delayed retry will be queued.");
                    return false;
                }
                JArray data = result["data"] as JArray;
                if (data == null || data.Count != 1 || ((int?)data[0]["length"] ?? 0) <= 0)
                { error = "Twitch did not confirm a commercial was accepted."; return false; }
                CPH.LogInfo("THSV ad controller: Twitch accepted " + ((int)data[0]["length"]).ToString() + " seconds; waiting for genuine Ad Run timing.");
                return true;
            }
        }
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
