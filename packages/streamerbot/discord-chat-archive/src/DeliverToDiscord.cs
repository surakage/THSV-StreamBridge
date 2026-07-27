// Purpose: Delivers one broker-authorized public-chat batch to a Discord channel or forum.
// Privacy: The webhook remains only in the editable Set Argument and is never relayed or logged.
// References: mscorlib.dll, System.dll, System.Core.dll, System.Net.Http.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.discord-chat-archive";
    private const string DeliveryEvent = "addon.thsv.discord-chat-archive.delivery-received";
    private const string PlaceholderWebhook = "REPLACE_WITH_DISCORD_WEBHOOK_URL";

    public bool Execute()
    {
        string relayToken = Read("thsvAddonRelayToken", 256), requestId = Read("discordArchiveRequestId", 100);
        string content = NormalizeMultiline(Read("discordArchiveContent", 1900)), username = NormalizeSingleLine(Read("discordArchiveUsername", 80));
        string avatarUrl = Read("discordArchiveAvatarUrl", 2048), webhookUrl = Read("discordArchiveWebhookUrl", 2048);
        string mode = Read("discordArchiveDestinationMode", 20).ToLowerInvariant(), threadId = ReadSnowflake("discordArchiveThreadId");
        string threadName = NormalizeSingleLine(Read("discordArchiveThreadName", 100)), tagIds = Read("discordArchiveForumTagIds", 200);
        bool simulated = ReadBoolean("discordArchiveSimulated", false), manualTest = String.IsNullOrWhiteSpace(relayToken) && String.IsNullOrWhiteSpace(content);
        if (manualTest) { requestId = "manual-test-" + Guid.NewGuid().ToString("N"); content = "[SETUP TEST] THSV Discord Chat Archive is connected. No viewer message was used."; username = "THSV Chat Archive"; avatarUrl = ""; mode = "channel"; }

        bool succeeded = false; string errorCode = "", messageId = "", returnedThreadId = "";
        if (!manualTest && String.IsNullOrWhiteSpace(relayToken)) errorCode = "missing-relay-token";
        else if (!manualTest && String.IsNullOrWhiteSpace(requestId)) errorCode = "missing-request-id";
        else if (String.IsNullOrWhiteSpace(content)) errorCode = "empty-content";
        else if (simulated) errorCode = "simulated-delivery-blocked";
        else if (!IsAllowedWebhook(webhookUrl)) errorCode = "invalid-webhook";
        else if (mode != "channel" && mode != "forum") errorCode = "invalid-destination-mode";
        else if (mode == "forum" && threadId.Length == 0 && threadName.Length == 0) errorCode = "missing-forum-thread";
        else succeeded = SendDiscord(webhookUrl, content, username, IsHttpsUrl(avatarUrl) ? avatarUrl : "", mode, threadId, threadName, tagIds, out messageId, out returnedThreadId, out errorCode);

        CPH.SetArgument("discordArchiveDeliveryValid", succeeded); CPH.SetArgument("discordArchiveDeliveryRequestId", requestId);
        CPH.SetArgument("discordArchiveDeliveryMessageId", Bounded(messageId, 100)); CPH.SetArgument("discordArchiveDeliveryThreadId", Bounded(returnedThreadId, 100)); CPH.SetArgument("discordArchiveDeliveryErrorCode", errorCode);
        if (!String.IsNullOrWhiteSpace(relayToken) && !RelayResult(relayToken, requestId, succeeded, messageId, returnedThreadId, errorCode)) { CPH.SetArgument("discordArchiveDeliveryValid", false); CPH.SetArgument("discordArchiveDeliveryErrorCode", "result-relay-failed"); return false; }
        if (!succeeded) CPH.LogWarn("THSV Discord Chat Archive did not deliver a batch (" + errorCode + ").");
        return succeeded;
    }

    private bool SendDiscord(string webhook, string content, string username, string avatar, string mode, string threadId, string threadName, string tags, out string messageId, out string returnedThreadId, out string error)
    {
        messageId = ""; returnedThreadId = ""; error = "discord-delivery-failed";
        var payload = new JObject { ["content"] = content, ["username"] = username, ["allowed_mentions"] = new JObject { ["parse"] = new JArray() } };
        if (avatar.Length > 0) payload["avatar_url"] = avatar;
        if (mode == "forum" && threadId.Length == 0) { payload["thread_name"] = threadName; var applied = new JArray(); foreach (string tag in tags.Split(',')) { string id = tag.Trim(); if (Regex.IsMatch(id, "^[0-9]{5,30}$")) applied.Add(id); } if (applied.Count > 0) payload["applied_tags"] = applied; }
        string url = webhook + (webhook.Contains("?") ? "&" : "?") + "wait=true" + (threadId.Length > 0 ? "&thread_id=" + threadId : "");
        using (var client = new HttpClient())
        {
            client.Timeout = TimeSpan.FromSeconds(10);
            for (int attempt = 0; attempt < 3; attempt++)
            {
                using (var request = new HttpRequestMessage(HttpMethod.Post, url))
                {
                    request.Content = new StringContent(payload.ToString(Formatting.None), Encoding.UTF8, "application/json");
                    try
                    {
                        using (HttpResponseMessage response = client.SendAsync(request).GetAwaiter().GetResult())
                        {
                            string body = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                            if (response.StatusCode == (HttpStatusCode)429 && attempt < 2) { Thread.Sleep(RetryMilliseconds(body)); continue; }
                            if (!response.IsSuccessStatusCode) { error = "discord-http-" + ((int)response.StatusCode).ToString(CultureInfo.InvariantCulture); return false; }
                            JObject result; try { result = JObject.Parse(body); } catch { error = "discord-invalid-confirmation"; return false; }
                            messageId = Bounded(Convert.ToString(result["id"], CultureInfo.InvariantCulture) ?? "", 100);
                            returnedThreadId = Bounded(Convert.ToString(result["channel_id"], CultureInfo.InvariantCulture) ?? "", 100);
                            if (mode == "channel") returnedThreadId = "";
                            if (messageId.Length == 0 || (mode == "forum" && returnedThreadId.Length == 0)) { error = "discord-missing-confirmation-id"; return false; }
                            error = ""; return true;
                        }
                    }
                    catch (Exception exception) { error = "discord-transport-" + exception.GetType().Name.ToLowerInvariant(); return false; }
                }
            }
        }
        error = "discord-rate-limit-exhausted"; return false;
    }

    private int RetryMilliseconds(string body) { try { double seconds = Convert.ToDouble(JObject.Parse(body)["retry_after"], CultureInfo.InvariantCulture); return (int)Math.Max(250, Math.Min(5000, seconds * 1000)); } catch { return 1000; } }
    private bool RelayResult(string token, string requestId, bool succeeded, string messageId, string threadId, string errorCode)
    {
        var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId, ["eventType"] = DeliveryEvent, ["sourceEventType"] = "THSV Addon - Discord Chat Archive - Deliver", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token, ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = new JObject { ["requestId"] = requestId, ["succeeded"] = succeeded, ["messageId"] = Bounded(messageId, 100), ["threadId"] = Bounded(threadId, 100), ["errorCode"] = errorCode } };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); return true; } catch (Exception exception) { CPH.LogWarn("THSV Discord Chat Archive result relay failed (" + exception.GetType().Name + ")."); return false; }
    }
    private bool IsAllowedWebhook(string value) { Uri uri; if (!Uri.TryCreate(value, UriKind.Absolute, out uri)) return false; bool host = uri.Host.Equals("discord.com", StringComparison.OrdinalIgnoreCase) || uri.Host.Equals("discordapp.com", StringComparison.OrdinalIgnoreCase); return value != PlaceholderWebhook && uri.Scheme == Uri.UriSchemeHttps && host && String.IsNullOrEmpty(uri.UserInfo) && String.IsNullOrEmpty(uri.Fragment) && uri.AbsolutePath.StartsWith("/api/webhooks/", StringComparison.OrdinalIgnoreCase); }
    private bool IsHttpsUrl(string value) { Uri uri; return !String.IsNullOrWhiteSpace(value) && Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == Uri.UriSchemeHttps && String.IsNullOrEmpty(uri.UserInfo); }
    private string Read(string name, int max) { object value; return CPH.TryGetArg(name, out value) && value != null ? Bounded(Convert.ToString(value, CultureInfo.InvariantCulture) ?? "", max) : ""; }
    private string ReadSnowflake(string name) { string value = Read(name, 30).Trim(); return Regex.IsMatch(value, "^[0-9]{5,30}$") ? value : ""; }
    private bool ReadBoolean(string name, bool fallback) { bool parsed; return Boolean.TryParse(Read(name, 10), out parsed) ? parsed : fallback; }
    private string NormalizeSingleLine(string value) { return Regex.Replace(value ?? "", "[\\x00-\\x1F\\x7F\\s]+", " ").Trim(); }
    private string NormalizeMultiline(string value) { string normalized = (value ?? "").Replace("\r\n", "\n").Replace('\r', '\n'); normalized = Regex.Replace(normalized, "[\\x00-\\x09\\x0B\\x0C\\x0E-\\x1F\\x7F]", " "); normalized = Regex.Replace(normalized, "[ \\t]+", " "); return Regex.Replace(normalized, "\\n{3,}", "\n\n").Trim(); }
    private string Bounded(string value, int max) { value = value ?? ""; return value.Length <= max ? value : value.Substring(0, max); }
}
