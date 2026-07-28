// Purpose: Sends one creator-approved Viewer Spotlight text snapshot to a Discord channel webhook.
// Privacy: The private webhook stays in the Set Argument and is never logged or returned to StreamBridge.
// References: mscorlib.dll, System.dll, System.Core.dll, System.Net.Http.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 100), webhook = Read("viewerSpotlightDiscordWebhookUrl", 1500), message = Read("viewerSpotlightDiscordMessage", 1900), name = Read("viewerSpotlightDiscordWebhookName", 80), mode = Read("viewerSpotlightDiscordMode", 20), threadName = Read("viewerSpotlightDiscordThreadName", 100);
        if (token.Length < 20 || !ValidWebhook(webhook) || message.Length == 0 || (mode != "channel" && mode != "forum") || (mode == "forum" && threadName.Length == 0)) return Fail("The broker token, webhook, message, or destination was invalid.");
        try { using (var client = new HttpClient()) { client.Timeout = TimeSpan.FromSeconds(10); var payload = new JObject { ["content"] = message, ["username"] = name, ["allowed_mentions"] = new JObject { ["parse"] = new JArray() } }; if (mode == "forum") payload["thread_name"] = threadName; using (var response = client.PostAsync(webhook + (webhook.Contains("?") ? "&" : "?") + "wait=true", new StringContent(payload.ToString(Formatting.None), Encoding.UTF8, "application/json")).GetAwaiter().GetResult()) { bool success = response.IsSuccessStatusCode; CPH.SetArgument("viewerSpotlightDiscordSuccess", success); if (!success) CPH.SetArgument("viewerSpotlightDiscordError", "Discord returned HTTP " + ((int)response.StatusCode).ToString() + "."); return success; } } } catch (Exception error) { return Fail("Discord transport failed (" + error.GetType().Name + ")."); }
    }
    private bool ValidWebhook(string value) { Uri uri; return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == Uri.UriSchemeHttps && (uri.Host.Equals("discord.com", StringComparison.OrdinalIgnoreCase) || uri.Host.Equals("discordapp.com", StringComparison.OrdinalIgnoreCase)) && uri.AbsolutePath.StartsWith("/api/webhooks/", StringComparison.OrdinalIgnoreCase) && String.IsNullOrEmpty(uri.UserInfo); }
    private string Read(string key, int max) { object value; string text = CPH.TryGetArg(key, out value) && value != null ? Convert.ToString(value).Trim() : ""; return text.Length <= max ? text : text.Substring(0, max); }
    private bool Fail(string reason) { CPH.SetArgument("viewerSpotlightDiscordSuccess", false); CPH.SetArgument("viewerSpotlightDiscordError", reason); CPH.LogWarn("THSV Viewer Spotlight: " + reason); return false; }
}
