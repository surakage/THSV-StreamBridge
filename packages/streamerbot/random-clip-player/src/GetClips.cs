// Purpose: Fetches the broadcaster's own Twitch clip library and relays bounded metadata to the
// Random Clip Player add-on over the local bridge WebSocket. Resolving a playable download URL is
// deliberately a separate action (GetClipDownload.cs) requested per clip at play time: Twitch's
// clip download URLs are short-lived/signed, so resolving one for every clip in a batch fetch here
// would be wasted work for clips that never get played, and a cached URL from this fetch could
// already be expired by the time the add-on picks that clip.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using Twitch.Common.Models.Api;

public class CPHInline
{
    private const string ModuleId = "thsv.random-clip-player";
    private const int DefaultClipCount = 20;
    private const int MaximumClipCount = 100;

    public bool Execute()
    {
        string relayToken = ReadArgument("thsvAddonRelayToken");
        if (String.IsNullOrWhiteSpace(relayToken)) return Fail("the bridge did not supply an add-on relay token.");
        int clipCount = BoundedClipCount();
        TwitchUserInfo broadcaster;
        try { broadcaster = CPH.TwitchGetBroadcaster(); }
        catch (Exception exception) { return Fail("could not read the connected Twitch broadcaster (" + exception.GetType().Name + ")."); }
        if (broadcaster == null || String.IsNullOrWhiteSpace(broadcaster.UserLogin)) return Fail("no Twitch broadcaster is connected to Streamer.bot.");

        List<ClipData> clips;
        try { clips = CPH.GetClipsForUser(broadcaster.UserLogin, clipCount, null); }
        catch (Exception exception) { return Fail("Twitch clip retrieval failed (" + exception.GetType().Name + ")."); }
        if (clips == null) clips = new List<ClipData>();

        var clipArray = new JArray();
        foreach (ClipData clip in clips)
        {
            if (clip == null || String.IsNullOrWhiteSpace(clip.Id)) continue;
            clipArray.Add(new JObject
            {
                ["id"] = clip.Id,
                ["title"] = Bounded(clip.Title, 500),
                ["creatorName"] = Bounded(clip.CreatorName, 100),
                ["url"] = clip.Url,
                ["thumbnailUrl"] = clip.ThumbnailUrl,
                ["durationSeconds"] = clip.Duration,
                ["createdAt"] = clip.CreatedAt.ToString("O"),
                ["gameId"] = clip.GameId,
                ["viewCount"] = clip.ViewCount,
            });
        }

        string relayId = Guid.NewGuid().ToString("N");
        var message = new JObject
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.random-clip-player.clips-received",
            ["sourceEventType"] = "THSV Addon - Random Clip Player - Get Clips",
            ["relayId"] = relayId,
            ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false,
            ["payload"] = new JObject
            {
                ["broadcasterLogin"] = broadcaster.UserLogin,
                ["requestedCount"] = clipCount,
                ["clips"] = clipArray,
            },
        };
        try { CPH.WebsocketBroadcastJson(message.ToString(Newtonsoft.Json.Formatting.None)); }
        catch (Exception exception) { return Fail("relaying the clip list failed (" + exception.GetType().Name + ")."); }

        CPH.SetArgument("randomClipPlayerRelayValid", true);
        CPH.SetArgument("randomClipPlayerRelayError", "");
        CPH.SetArgument("randomClipPlayerRelayId", relayId);
        CPH.SetArgument("randomClipPlayerClipCount", clipArray.Count);
        return true;
    }

    private int BoundedClipCount()
    {
        object rawValue;
        int requested;
        if (!CPH.TryGetArg("clipCount", out rawValue) || rawValue == null || !Int32.TryParse(rawValue.ToString(), out requested)) return DefaultClipCount;
        if (requested < 1) return 1;
        if (requested > MaximumClipCount) return MaximumClipCount;
        return requested;
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
        CPH.SetArgument("randomClipPlayerRelayValid", false);
        CPH.SetArgument("randomClipPlayerRelayError", reason);
        CPH.LogError("THSV Random Clip Player - Get Clips failed: " + reason);
        return false;
    }
}
