// Purpose: Returns bounded Twitch clip metadata to Clip Courier for stable-ID discovery.
// References: mscorlib.dll, System.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using Twitch.Common.Models.Api;
public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 100); if (token.Length < 20) return Fail("The broker relay token was missing.");
        int count = Int("clipCount", 20, 1, 100); TwitchUserInfo broadcaster;
        try { broadcaster = CPH.TwitchGetBroadcaster(); } catch (Exception error) { return Fail("Twitch broadcaster lookup failed (" + error.GetType().Name + ")."); }
        if (broadcaster == null || String.IsNullOrWhiteSpace(broadcaster.UserLogin)) return Fail("No Twitch broadcaster is connected.");
        List<ClipData> clips; try { clips = CPH.GetClipsForUser(broadcaster.UserLogin, count, null); } catch (Exception error) { return Fail("Twitch clip lookup failed (" + error.GetType().Name + ")."); }
        var values = new JArray(); foreach (ClipData clip in clips ?? new List<ClipData>()) if (clip != null && !String.IsNullOrWhiteSpace(clip.Id)) values.Add(new JObject { ["id"] = Bounded(clip.Id, 100), ["title"] = Bounded(clip.Title, 200), ["creatorName"] = Bounded(clip.CreatorName, 100), ["url"] = Bounded(clip.Url, 500), ["thumbnailUrl"] = Bounded(clip.ThumbnailUrl, 500), ["createdAt"] = clip.CreatedAt.ToString("O") });
        var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.clip-courier", ["eventType"] = "addon.thsv.clip-courier.clips-received", ["sourceEventType"] = "THSV Addon - Clip Courier - Get Clips", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token, ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = new JObject { ["clips"] = values } };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Newtonsoft.Json.Formatting.None)); } catch (Exception error) { return Fail("Clip relay failed (" + error.GetType().Name + ")."); }
        CPH.SetArgument("clipCourierClipCount", values.Count); return true;
    }
    private string Read(string key, int max) { object value; string text = CPH.TryGetArg(key, out value) && value != null ? Convert.ToString(value).Trim() : ""; return Bounded(text, max); }
    private int Int(string key, int fallback, int min, int max) { int value; return Int32.TryParse(Read(key, 20), out value) ? Math.Min(max, Math.Max(min, value)) : fallback; }
    private string Bounded(string value, int max) { value = value ?? ""; return value.Length <= max ? value : value.Substring(0, max); }
    private bool Fail(string reason) { CPH.SetArgument("clipCourierValid", false); CPH.SetArgument("clipCourierError", reason); CPH.LogError("THSV Clip Courier discovery failed: " + reason); return false; }
}
