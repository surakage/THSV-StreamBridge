// Purpose: Sends one broker-authorized Free Game Check announcement to Discord.
// Privacy: The webhook remains only in this action's private Set Argument and is never logged or relayed.
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
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 100);
        string deliveryId = Read("freeGameDiscordDeliveryId", 100);
        string webhook = Read("freeGameDiscordWebhookUrl", 1500);
        string title = Read("freeGameDiscordTitle", 160);
        string gameUrl = Read("freeGameDiscordUrl", 500);
        string platforms = Read("freeGameDiscordPlatforms", 120);
        string endDate = Read("freeGameDiscordEndDate", 80);
        string mode = Read("freeGameDiscordDestinationMode", 20).ToLowerInvariant();
        string existingThreadId = Snowflake(Read("freeGameDiscordThreadId", 30));

        if (token.Length < 20 || deliveryId.Length == 0) return Fail("broker-authorization-missing");
        if (!ValidWebhook(webhook)) return Fail("invalid-webhook");
        if (title.Length == 0 || !ValidGameUrl(gameUrl) || (mode != "channel" && mode != "forum")) return Fail("invalid-content-link-or-mode");

        string messageId, threadId, error;
        bool success = Send(webhook, title, gameUrl, platforms, endDate, mode,
            Read("freeGameDiscordThreadName", 100), existingThreadId,
            Read("freeGameDiscordWebhookName", 80), out messageId, out threadId, out error);
        Relay(token, deliveryId, success, messageId, threadId, error);
        CPH.SetArgument("freeGameDiscordDeliverySuccess", success);
        CPH.SetArgument("freeGameDiscordDeliveryMessageId", messageId);
        CPH.SetArgument("freeGameDiscordDeliveryThreadId", threadId);
        CPH.SetArgument("freeGameDiscordDeliveryError", error);
        if (!success) CPH.LogWarn("THSV Free Game Check Discord delivery was not confirmed (" + error + ").");
        return success;
    }

    private bool Send(string webhook, string title, string gameUrl, string platforms, string endDate,
        string mode, string threadName, string existingThreadId, string username,
        out string messageId, out string threadId, out string error)
    {
        messageId = ""; threadId = ""; error = "discord-delivery-failed";
        var fields = new JArray();
        if (platforms.Length > 0) fields.Add(new JObject { ["name"] = "Platforms", ["value"] = platforms, ["inline"] = true });
        if (endDate.Length > 0) fields.Add(new JObject { ["name"] = "Offer ends", ["value"] = endDate, ["inline"] = true });
        fields.Add(new JObject { ["name"] = "Get the game", ["value"] = "[Open GamerPower](" + gameUrl + ")", ["inline"] = false });
        var embed = new JObject {
            ["title"] = Bounded(title, 256), ["url"] = gameUrl,
            ["description"] = "A newly listed free game is available.",
            ["color"] = 3066993, ["fields"] = fields,
            ["footer"] = new JObject { ["text"] = "THSV Free Game Check - Powered by GamerPower.com" }
        };
        var payload = new JObject {
            ["username"] = username.Length > 0 ? username : "THSV Free Game Check",
            ["allowed_mentions"] = new JObject { ["parse"] = new JArray() },
            ["embeds"] = new JArray(embed)
        };
        if (mode == "forum" && existingThreadId.Length == 0) {
            if (String.IsNullOrWhiteSpace(threadName)) { error = "missing-forum-thread-name"; return false; }
            payload["thread_name"] = threadName;
        }
        string url = webhook + (webhook.Contains("?") ? "&" : "?");
        if (mode == "forum" && existingThreadId.Length > 0) url += "thread_id=" + Uri.EscapeDataString(existingThreadId) + "&";
        url += "wait=true";
        using (var client = new HttpClient()) {
            client.Timeout = TimeSpan.FromSeconds(10);
            for (int attempt = 0; attempt < 3; attempt++) using (var request = new HttpRequestMessage(HttpMethod.Post, url)) {
                request.Content = new StringContent(payload.ToString(Formatting.None), Encoding.UTF8, "application/json");
                try {
                    using (HttpResponseMessage response = client.SendAsync(request).GetAwaiter().GetResult()) {
                        string body = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                        if (response.StatusCode == (HttpStatusCode)429 && attempt < 2) { Thread.Sleep(RetryMilliseconds(body)); continue; }
                        if (!response.IsSuccessStatusCode) { error = "discord-http-" + ((int)response.StatusCode).ToString(CultureInfo.InvariantCulture); return false; }
                        JObject result; try { result = JObject.Parse(body); } catch { error = "discord-invalid-confirmation"; return false; }
                        messageId = Bounded(Convert.ToString(result["id"], CultureInfo.InvariantCulture) ?? "", 100);
                        threadId = mode == "forum" ? Bounded(Convert.ToString(result["channel_id"], CultureInfo.InvariantCulture) ?? "", 100) : "";
                        if (messageId.Length == 0 || (mode == "forum" && threadId.Length == 0)) { error = "discord-missing-confirmation-id"; return false; }
                        error = ""; return true;
                    }
                } catch (Exception exception) { error = "discord-transport-" + exception.GetType().Name.ToLowerInvariant(); return false; }
            }
        }
        error = "discord-rate-limit-exhausted"; return false;
    }

    private int RetryMilliseconds(string body) { try { double seconds = Convert.ToDouble(JObject.Parse(body)["retry_after"], CultureInfo.InvariantCulture); return (int)Math.Max(250, Math.Min(5000, seconds * 1000)); } catch { return 1000; } }
    private void Relay(string token, string deliveryId, bool success, string messageId, string threadId, string error)
    {
        var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.free-game-check", ["eventType"] = "addon.thsv.free-game-check.discord-result", ["sourceEventType"] = "THSV Addon - Free Game Check - Discord Deliver", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token, ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = new JObject { ["deliveryId"] = deliveryId, ["success"] = success, ["messageId"] = Bounded(messageId, 100), ["threadId"] = Bounded(threadId, 100), ["error"] = Bounded(error, 180) } };
        CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None));
    }
    private bool ValidWebhook(string value) { Uri uri; return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == Uri.UriSchemeHttps && (uri.Host.Equals("discord.com", StringComparison.OrdinalIgnoreCase) || uri.Host.Equals("discordapp.com", StringComparison.OrdinalIgnoreCase)) && String.IsNullOrEmpty(uri.UserInfo) && String.IsNullOrEmpty(uri.Fragment) && uri.AbsolutePath.StartsWith("/api/webhooks/", StringComparison.OrdinalIgnoreCase); }
    private bool ValidGameUrl(string value) { Uri uri; if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || uri.Scheme != Uri.UriSchemeHttps || !String.IsNullOrEmpty(uri.UserInfo)) return false; string host = uri.Host.ToLowerInvariant(); return host == "gamerpower.com" || host == "www.gamerpower.com"; }
    private string Snowflake(string value) { return Regex.IsMatch(value ?? "", "^[0-9]{5,30}$") ? value : ""; }
    private string Read(string name, int max) { object value; string result = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture).Trim() : ""; return Bounded(result, max); }
    private string Bounded(string value, int max) { value = value ?? ""; return value.Length <= max ? value : value.Substring(0, max); }
    private bool Fail(string reason) { CPH.SetArgument("freeGameDiscordDeliverySuccess", false); CPH.SetArgument("freeGameDiscordDeliveryError", reason); CPH.LogError("THSV Free Game Check Discord delivery failed: " + reason); return false; }
}
