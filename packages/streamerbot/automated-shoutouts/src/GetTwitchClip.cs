// Purpose: Selects one bounded random clip from the verified Twitch shoutout target and relays a
// short-lived playable URL to the Automated Shoutouts add-on. StreamBridge owns presentation;
// this action never mutates OBS scenes, sends chat, or contacts undocumented Twitch endpoints.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using Twitch.Common.Models.Api;

public class CPHInline
{
    private const string ModuleId = "thsv.automated-shoutouts";
    private static readonly Random Random = new Random();
    private static readonly object RandomLock = new object();

    public bool Execute()
    {
        string relayToken = ReadArgument("thsvAddonRelayToken");
        if (String.IsNullOrWhiteSpace(relayToken)) return Fail("StreamBridge did not dispatch this clip lookup.");
        string lookupId = Bounded(ReadArgument("lookupId"), 100);
        string userName = Bounded(ReadArgument("targetUserName").TrimStart('@'), 256);
        if (String.IsNullOrWhiteSpace(lookupId) || String.IsNullOrWhiteSpace(userName)) return Fail("A lookup ID and Twitch target are required.");

        int clipCount = BoundedInteger("clipCount", 20, 1, 100);
        int maximumAgeDays = BoundedInteger("maximumAgeDays", 90, 1, 3650);
        int maximumDurationSeconds = BoundedInteger("maximumDurationSeconds", 30, 5, 60);
        bool preferPopular = ReadBoolean("preferPopular", false);

        List<ClipData> clips;
        try { clips = CPH.GetClipsForUser(userName, clipCount, null); }
        catch (Exception exception) { return Fail("Twitch clip retrieval failed (" + exception.GetType().Name + ")."); }
        DateTime cutoff = DateTime.UtcNow.AddDays(-maximumAgeDays);
        // Keep the action compatible with Streamer.bot's minimal default references by avoiding LINQ.
        List<ClipData> eligible = new List<ClipData>();
        foreach (ClipData clip in clips ?? new List<ClipData>())
        {
            if (clip == null || String.IsNullOrWhiteSpace(clip.Id)) continue;
            if (clip.Duration <= 0 || clip.Duration > maximumDurationSeconds) continue;
            if (clip.CreatedAt < cutoff) continue;
            eligible.Add(clip);
        }
        if (eligible.Count == 0) return Relay(relayToken, lookupId, null, null);

        ClipData selected = SelectClip(eligible, preferPopular);
        ClipDownloadData download;
        try { download = CPH.TwitchGetClipDownloadUrls(selected.Id); }
        catch (Exception exception) { return Fail("Twitch clip download resolution failed (" + exception.GetType().Name + ")."); }
        return Relay(relayToken, lookupId, selected, download);
    }

    private ClipData SelectClip(List<ClipData> clips, bool preferPopular)
    {
        lock (RandomLock)
        {
            if (!preferPopular) return clips[Random.Next(clips.Count)];
            double total = 0;
            foreach (ClipData clip in clips) total += Math.Max(0, clip.ViewCount) + 1.0;
            double value = Random.NextDouble() * total;
            foreach (ClipData clip in clips)
            {
                value -= Math.Max(0, clip.ViewCount) + 1.0;
                if (value <= 0) return clip;
            }
            return clips[clips.Count - 1];
        }
    }

    private bool Relay(string relayToken, string lookupId, ClipData clip, ClipDownloadData download)
    {
        bool found = clip != null && download != null && !String.IsNullOrWhiteSpace(download.LandscapeDownloadUrl);
        var payload = new JObject
        {
            ["lookupId"] = lookupId,
            ["found"] = found,
        };
        if (found)
        {
            payload["clipId"] = Bounded(clip.Id, 100);
            payload["title"] = Bounded(clip.Title, 300);
            payload["thumbnailUrl"] = Bounded(clip.ThumbnailUrl, 4096);
            payload["durationSeconds"] = clip.Duration;
            payload["landscapeUrl"] = Bounded(download.LandscapeDownloadUrl, 4096);
        }
        var envelope = new JObject
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.automated-shoutouts.twitch-clip-received",
            ["sourceEventType"] = "THSV Addon - Automated Shoutouts - Get Twitch Clip",
            ["relayId"] = Guid.NewGuid().ToString("N"),
            ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false,
            ["payload"] = payload,
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Newtonsoft.Json.Formatting.None)); }
        catch (Exception exception) { return Fail("Relaying the Twitch clip failed (" + exception.GetType().Name + ")."); }

        CPH.SetArgument("automatedShoutoutClipValid", true);
        CPH.SetArgument("automatedShoutoutClipFound", found);
        CPH.SetArgument("automatedShoutoutClipId", found ? clip.Id : "");
        return true;
    }

    private int BoundedInteger(string name, int fallback, int minimum, int maximum)
    {
        int parsed;
        string value = ReadArgument(name);
        if (!Int32.TryParse(value, out parsed)) return fallback;
        return Math.Max(minimum, Math.Min(maximum, parsed));
    }

    private bool ReadBoolean(string name, bool fallback)
    {
        bool parsed;
        return Boolean.TryParse(ReadArgument(name), out parsed) ? parsed : fallback;
    }

    private string ReadArgument(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? value.ToString().Trim() : "";
    }

    private string Bounded(string value, int maximumLength)
    {
        if (String.IsNullOrEmpty(value)) return "";
        return value.Length > maximumLength ? value.Substring(0, maximumLength) : value;
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("automatedShoutoutClipValid", false);
        CPH.SetArgument("automatedShoutoutClipFound", false);
        CPH.LogWarn("THSV Automated Shoutouts clip lookup: " + reason);
        return false;
    }
}
