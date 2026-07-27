// Purpose: Sends one broker-authorized Live Beacon notification to a Discord channel or forum.
// Privacy: The private webhook remains only in the Set Argument and is never logged or relayed.
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
        string token = Read("thsvAddonRelayToken", 100), webhook = Read("liveBeaconWebhookUrl", 1500), content = Read("liveBeaconMessage", 2000);
        string mode = Read("liveBeaconDestinationMode", 20).ToLowerInvariant(), deliveryId = Read("liveBeaconDeliveryId", 500), roleId = Snowflake(Read("liveBeaconAllowedRoleId", 30));
        if (token.Length < 20 || deliveryId.Length == 0) return Fail("broker-authorization-missing");
        if (!ValidWebhook(webhook)) return Fail("invalid-webhook");
        if (content.Length == 0 || (mode != "channel" && mode != "forum")) return Fail("invalid-content-or-mode");
        string messageId, threadId, error; bool success = Send(webhook, content, Read("liveBeaconWebhookName", 80), mode, Read("liveBeaconThreadName", 100), roleId, out messageId, out threadId, out error);
        Relay(token, deliveryId, success, mode, messageId, threadId, error);
        CPH.SetArgument("liveBeaconDeliverySuccess", success); CPH.SetArgument("liveBeaconDeliveryMessageId", messageId); CPH.SetArgument("liveBeaconDeliveryThreadId", threadId); CPH.SetArgument("liveBeaconDeliveryError", error);
        if (!success) CPH.LogWarn("THSV Live Beacon delivery was not confirmed (" + error + ")."); return success;
    }
    private bool Send(string webhook, string content, string username, string mode, string threadName, string roleId, out string messageId, out string threadId, out string error)
    {
        messageId = ""; threadId = ""; error = "discord-delivery-failed";
        var mentions = roleId.Length > 0 ? new JObject { ["parse"] = new JArray(), ["roles"] = new JArray(roleId) } : new JObject { ["parse"] = new JArray() };
        var payload = new JObject { ["content"] = content, ["username"] = username, ["allowed_mentions"] = mentions };
        if (mode == "forum") { if (String.IsNullOrWhiteSpace(threadName)) { error = "missing-forum-thread-name"; return false; } payload["thread_name"] = threadName; }
        string url = webhook + (webhook.Contains("?") ? "&" : "?") + "wait=true";
        using (var client = new HttpClient()) { client.Timeout = TimeSpan.FromSeconds(10); for (int attempt = 0; attempt < 3; attempt++) using (var request = new HttpRequestMessage(HttpMethod.Post, url)) { request.Content = new StringContent(payload.ToString(Formatting.None), Encoding.UTF8, "application/json"); try { using (HttpResponseMessage response = client.SendAsync(request).GetAwaiter().GetResult()) { string body = response.Content.ReadAsStringAsync().GetAwaiter().GetResult(); if (response.StatusCode == (HttpStatusCode)429 && attempt < 2) { Thread.Sleep(RetryMilliseconds(body)); continue; } if (!response.IsSuccessStatusCode) { error = "discord-http-" + ((int)response.StatusCode).ToString(CultureInfo.InvariantCulture); return false; } JObject result; try { result = JObject.Parse(body); } catch { error = "discord-invalid-confirmation"; return false; } messageId = Bounded(Convert.ToString(result["id"], CultureInfo.InvariantCulture) ?? "", 100); threadId = mode == "forum" ? Bounded(Convert.ToString(result["channel_id"], CultureInfo.InvariantCulture) ?? "", 100) : ""; if (messageId.Length == 0 || (mode == "forum" && threadId.Length == 0)) { error = "discord-missing-confirmation-id"; return false; } error = ""; return true; } } catch (Exception exception) { error = "discord-transport-" + exception.GetType().Name.ToLowerInvariant(); return false; } } }
        error = "discord-rate-limit-exhausted"; return false;
    }
    private int RetryMilliseconds(string body) { try { double seconds = Convert.ToDouble(JObject.Parse(body)["retry_after"], CultureInfo.InvariantCulture); return (int)Math.Max(250, Math.Min(5000, seconds * 1000)); } catch { return 1000; } }
    private void Relay(string token, string deliveryId, bool success, string mode, string messageId, string threadId, string error) { var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.live-beacon", ["eventType"] = "addon.thsv.live-beacon.delivery-result", ["sourceEventType"] = "THSV Addon - Live Beacon - Deliver", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token, ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = new JObject { ["deliveryId"] = deliveryId, ["success"] = success, ["mode"] = mode, ["messageId"] = Bounded(messageId, 100), ["threadId"] = Bounded(threadId, 100), ["error"] = Bounded(error, 200) } }; CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
    private bool ValidWebhook(string value) { Uri uri; return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == Uri.UriSchemeHttps && (uri.Host.Equals("discord.com", StringComparison.OrdinalIgnoreCase) || uri.Host.Equals("discordapp.com", StringComparison.OrdinalIgnoreCase)) && String.IsNullOrEmpty(uri.UserInfo) && String.IsNullOrEmpty(uri.Fragment) && uri.AbsolutePath.StartsWith("/api/webhooks/", StringComparison.OrdinalIgnoreCase); }
    private string Snowflake(string value) { return Regex.IsMatch(value ?? "", "^[0-9]{5,30}$") ? value : ""; }
    private string Read(string name, int max) { object value; string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture).Trim() : ""; return Bounded(text, max); }
    private string Bounded(string value, int max) { value = value ?? ""; return value.Length <= max ? value : value.Substring(0, max); }
    private bool Fail(string reason) { CPH.SetArgument("liveBeaconDeliverySuccess", false); CPH.SetArgument("liveBeaconDeliveryError", reason); CPH.LogError("THSV Live Beacon delivery failed: " + reason); return false; }
}
