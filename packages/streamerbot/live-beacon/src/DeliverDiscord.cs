// Purpose: Sends one broker-authorized Live Beacon notification to a Discord channel or forum.
// Privacy: The private webhook remains only in the Set Argument and is never logged or relayed.
// References: mscorlib.dll, System.dll, System.Core.dll, System.Net.Http.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        bool validateOnly;
        if (CPH.TryGetArg("liveBeaconValidateOnly", out validateOnly) && validateOnly)
        {
            bool valid = ValidPlatform(Read("liveBeaconPlatform", 20)) && ValidLiveUrl(Read("liveBeaconUrl", 500), Read("liveBeaconPlatform", 20));
            CPH.LogInfo("THSV Live Beacon offline link validation: " + valid + "; no delivery sent.");
            return valid;
        }
        bool previewOnly;
        if (CPH.TryGetArg("liveBeaconPreviewOnly", out previewOnly) && previewOnly) {
            string previewPlatform = Read("liveBeaconPlatform", 20), previewTitle = Read("liveBeaconTitle", 200), previewCategory = Read("liveBeaconCategory", 100), previewStart = Read("liveBeaconStartedAt", 100), previewName = Read("liveBeaconChannelName", 100), previewProfile = Read("liveBeaconProfileImageUrl", 2048), previewArt = Read("liveBeaconCategoryArtUrl", 2048), previewThumbnail = Read("liveBeaconThumbnailUrl", 2048), previewSource = Read("liveBeaconMetadataSource", 20);
            if (ReadBoolean("liveBeaconPreviewEnrich", false)) EnrichFromTwitch(previewPlatform, true, true, ref previewTitle, ref previewCategory, ref previewStart, ref previewName, ref previewProfile, ref previewArt, ref previewThumbnail, ref previewSource);
            var preview = BuildEmbed(previewPlatform, Read("liveBeaconUrl", 500), previewTitle, previewCategory, previewStart, Read("liveBeaconMessage", 1000), previewName, previewProfile, previewArt, previewThumbnail, previewSource, ReadBoolean("liveBeaconShowArtwork", true));
            CPH.WebsocketBroadcastJson(new JObject { ["type"] = "thsv.live-beacon.preview", ["embed"] = preview }.ToString(Formatting.None));
            return true;
        }
        string token = Read("thsvAddonRelayToken", 100), content = Read("liveBeaconMessage", 2000);
        string mode = Read("liveBeaconDestinationMode", 20).ToLowerInvariant(), deliveryId = Read("liveBeaconDeliveryId", 500), roleId = Snowflake(Read("liveBeaconAllowedRoleId", 30)), existingThreadId = Snowflake(Read("liveBeaconThreadId", 30));
        string platform = Read("liveBeaconPlatform", 20).ToLowerInvariant(), liveUrl = Read("liveBeaconUrl", 500), title = Read("liveBeaconTitle", 500), category = Read("liveBeaconCategory", 200), startedAt = Read("liveBeaconStartedAt", 100), forumWelcome = Read("liveBeaconForumWelcome", 1500);
        string webhook = PlatformWebhook(platform);
        if (token.Length < 20 || deliveryId.Length == 0) return Fail("broker-authorization-missing");
        if (!ValidWebhook(webhook)) return Fail("invalid-webhook");
        if (content.Length == 0 || !ValidPlatform(platform) || !ValidLiveUrl(liveUrl, platform) || (mode != "channel" && mode != "forum")) return Fail("invalid-content-link-or-mode");
        string messageId, threadId, error; bool success = Send(webhook, content, Read("liveBeaconWebhookName", 80), mode, Read("liveBeaconThreadName", 100), existingThreadId, forumWelcome, roleId, platform, liveUrl, title, category, startedAt, out messageId, out threadId, out error);
        Relay(token, deliveryId, platform, success, mode, messageId, threadId, error);
        CPH.SetArgument("liveBeaconDeliverySuccess", success); CPH.SetArgument("liveBeaconDeliveryMessageId", messageId); CPH.SetArgument("liveBeaconDeliveryThreadId", threadId); CPH.SetArgument("liveBeaconDeliveryError", error);
        if (!success) CPH.LogWarn("THSV Live Beacon delivery was not confirmed (" + error + ")."); return success;
    }
    private bool Send(string webhook, string content, string username, string mode, string threadName, string existingThreadId, string forumWelcome, string roleId, string platform, string liveUrl, string title, string category, string startedAt, out string messageId, out string threadId, out string error)
    {
        messageId = ""; threadId = ""; error = "discord-delivery-failed";
        var mentions = roleId.Length > 0 ? new JObject { ["parse"] = new JArray(), ["roles"] = new JArray(roleId) } : new JObject { ["parse"] = new JArray() };
        string channelName = Read("liveBeaconChannelName", 100), profile = Read("liveBeaconProfileImageUrl", 2048), art = Read("liveBeaconCategoryArtUrl", 2048), thumbnail = Read("liveBeaconThumbnailUrl", 2048), metadataSource = Read("liveBeaconMetadataSource", 20);
        bool share = ReadBoolean("liveBeaconShareMetadata", true), showArtwork = ReadBoolean("liveBeaconShowArtwork", true);
        EnrichFromTwitch(platform, share, showArtwork, ref title, ref category, ref startedAt, ref channelName, ref profile, ref art, ref thumbnail, ref metadataSource);
        string template = Read("liveBeaconMessageTemplate", 1000);
        if (template.Length > 0) content = template.Replace("{platforms}", PlatformLabel(platform)).Replace("{platform}", PlatformLabel(platform)).Replace("{links}", liveUrl).Replace("{url}", liveUrl).Replace("{title}", title).Replace("{category}", category).Replace("{startedAt}", startedAt);
        var embed = BuildEmbed(platform, liveUrl, title, category, startedAt, content, channelName, profile, art, thumbnail, metadataSource, showArtwork);
        var payload = new JObject { ["username"] = username, ["allowed_mentions"] = mentions, ["embeds"] = new JArray(embed) };
        if (showArtwork && SafeImage(profile).Length > 0) payload["avatar_url"] = SafeImage(profile);
        string messageContent = "";
        if (roleId.Length > 0) messageContent = "<@&" + roleId + ">";
        if (mode == "forum" && existingThreadId.Length == 0 && forumWelcome.Length > 0) messageContent = (messageContent.Length > 0 ? messageContent + "\n\n" : "") + forumWelcome;
        if (messageContent.Length > 0) payload["content"] = Bounded(messageContent, 2000);
        if (mode == "forum" && existingThreadId.Length == 0) { if (String.IsNullOrWhiteSpace(threadName)) { error = "missing-forum-thread-name"; return false; } payload["thread_name"] = threadName; }
        string url = webhook + (webhook.Contains("?") ? "&" : "?");
        if (mode == "forum" && existingThreadId.Length > 0) url += "thread_id=" + Uri.EscapeDataString(existingThreadId) + "&";
        url += "wait=true";
        using (var client = new HttpClient()) { client.Timeout = TimeSpan.FromSeconds(10); for (int attempt = 0; attempt < 3; attempt++) using (var request = new HttpRequestMessage(HttpMethod.Post, url)) { request.Content = new StringContent(payload.ToString(Formatting.None), Encoding.UTF8, "application/json"); try { using (HttpResponseMessage response = client.SendAsync(request).GetAwaiter().GetResult()) { string body = response.Content.ReadAsStringAsync().GetAwaiter().GetResult(); if (response.StatusCode == (HttpStatusCode)429 && attempt < 2) { Thread.Sleep(RetryMilliseconds(body)); continue; } if (!response.IsSuccessStatusCode) { error = "discord-http-" + ((int)response.StatusCode).ToString(CultureInfo.InvariantCulture); return false; } JObject result; try { result = JObject.Parse(body); } catch { error = "discord-invalid-confirmation"; return false; } messageId = Bounded(Convert.ToString(result["id"], CultureInfo.InvariantCulture) ?? "", 100); threadId = mode == "forum" ? Bounded(Convert.ToString(result["channel_id"], CultureInfo.InvariantCulture) ?? "", 100) : ""; if (messageId.Length == 0 || (mode == "forum" && threadId.Length == 0)) { error = "discord-missing-confirmation-id"; return false; } error = ""; return true; } } catch (Exception exception) { error = "discord-transport-" + exception.GetType().Name.ToLowerInvariant(); return false; } } }
        error = "discord-rate-limit-exhausted"; return false;
    }
    private JObject BuildEmbed(string platform, string liveUrl, string title, string category, string startedAt, string content, string channelName, string profile, string art, string thumbnail, string metadataSource, bool showArtwork)
    {
        var embed = new JObject {
            ["title"] = "🔴 LIVE · " + PlatformLabel(platform), ["url"] = liveUrl,
            ["description"] = Bounded(content, 1000), ["color"] = PlatformColor(platform),
            ["footer"] = new JObject { ["text"] = "THSV Live Beacon" + (ValidPlatform(metadataSource) && metadataSource != platform ? " · Shared details from " + PlatformLabel(metadataSource) : "") }
        };
        var author = new JObject { ["name"] = Bounded(channelName.Length > 0 ? channelName + " · Join the stream" : "Join the stream", 256), ["url"] = liveUrl };
        if (showArtwork && SafeImage(profile).Length > 0) author["icon_url"] = SafeImage(profile);
        embed["author"] = author;
        if (showArtwork && SafeImage(art).Length > 0) embed["thumbnail"] = new JObject { ["url"] = SafeImage(art) };
        else if (showArtwork && SafeImage(profile).Length > 0) embed["thumbnail"] = new JObject { ["url"] = SafeImage(profile) };
        if (showArtwork && SafeImage(thumbnail).Length > 0) embed["image"] = new JObject { ["url"] = SafeImage(thumbnail) };
        var fields = new JArray {
            new JObject { ["name"] = "Stream title", ["value"] = title.Length > 0 ? Bounded(title, 500) : "Not supplied by the connected platforms", ["inline"] = false },
            new JObject { ["name"] = "Game / Category", ["value"] = category.Length > 0 ? Bounded(category, 200) : "Not supplied by the connected platforms", ["inline"] = true },
            new JObject { ["name"] = "Direct link", ["value"] = "[▶ Watch live on " + PlatformLabel(platform) + "](" + liveUrl + ")", ["inline"] = true }
        };
        DateTimeOffset parsedStart;
        if (DateTimeOffset.TryParse(startedAt, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out parsedStart)) {
            long unix = parsedStart.ToUniversalTime().ToUnixTimeSeconds();
            embed["timestamp"] = parsedStart.ToUniversalTime().ToString("O");
            fields.Add(new JObject { ["name"] = "Started", ["value"] = "<t:" + unix.ToString(CultureInfo.InvariantCulture) + ":F>\n<t:" + unix.ToString(CultureInfo.InvariantCulture) + ":R>", ["inline"] = false });
        }
        embed["fields"] = fields;
        return embed;
    }
    private bool ReadBoolean(string name, bool fallback) { bool value; return CPH.TryGetArg(name, out value) ? value : fallback; }
    private string SafeImage(string value) { Uri uri; return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == Uri.UriSchemeHttps && String.IsNullOrEmpty(uri.UserInfo) ? Bounded(uri.AbsoluteUri, 2048) : ""; }
    private JObject FirstHelix(HttpClient client, string path, string token, string clientId, DateTime deadline)
    {
        int remaining = (int)(deadline - DateTime.UtcNow).TotalMilliseconds;
        if (remaining < 100) return null;
        try {
            using (var request = new HttpRequestMessage(HttpMethod.Get, "https://api.twitch.tv/helix/" + path))
            using (var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(remaining))) {
                request.Headers.Add("Client-ID", clientId); request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                using (var response = client.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellation.Token).GetAwaiter().GetResult()) {
                    if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength > 524288) return null;
                    string body = response.Content.ReadAsStringAsync().GetAwaiter().GetResult(); if (body.Length > 524288) return null;
                    var data = JObject.Parse(body)["data"] as JArray; return data != null && data.Count > 0 ? data[0] as JObject : null;
                }
            }
        } catch { return null; }
    }
    private void EnrichFromTwitch(string platform, bool share, bool showArtwork, ref string title, ref string category, ref string startedAt, ref string channelName, ref string profile, ref string art, ref string thumbnail, ref string metadataSource)
    {
        // This is read-only and optional. A failed metadata request must never prevent delivery.
        // Cross-platform title/category/preview data is taken only from a currently live stream.
        try {
            string token = CPH.TwitchOAuthToken, clientId = CPH.TwitchClientId;
            var broadcaster = CPH.TwitchGetBroadcaster();
            if (broadcaster == null || String.IsNullOrWhiteSpace(token) || String.IsNullOrWhiteSpace(clientId)) return;
            string userId = broadcaster.UserId; DateTime deadline = DateTime.UtcNow.AddSeconds(4);
            using (var client = new HttpClient()) {
                client.Timeout = TimeSpan.FromSeconds(4);
                JObject stream = (share || platform == "twitch") ? FirstHelix(client, "streams?user_id=" + Uri.EscapeDataString(userId), token, clientId, deadline) : null;
                if (stream != null) {
                    string liveCategory = Bounded((string)stream["game_name"] ?? "", 100);
                    if (title.Length == 0) { title = Bounded((string)stream["title"] ?? "", 200); if (title.Length > 0 && platform != "twitch") metadataSource = "twitch"; }
                    if (category.Length == 0) { category = liveCategory; if (category.Length > 0 && platform != "twitch") metadataSource = "twitch"; }
                    if (platform == "twitch" && !String.IsNullOrWhiteSpace((string)stream["started_at"])) startedAt = (string)stream["started_at"];
                    if (showArtwork && thumbnail.Length == 0 && (platform == "twitch" || (category.Length > 0 && String.Equals(category, liveCategory, StringComparison.OrdinalIgnoreCase)))) thumbnail = ((string)stream["thumbnail_url"] ?? "").Replace("{width}", "1280").Replace("{height}", "720");
                }
                if (!showArtwork) return;
                if (profile.Length == 0) { var user = FirstHelix(client, "users?id=" + Uri.EscapeDataString(userId), token, clientId, deadline); if (user != null) { profile = SafeImage((string)user["profile_image_url"] ?? ""); if (channelName.Length == 0) channelName = Bounded((string)user["display_name"] ?? "", 100); } }
                if (art.Length == 0 && category.Length > 0) { var game = FirstHelix(client, "games?name=" + Uri.EscapeDataString(category), token, clientId, deadline); if (game != null) art = ((string)game["box_art_url"] ?? "").Replace("{width}", "240").Replace("{height}", "320"); }
            }
        } catch { /* Missing account, authorization, or artwork does not block the notification. */ }
    }

    private int RetryMilliseconds(string body) { try { double seconds = Convert.ToDouble(JObject.Parse(body)["retry_after"], CultureInfo.InvariantCulture); return (int)Math.Max(250, Math.Min(5000, seconds * 1000)); } catch { return 1000; } }
    private void Relay(string token, string deliveryId, string platform, bool success, string mode, string messageId, string threadId, string error) { var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.live-beacon", ["eventType"] = "addon.thsv.live-beacon.delivery-result", ["sourceEventType"] = "THSV Addon - Live Beacon - Deliver", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token, ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = new JObject { ["deliveryId"] = deliveryId, ["platform"] = platform, ["success"] = success, ["mode"] = mode, ["messageId"] = Bounded(messageId, 100), ["threadId"] = Bounded(threadId, 100), ["error"] = Bounded(error, 200) } }; CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
    private bool ValidWebhook(string value) { Uri uri; return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == Uri.UriSchemeHttps && (uri.Host.Equals("discord.com", StringComparison.OrdinalIgnoreCase) || uri.Host.Equals("discordapp.com", StringComparison.OrdinalIgnoreCase)) && String.IsNullOrEmpty(uri.UserInfo) && String.IsNullOrEmpty(uri.Fragment) && uri.AbsolutePath.StartsWith("/api/webhooks/", StringComparison.OrdinalIgnoreCase); }
    private string PlatformWebhook(string platform)
    {
        string platformValue = Read("liveBeacon" + PlatformArgumentName(platform) + "WebhookUrl", 1500);
        return platformValue.Length > 0 ? platformValue : Read("liveBeaconWebhookUrl", 1500);
    }
    private string PlatformArgumentName(string platform) { if (platform == "youtube") return "YouTube"; if (platform == "tiktok") return "TikTok"; if (platform.Length == 0) return ""; return Char.ToUpperInvariant(platform[0]) + platform.Substring(1); }
    private bool ValidPlatform(string value) { return value == "twitch" || value == "youtube" || value == "kick" || value == "tiktok" || value == "facebook"; }
    private bool ValidLiveUrl(string value, string platform) { Uri uri; if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || uri.Scheme != Uri.UriSchemeHttps || !String.IsNullOrEmpty(uri.UserInfo)) return false; string host = uri.Host.ToLowerInvariant(); if (host.StartsWith("www.")) host = host.Substring(4); if (platform == "twitch") return host == "twitch.tv"; if (platform == "youtube") return host == "youtube.com" || host == "youtu.be"; if (platform == "kick") return host == "kick.com"; if (platform == "facebook") return host == "facebook.com" || host == "m.facebook.com"; return platform == "tiktok" && host == "tiktok.com"; }
    private string PlatformLabel(string value) { if (value == "youtube") return "YouTube"; if (value == "tiktok") return "TikTok"; if (value.Length == 0) return "Stream"; return Char.ToUpperInvariant(value[0]) + value.Substring(1); }
    private int PlatformColor(string value) { if (value == "twitch") return 9529087; if (value == "youtube") return 16711680; if (value == "kick") return 5504024; if (value == "facebook") return 1603570; return 2487534; }
    private string Snowflake(string value) { return Regex.IsMatch(value ?? "", "^[0-9]{5,30}$") ? value : ""; }
    private string Read(string name, int max) { object value; string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture).Trim() : ""; return Bounded(text, max); }
    private string Bounded(string value, int max) { value = value ?? ""; return value.Length <= max ? value : value.Substring(0, max); }
    private bool Fail(string reason) { CPH.SetArgument("liveBeaconDeliverySuccess", false); CPH.SetArgument("liveBeaconDeliveryError", reason); CPH.LogError("THSV Live Beacon delivery failed: " + reason); return false; }
}
