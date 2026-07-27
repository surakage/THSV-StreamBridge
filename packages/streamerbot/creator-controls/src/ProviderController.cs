// Purpose: Applies one broker-validated channel profile to Twitch, YouTube, and/or Kick, then
// returns bounded per-platform results to the requesting add-on. Keep this action triggerless.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken"); string moduleId = Read("providerControlModuleId"); string resultEvent = Read("providerControlResultEvent");
        string requestId = Read("providerControlRequestId"); string profileId = Read("providerControlProfileId");
        if (token.Length < 20 || moduleId != "thsv.creator-controls" || resultEvent != "addon.thsv.creator-controls.result" || requestId.Length == 0) return Fail("the broker authorization arguments were missing or invalid.");
        var requested = new HashSet<string>(Read("providerControlPlatforms").Split(','), StringComparer.OrdinalIgnoreCase);
        var results = new JArray(); bool allSucceeded = true;
        foreach (string platform in new [] { "twitch", "youtube", "kick" })
        {
            if (!requested.Contains(platform)) continue;
            bool success = Apply(platform); allSucceeded = allSucceeded && success;
            results.Add(new JObject { ["platform"] = platform, ["success"] = success });
        }
        if (results.Count == 0) return Fail("no supported platform was selected.");
        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = moduleId, ["eventType"] = resultEvent,
            ["sourceEventType"] = "THSV Addon - Creator Controls - Provider Controller", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false,
            ["payload"] = new JObject { ["requestId"] = requestId, ["profileId"] = profileId, ["success"] = allSucceeded, ["resultCount"] = results.Count, ["results"] = results }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { return Fail("the provider result could not be relayed (" + error.GetType().Name + ")."); }
        CPH.SetArgument("providerControlSuccess", allSucceeded); CPH.SetArgument("providerControlResultCount", results.Count); CPH.SetArgument("providerControlError", "");
        return allSucceeded;
    }

    private bool Apply(string platform)
    {
        string title = Read("providerControlTitle");
        try
        {
            if (platform == "twitch")
            {
                bool ok = title.Length == 0 || CPH.SetChannelTitle(title);
                string categoryId = Read("providerControlTwitchCategoryId");
                return ok && (categoryId.Length == 0 || CPH.SetChannelGameById(categoryId));
            }
            if (platform == "youtube")
            {
                string broadcastId = Read("providerControlYoutubeBroadcastId"); string category = Read("providerControlYoutubeCategoryName");
                bool titleOk = title.Length == 0 || (broadcastId.Length == 0 ? CPH.YouTubeSetTitle(title) : CPH.YouTubeSetTitle(title, broadcastId));
                bool categoryOk = category.Length == 0 || (broadcastId.Length == 0 ? CPH.YouTubeSetCategory(category) : CPH.YouTubeSetCategory(category, broadcastId));
                return titleOk && categoryOk;
            }
            if (platform == "kick")
            {
                bool titleOk = title.Length == 0 || CPH.KickSetTitle(title); string category = Read("providerControlKickCategoryName");
                return titleOk && (category.Length == 0 || CPH.KickSetCategory(category) != null);
            }
        }
        catch (Exception error) { CPH.LogWarn("THSV Creator Controls " + platform + " update failed (" + error.GetType().Name + ")."); }
        return false;
    }
    private string Read(string name) { object value; return CPH.TryGetArg(name, out value) && value != null ? Clean(Convert.ToString(value, CultureInfo.InvariantCulture), 256) : ""; }
    private string Clean(string value, int maximum) { value = (value ?? "").Trim(); return value.Length <= maximum ? value : value.Substring(0, maximum); }
    private bool Fail(string reason) { CPH.SetArgument("providerControlSuccess", false); CPH.SetArgument("providerControlError", reason); CPH.LogError("THSV Creator Controls controller failed: " + reason); return false; }
}
