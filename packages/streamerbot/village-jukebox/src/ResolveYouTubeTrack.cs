// Purpose: Resolves one broker-approved YouTube link or title into bounded, playable metadata
// and returns it to Village Jukebox without exposing the creator's API key to StreamBridge.
// References: mscorlib.dll, System.dll, System.Xml.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.village-jukebox";
    private const int MaximumResponseCharacters = 262144;
    private static readonly Regex VideoIdPattern = new Regex("^[A-Za-z0-9_-]{11}$", RegexOptions.CultureInvariant);

    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 256), requestId = Read("villageJukeboxRequestId", 100), query = Normalize(Read("villageJukeboxQuery", 300));
        string platform = Read("villageJukeboxPlatform", 20).ToLowerInvariant(), userId = Read("villageJukeboxUserId", 256), requester = Normalize(Read("villageJukeboxRequesterName", 80));
        string requestEventId = Read("villageJukeboxRequestEventId", 256), rewardPlatform = Read("villageJukeboxRewardPlatform", 20).ToLowerInvariant();
        string rewardId = Read("villageJukeboxRewardId", 256), redemptionId = Read("villageJukeboxRedemptionId", 256), apiKey = Read("villageJukeboxYouTubeApiKey", 256);
        int pointCost = ReadInteger("villageJukeboxPointCost", 0, 1000000, 0);
        if (token.Length < 20 || String.IsNullOrWhiteSpace(requestId)) return Fail("StreamBridge did not authorize this lookup.");
        if (String.IsNullOrWhiteSpace(query) || String.IsNullOrWhiteSpace(userId) || String.IsNullOrWhiteSpace(requester)) return Relay(token, requestId, false, "The request text or stable viewer identity was missing.", platform, userId, requester, requestEventId, pointCost, rewardPlatform, rewardId, redemptionId, null);
        if (!IsPlatform(platform)) return Relay(token, requestId, false, "The request platform was invalid.", platform, userId, requester, requestEventId, pointCost, rewardPlatform, rewardId, redemptionId, null);
        if (String.IsNullOrWhiteSpace(apiKey) || apiKey.StartsWith("PASTE_", StringComparison.OrdinalIgnoreCase)) return Relay(token, requestId, false, "Set villageJukeboxYouTubeApiKey in the resolver action first.", platform, userId, requester, requestEventId, pointCost, rewardPlatform, rewardId, redemptionId, null);

        Track track = null; string error = "";
        try
        {
            string videoId = ExtractVideoId(query);
            if (String.IsNullOrWhiteSpace(videoId)) videoId = SearchVideo(query, apiKey);
            if (String.IsNullOrWhiteSpace(videoId)) error = "YouTube did not find a matching video.";
            else track = LoadTrack(videoId, apiKey);
            if (track == null && String.IsNullOrWhiteSpace(error)) error = "The YouTube video is private, unavailable, unembeddable, live, or missing duration metadata.";
        }
        catch (WebException) { error = "YouTube lookup failed or timed out."; }
        catch (InvalidDataException) { error = "YouTube returned an invalid or oversized response."; }
        catch (Exception exception) { error = "Unexpected YouTube lookup failure."; CPH.LogWarn("THSV Village Jukebox resolver failed (" + exception.GetType().Name + ")."); }
        return Relay(token, requestId, track != null, error, platform, userId, requester, requestEventId, pointCost, rewardPlatform, rewardId, redemptionId, track);
    }

    private string SearchVideo(string query, string apiKey)
    {
        string url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&safeSearch=moderate&maxResults=1&q=" + Uri.EscapeDataString(query) + "&key=" + Uri.EscapeDataString(apiKey);
        JObject root = RequestJson(url); JArray items = root["items"] as JArray;
        if (items == null || items.Count == 0) return "";
        string id = Convert.ToString(items[0]["id"]?["videoId"]) ?? "";
        return VideoIdPattern.IsMatch(id) ? id : "";
    }

    private Track LoadTrack(string videoId, string apiKey)
    {
        string url = "https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=" + Uri.EscapeDataString(videoId) + "&key=" + Uri.EscapeDataString(apiKey);
        JObject root = RequestJson(url); JArray items = root["items"] as JArray;
        if (items == null || items.Count != 1) return null;
        JToken item = items[0], snippet = item["snippet"], details = item["contentDetails"], status = item["status"];
        if (snippet == null || details == null || status == null || status.Value<bool?>("embeddable") != true || !String.Equals(status.Value<string>("privacyStatus"), "public", StringComparison.OrdinalIgnoreCase)) return null;
        string durationText = details.Value<string>("duration") ?? ""; TimeSpan duration;
        try { duration = XmlConvert.ToTimeSpan(durationText); } catch { return null; }
        if (duration.TotalSeconds < 1 || duration.TotalSeconds > 86400) return null;
        string liveState = snippet.Value<string>("liveBroadcastContent") ?? "none"; if (!String.Equals(liveState, "none", StringComparison.OrdinalIgnoreCase)) return null;
        string thumbnail = Convert.ToString(snippet["thumbnails"]?["medium"]?["url"] ?? snippet["thumbnails"]?["default"]?["url"]) ?? "";
        return new Track { Id = videoId, Title = WebUtility.HtmlDecode(Normalize(snippet.Value<string>("title") ?? "Untitled video")), Channel = WebUtility.HtmlDecode(Normalize(snippet.Value<string>("channelTitle") ?? "YouTube")), ThumbnailUrl = thumbnail.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? thumbnail : "", DurationSeconds = Math.Max(1, (int)Math.Ceiling(duration.TotalSeconds)) };
    }

    private string ExtractVideoId(string input)
    {
        if (VideoIdPattern.IsMatch(input)) return input;
        Uri uri; if (!Uri.TryCreate(input, UriKind.Absolute, out uri) || !String.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase)) return "";
        string host = uri.Host.ToLowerInvariant();
        if (host == "youtu.be") { string id = uri.AbsolutePath.Trim('/').Split('/')[0]; return VideoIdPattern.IsMatch(id) ? id : ""; }
        if (host != "youtube.com" && host != "www.youtube.com" && host != "m.youtube.com") return "";
        if (uri.AbsolutePath.StartsWith("/shorts/", StringComparison.OrdinalIgnoreCase) || uri.AbsolutePath.StartsWith("/embed/", StringComparison.OrdinalIgnoreCase)) { string[] parts = uri.AbsolutePath.Trim('/').Split('/'); string id = parts.Length > 1 ? parts[1] : ""; return VideoIdPattern.IsMatch(id) ? id : ""; }
        foreach (string pair in uri.Query.TrimStart('?').Split('&')) { string[] parts = pair.Split(new[] { '=' }, 2); if (parts.Length == 2 && parts[0] == "v") { string id = Uri.UnescapeDataString(parts[1]); return VideoIdPattern.IsMatch(id) ? id : ""; } }
        return "";
    }

    private JObject RequestJson(string url)
    {
        var request = (HttpWebRequest)WebRequest.Create(url); request.Method = "GET"; request.Accept = "application/json"; request.UserAgent = "THSV-StreamBridge-Village-Jukebox/4.0.7"; request.Timeout = 10000; request.ReadWriteTimeout = 10000;
        using (var response = (HttpWebResponse)request.GetResponse()) using (var stream = response.GetResponseStream()) using (var reader = new StreamReader(stream, Encoding.UTF8, true, 4096, false))
        {
            if (response.StatusCode != HttpStatusCode.OK) throw new WebException("YouTube returned an HTTP error.");
            var text = new StringBuilder(); var buffer = new char[4096]; int read;
            while ((read = reader.Read(buffer, 0, buffer.Length)) > 0) { if (text.Length + read > MaximumResponseCharacters) throw new InvalidDataException("Response exceeded the safety limit."); text.Append(buffer, 0, read); }
            return JObject.Parse(text.ToString());
        }
    }

    private bool Relay(string token, string requestId, bool success, string error, string platform, string userId, string requester, string requestEventId, int pointCost, string rewardPlatform, string rewardId, string redemptionId, Track track)
    {
        var payload = new JObject { ["requestId"] = requestId, ["succeeded"] = success, ["error"] = Bounded(error, 180), ["platform"] = platform, ["userId"] = userId, ["requesterName"] = requester, ["requestEventId"] = requestEventId, ["pointCost"] = pointCost, ["rewardPlatform"] = rewardPlatform, ["rewardId"] = rewardId, ["redemptionId"] = redemptionId };
        if (track != null) { payload["videoId"] = track.Id; payload["title"] = Bounded(track.Title, 200); payload["channel"] = Bounded(track.Channel, 120); payload["thumbnailUrl"] = Bounded(track.ThumbnailUrl, 2048); payload["durationSeconds"] = track.DurationSeconds; }
        var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId, ["eventType"] = "addon.thsv.village-jukebox.track-resolved", ["sourceEventType"] = "THSV Addon - Village Jukebox - Resolve YouTube Track", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token, ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = payload };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); CPH.SetArgument("villageJukeboxResolverSuccess", success); CPH.SetArgument("villageJukeboxResolverError", error); return success; }
        catch (Exception exception) { return Fail("Result relay failed (" + exception.GetType().Name + ")."); }
    }

    private string Read(string name, int maximum) { object value; return CPH.TryGetArg(name, out value) && value != null ? Bounded(Convert.ToString(value) ?? "", maximum) : ""; }
    private int ReadInteger(string name, int minimum, int maximum, int fallback) { object value; int parsed; return CPH.TryGetArg(name, out value) && value != null && Int32.TryParse(Convert.ToString(value), out parsed) ? Math.Max(minimum, Math.Min(maximum, parsed)) : fallback; }
    private string Normalize(string value) { return Regex.Replace(Bounded(value, 400), "[\\x00-\\x1F\\x7F]+", " ").Trim(); }
    private string Bounded(string value, int maximum) { value = value ?? ""; return value.Length <= maximum ? value : value.Substring(0, maximum); }
    private bool IsPlatform(string value) { return value == "twitch" || value == "youtube" || value == "kick" || value == "tiktok"; }
    private bool Fail(string message) { CPH.SetArgument("villageJukeboxResolverSuccess", false); CPH.SetArgument("villageJukeboxResolverError", Bounded(message, 180)); CPH.LogWarn("THSV Village Jukebox: " + Bounded(message, 180)); return false; }
    private sealed class Track { public string Id; public string Title; public string Channel; public string ThumbnailUrl; public int DurationSeconds; }
}
