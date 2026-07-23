// Purpose: Delivers one bounded Discord Chat Archive batch through Streamer.bot's documented
// Discord webhook method, then returns a correlated result to the requesting add-on.
// Privacy: The webhook URL stays in the editable Set Argument above this code. It is never
// returned to StreamBridge, written to a file, or included in logs.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.discord-chat-archive";
    private const string DeliveryEvent = "addon.thsv.discord-chat-archive.delivery-received";
    private const string PlaceholderWebhook = "REPLACE_WITH_DISCORD_WEBHOOK_URL";
    private const int MaximumContentCharacters = 1900;

    public bool Execute()
    {
        string relayToken = ReadArgument("thsvAddonRelayToken", 256);
        string requestId = ReadArgument("discordArchiveRequestId", 100);
        string content = NormalizeMultiline(ReadArgument("discordArchiveContent", MaximumContentCharacters));
        string username = NormalizeSingleLine(ReadArgument("discordArchiveUsername", 80));
        string avatarUrl = ReadArgument("discordArchiveAvatarUrl", 2048);
        string webhookUrl = ReadArgument("discordArchiveWebhookUrl", 2048);
        bool simulated = ReadBoolean("discordArchiveSimulated", false);
        bool manualTest = String.IsNullOrWhiteSpace(relayToken) && String.IsNullOrWhiteSpace(content);

        if (manualTest)
        {
            requestId = "manual-test-" + Guid.NewGuid().ToString("N");
            content = "[SETUP TEST] THSV Discord Chat Archive is connected. No viewer message was used.";
            username = "THSV Chat Archive";
            avatarUrl = "";
        }

        bool succeeded = false;
        string errorCode = "";
        string messageId = "";

        if (!manualTest && String.IsNullOrWhiteSpace(relayToken)) errorCode = "missing-relay-token";
        else if (!manualTest && String.IsNullOrWhiteSpace(requestId)) errorCode = "missing-request-id";
        else if (String.IsNullOrWhiteSpace(content)) errorCode = "empty-content";
        else if (simulated) errorCode = "simulated-delivery-blocked";
        else if (!IsAllowedWebhook(webhookUrl)) errorCode = "invalid-webhook";
        else
        {
            try
            {
                string safeContent = Regex.Replace(content, "@(?!\u200B)", "@\u200B");
                messageId = CPH.DiscordPostTextToWebhook(webhookUrl, safeContent, username, IsHttpsUrl(avatarUrl) ? avatarUrl : "", false);
                succeeded = !String.IsNullOrWhiteSpace(messageId);
                if (!succeeded) errorCode = "discord-returned-no-message-id";
            }
            catch (Exception exception)
            {
                errorCode = "discord-delivery-failed";
                CPH.LogWarn("THSV Discord Chat Archive delivery failed (" + exception.GetType().Name + ").");
            }
        }

        CPH.SetArgument("discordArchiveDeliveryValid", succeeded);
        CPH.SetArgument("discordArchiveDeliveryRequestId", requestId);
        CPH.SetArgument("discordArchiveDeliveryMessageId", Bounded(messageId, 100));
        CPH.SetArgument("discordArchiveDeliveryErrorCode", errorCode);

        if (!String.IsNullOrWhiteSpace(relayToken) && !RelayResult(relayToken, requestId, succeeded, errorCode))
        {
            CPH.SetArgument("discordArchiveDeliveryValid", false);
            CPH.SetArgument("discordArchiveDeliveryErrorCode", "result-relay-failed");
            return false;
        }

        if (!succeeded) CPH.LogWarn("THSV Discord Chat Archive did not deliver a batch (" + errorCode + ").");
        return succeeded;
    }

    private bool RelayResult(string relayToken, string requestId, bool succeeded, string errorCode)
    {
        var envelope = new JObject
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = DeliveryEvent,
            ["sourceEventType"] = "THSV Addon - Discord Chat Archive - Deliver",
            ["relayId"] = Guid.NewGuid().ToString("N"),
            ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false,
            ["payload"] = new JObject
            {
                ["requestId"] = requestId,
                ["succeeded"] = succeeded,
                ["errorCode"] = errorCode
            }
        };
        try
        {
            CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None));
            return true;
        }
        catch (Exception exception)
        {
            CPH.LogWarn("THSV Discord Chat Archive result relay failed (" + exception.GetType().Name + ").");
            return false;
        }
    }

    private bool IsAllowedWebhook(string value)
    {
        Uri uri;
        if (!Uri.TryCreate(value, UriKind.Absolute, out uri)) return false;
        bool allowedHost = String.Equals(uri.Host, "discord.com", StringComparison.OrdinalIgnoreCase)
            || String.Equals(uri.Host, "discordapp.com", StringComparison.OrdinalIgnoreCase);
        return value != PlaceholderWebhook
            && String.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            && allowedHost
            && String.IsNullOrEmpty(uri.UserInfo)
            && String.IsNullOrEmpty(uri.Fragment)
            && uri.AbsolutePath.StartsWith("/api/webhooks/", StringComparison.OrdinalIgnoreCase);
    }

    private bool IsHttpsUrl(string value)
    {
        Uri uri;
        return !String.IsNullOrWhiteSpace(value)
            && Uri.TryCreate(value, UriKind.Absolute, out uri)
            && String.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            && String.IsNullOrEmpty(uri.UserInfo);
    }

    private string ReadArgument(string name, int maximumLength)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? Bounded(Convert.ToString(value) ?? "", maximumLength) : "";
    }

    private bool ReadBoolean(string name, bool fallback)
    {
        bool parsed;
        return Boolean.TryParse(ReadArgument(name, 10), out parsed) ? parsed : fallback;
    }

    private string NormalizeSingleLine(string value)
    {
        return Regex.Replace(value ?? "", "[\\x00-\\x1F\\x7F\\s]+", " ").Trim();
    }

    private string NormalizeMultiline(string value)
    {
        string normalized = (value ?? "").Replace("\r\n", "\n").Replace('\r', '\n');
        normalized = Regex.Replace(normalized, "[\\x00-\\x09\\x0B\\x0C\\x0E-\\x1F\\x7F]", " ");
        normalized = Regex.Replace(normalized, "[ \\t]+", " ");
        normalized = Regex.Replace(normalized, "\\n{3,}", "\n\n");
        return normalized.Trim();
    }

    private string Bounded(string value, int maximumLength)
    {
        if (String.IsNullOrEmpty(value)) return "";
        return value.Length <= maximumLength ? value : value.Substring(0, maximumLength);
    }
}
