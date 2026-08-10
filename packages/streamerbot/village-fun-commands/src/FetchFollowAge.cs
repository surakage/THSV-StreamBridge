// Purpose: Looks up the invoking Twitch viewer's follow age with Streamer.bot's
// broadcaster credentials and returns one bounded add-on relay.
// Privacy: OAuth credentials and raw Twitch responses are never logged, relayed, or persisted.
// References: mscorlib.dll, System.dll, System.Core.dll, Newtonsoft.Json.dll.
using System;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.village-fun-commands";
    private const int MaximumResponseCharacters = 65536;

    public bool Execute()
    {
        string relayToken = ReadArgument("thsvAddonRelayToken", 256);
        string requestId = ReadArgument("villageFunRequestId", 100);
        string viewerId = ReadArgument("villageFunViewerId", 180);
        string broadcasterId = ReadArgument("villageFunBroadcasterId", 180);
        string viewerName = ReadArgument("villageFunViewerName", 50);
        string channelName = ReadArgument("villageFunChannelName", 50);
        if (String.IsNullOrWhiteSpace(relayToken) || String.IsNullOrWhiteSpace(requestId)) return Fail("StreamBridge did not dispatch this action.");
        if (!DigitsOnly(viewerId) || !DigitsOnly(broadcasterId)) return Relay(relayToken, requestId, false, "", "missing-twitch-identity");

        string oauthToken = (CPH.TwitchOAuthToken ?? "").Trim();
        string clientId = (CPH.TwitchClientId ?? "").Trim();
        if (oauthToken.StartsWith("oauth:", StringComparison.OrdinalIgnoreCase)) oauthToken = oauthToken.Substring(6);
        if (oauthToken.Length == 0 || clientId.Length == 0)
            return Relay(relayToken, requestId, true, "Follow age is unavailable until the Twitch Broadcaster account is connected in Streamer.bot.", "twitch-not-connected");

        string content;
        string errorCode = "";
        try
        {
            string url = "https://api.twitch.tv/helix/channels/followers?broadcaster_id=" + Uri.EscapeDataString(broadcasterId) + "&user_id=" + Uri.EscapeDataString(viewerId) + "&first=1";
            JObject root = RequestJson(url, oauthToken, clientId);
            JArray data = root["data"] as JArray;
            if (data == null) throw new InvalidDataException("Twitch returned no data array.");
            if (data.Count == 0)
            {
                content = Clean(viewerName, 50) + " is not currently following " + Clean(channelName, 50) + ".";
            }
            else
            {
                DateTimeOffset followedAt;
                string followedText = Convert.ToString(data[0]["followed_at"], CultureInfo.InvariantCulture) ?? "";
                if (!DateTimeOffset.TryParse(followedText, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out followedAt)) throw new InvalidDataException("Twitch returned an invalid follow date.");
                content = FormatFollowAge(Clean(viewerName, 50), Clean(channelName, 50), followedAt);
            }
        }
        catch (WebException exception)
        {
            var response = exception.Response as HttpWebResponse;
            if (response != null && (response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.Forbidden))
            {
                content = "Follow age needs Twitch follower permission. Reconnect the Twitch Broadcaster account in Streamer.bot, then try again.";
                errorCode = "missing-follower-permission";
            }
            else
            {
                content = "Twitch follow age is temporarily unavailable. Please try again later.";
                errorCode = "twitch-unavailable";
            }
        }
        catch
        {
            content = "Twitch follow age is temporarily unavailable. Please try again later.";
            errorCode = "invalid-twitch-response";
        }
        return Relay(relayToken, requestId, true, content, errorCode);
    }

    private JObject RequestJson(string url, string oauthToken, string clientId)
    {
        var request = (HttpWebRequest)WebRequest.Create(url);
        request.Method = "GET";
        request.Accept = "application/json";
        request.UserAgent = "THSV-StreamBridge-Village-Fun/3.5.0";
        request.Timeout = 8000;
        request.ReadWriteTimeout = 8000;
        request.AllowAutoRedirect = false;
        request.Headers["Authorization"] = "Bearer " + oauthToken;
        request.Headers["Client-Id"] = clientId;
        using (var response = (HttpWebResponse)request.GetResponse())
        using (var stream = response.GetResponseStream())
        using (var reader = new StreamReader(stream, Encoding.UTF8, true, 1024, false))
        {
            if (response.StatusCode != HttpStatusCode.OK) throw new WebException("Twitch returned an HTTP error.");
            var builder = new StringBuilder();
            var buffer = new char[2048];
            int read;
            while ((read = reader.Read(buffer, 0, buffer.Length)) > 0)
            {
                if (builder.Length + read > MaximumResponseCharacters) throw new InvalidDataException("Twitch response exceeded the safety limit.");
                builder.Append(buffer, 0, read);
            }
            return JObject.Parse(builder.ToString());
        }
    }

    private string FormatFollowAge(string viewerName, string channelName, DateTimeOffset followedAt)
    {
        DateTime start = followedAt.UtcDateTime;
        DateTime now = DateTime.UtcNow;
        int years = now.Year - start.Year;
        if (start.AddYears(years) > now) years--;
        DateTime afterYears = start.AddYears(years);
        int months = (now.Year - afterYears.Year) * 12 + now.Month - afterYears.Month;
        if (afterYears.AddMonths(months) > now) months--;
        TimeSpan remainder = now - afterYears.AddMonths(months);
        var parts = new System.Collections.Generic.List<string>();
        if (years > 0) parts.Add(years + (years == 1 ? " year" : " years"));
        if (months > 0) parts.Add(months + (months == 1 ? " month" : " months"));
        if (remainder.Days > 0) parts.Add(remainder.Days + (remainder.Days == 1 ? " day" : " days"));
        if (parts.Count == 0 && remainder.Hours > 0) parts.Add(remainder.Hours + (remainder.Hours == 1 ? " hour" : " hours"));
        if (parts.Count == 0) parts.Add(Math.Max(0, remainder.Minutes) + " minutes");
        return viewerName + " has followed " + channelName + " for " + String.Join(", ", parts) + " (since " + followedAt.UtcDateTime.ToString("MMM d, yyyy", CultureInfo.InvariantCulture) + " UTC).";
    }

    private bool Relay(string relayToken, string requestId, bool succeeded, string content, string errorCode)
    {
        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.village-fun-commands.content-received",
            ["sourceEventType"] = "THSV Addon - Village Fun Commands - Twitch Follow Age",
            ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false,
            ["payload"] = new JObject { ["requestId"] = requestId, ["provider"] = "followage", ["succeeded"] = succeeded, ["content"] = Clean(content, 500), ["errorCode"] = errorCode }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); return succeeded; }
        catch { return Fail("Relaying the Twitch follow-age result failed."); }
    }

    private bool DigitsOnly(string value)
    {
        if (String.IsNullOrWhiteSpace(value) || value.Length > 180) return false;
        foreach (char character in value) if (character < '0' || character > '9') return false;
        return true;
    }
    private string Clean(string value, int maximumLength)
    {
        string result = WebUtility.HtmlDecode(value ?? "").Replace("\r", " ").Replace("\n", " ").Trim();
        while (result.Contains("  ")) result = result.Replace("  ", " ");
        return result.Length <= maximumLength ? result : result.Substring(0, maximumLength);
    }
    private string ReadArgument(string name, int maximumLength)
    {
        object value;
        string result = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value) ?? "" : "";
        return result.Length <= maximumLength ? result : result.Substring(0, maximumLength);
    }
    private bool Fail(string reason)
    {
        CPH.SetArgument("villageFunFollowAgeValid", false);
        CPH.SetArgument("villageFunFollowAgeError", "invalid-request");
        CPH.LogWarn("THSV Village Fun Commands: " + reason);
        return false;
    }
}
