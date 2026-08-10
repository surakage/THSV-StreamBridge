// Purpose: Creates a 30- or 60-second Twitch clip when Clip Courier dispatches the
// intake-owned !clip command through StreamBridge's approved-action broker,
// then returns only bounded public clip metadata to Clip Courier for Discord delivery.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, Twitch.Common, and Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Twitch.Common.Models.Api;

public class CPHInline
{
    public bool Execute()
    {
        string relayToken = Read("thsvAddonRelayToken", 256);
        if (relayToken.Length < 16) return Fail("The one-use StreamBridge relay token is missing.");
        string source = Read("commandSource", 20).ToLowerInvariant();
        if (!source.Contains("twitch")) return Fail("The !clip command is available only from Twitch chat.");

        // The editable Set Argument above this script is the only creator-facing duration control.
        // Values below 45 become 30 seconds; values of 45 or more become 60 seconds.
        int duration = ReadInteger("clipCourierDurationSeconds", 30) >= 45 ? 60 : 30;
        ClipData clip;
        try { clip = CPH.CreateClip(null, duration); }
        catch (Exception error) { return Fail("Twitch clip creation failed (" + error.GetType().Name + ")."); }
        if (clip == null || String.IsNullOrWhiteSpace(clip.Id) || String.IsNullOrWhiteSpace(clip.Url)) return Fail("Twitch did not return a usable clip.");

        string requestedBy = First("userName", "user", "displayName", 100);
        if (requestedBy.Length == 0) requestedBy = "viewer";
        string createdAt = clip.CreatedAt.ToString("O");
        var payload = new JObject {
            ["id"] = Bounded(clip.Id, 100),
            ["url"] = Bounded(clip.Url, 500),
            ["title"] = Bounded(clip.Title, 200),
            ["creatorName"] = requestedBy,
            ["createdAt"] = createdAt,
            ["durationSeconds"] = duration,
            ["source"] = "command"
        };
        var envelope = new JObject {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.clip-courier",
            ["eventType"] = "addon.thsv.clip-courier.clip-created",
            ["sourceEventType"] = "THSV Addon - Clip Courier - Create Clip",
            ["relayId"] = "created-" + Bounded(clip.Id, 100), ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = payload
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { return Fail("The created clip could not be sent to StreamBridge (" + error.GetType().Name + ")."); }

        CPH.SetArgument("clipCourierCreateSuccess", true);
        CPH.SetArgument("clipCourierCreatedClipId", Bounded(clip.Id, 100));
        CPH.SetArgument("clipCourierCreatedClipUrl", Bounded(clip.Url, 500));
        CPH.SetArgument("clipCourierCreateError", "");
        CPH.LogInfo("THSV Clip Courier created a " + duration + " second clip for " + requestedBy + ".");
        return true;
    }

    private string Read(string key, int maximum) { object value; string text = CPH.TryGetArg(key, out value) && value != null ? Convert.ToString(value).Trim() : ""; return Bounded(text, maximum); }
    private int ReadInteger(string key, int fallback) { int value; return Int32.TryParse(Read(key, 20), out value) ? value : fallback; }
    private string First(string a, string b, string c, int maximum) { string value = Read(a, maximum); if (value.Length == 0) value = Read(b, maximum); if (value.Length == 0) value = Read(c, maximum); return value; }
    private string Bounded(string value, int maximum) { value = value ?? ""; return value.Length <= maximum ? value : value.Substring(0, maximum); }
    private bool Fail(string reason) { CPH.SetArgument("clipCourierCreateSuccess", false); CPH.SetArgument("clipCourierCreateError", reason); CPH.LogWarn("THSV Clip Courier: " + reason); return false; }
}
