// Purpose: Fetches one bounded broadcaster clip metadata snapshot for all shared clip consumers.
// Keep triggerless. Signed playback URLs and video bytes are deliberately excluded.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Twitch.Common.Models.Api;
public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 100); if (token.Length < 20) return Fail("The broker relay token was missing.");
        int count = ReadInteger("clipCount", 40, 1, 100); TwitchUserInfo broadcaster;
        try { broadcaster = CPH.TwitchGetBroadcaster(); } catch (Exception error) { return Fail("Twitch broadcaster lookup failed (" + error.GetType().Name + ")."); }
        if (broadcaster == null || String.IsNullOrWhiteSpace(broadcaster.UserLogin)) return Fail("No Twitch broadcaster is connected.");
        List<ClipData> clips; try { clips = CPH.GetClipsForUser(broadcaster.UserLogin, count, null); } catch (Exception error) { return Fail("Twitch clip lookup failed (" + error.GetType().Name + ")."); }
        var values = new JArray(); foreach (ClipData clip in clips ?? new List<ClipData>()) if (clip != null && !String.IsNullOrWhiteSpace(clip.Id)) values.Add(new JObject { ["id"] = Bounded(clip.Id, 100), ["title"] = Bounded(clip.Title, 200), ["creatorName"] = Bounded(clip.CreatorName, 100), ["url"] = Bounded(clip.Url, 500), ["thumbnailUrl"] = Bounded(clip.ThumbnailUrl, 500), ["durationSeconds"] = clip.Duration, ["createdAt"] = clip.CreatedAt.ToString("O") });
        var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.clip-library-cache", ["eventType"] = "addon.thsv.clip-library-cache.snapshot", ["sourceEventType"] = "THSV Addon - Clip Library Cache - Refresh", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token, ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = new JObject { ["clips"] = values } };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); } catch (Exception error) { return Fail("Clip relay failed (" + error.GetType().Name + ")."); }
        CPH.SetArgument("clipLibraryCacheValid", true); CPH.SetArgument("clipLibraryCacheCount", values.Count); return true;
    }
    private string Read(string key, int max) { object value; string text = CPH.TryGetArg(key, out value) && value != null ? Convert.ToString(value).Trim() : ""; return Bounded(text, max); }
    private int ReadInteger(string key, int fallback, int min, int max) { int value; return Int32.TryParse(Read(key, 20), out value) ? Math.Min(max, Math.Max(min, value)) : fallback; }
    private string Bounded(string value, int max) { value = value ?? ""; return value.Length <= max ? value : value.Substring(0, max); }
    private bool Fail(string reason) { CPH.SetArgument("clipLibraryCacheValid", false); CPH.SetArgument("clipLibraryCacheError", reason); CPH.LogWarn("THSV Clip Library Cache: " + reason); return false; }
}
